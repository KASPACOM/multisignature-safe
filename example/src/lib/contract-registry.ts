/**
 * Реестр контрактов для управления ABI и метаданными
 * Теперь загружает контракты из Safe Transaction Service API
 */

import { ContractABI, ParsedFunction } from './contract-types'
import { ContractsAPI } from './contracts-api'

export class ContractRegistry {
  private static instance: ContractRegistry
  private contracts: Map<string, ContractABI> = new Map()
  private contractsAPI: ContractsAPI | null = null
  private isLoading = false
  private loadingPromise: Promise<void> | null = null

  private constructor() {
    // Конструктор пустой, инициализация будет в loadContracts()
  }

  static getInstance(): ContractRegistry {
    if (!ContractRegistry.instance) {
      ContractRegistry.instance = new ContractRegistry()
    }
    return ContractRegistry.instance
  }

  /**
   * Инициализирует API клиент для заданного chainId
   */
  initializeForChain(chainId: bigint): void {
    console.log(`🔗 Инициализируем ContractRegistry для chainId: ${chainId}`)
    this.contractsAPI = new ContractsAPI(chainId)
    
    // Очищаем предыдущие контракты при смене сети
    this.contracts.clear()
    this.loadingPromise = null
  }

  /**
   * Загружает контракты из Safe Transaction Service API
   */
  async loadContracts(options?: {
    limit?: number
    offset?: number
    trusted?: boolean
    forceReload?: boolean
  }): Promise<void> {
    if (!this.contractsAPI) {
      throw new Error('ContractRegistry не инициализирован. Вызовите initializeForChain() сначала.')
    }

    // Если уже загружаем, ждем завершения текущей загрузки
    if (this.isLoading && this.loadingPromise) {
      console.log('⏳ Контракты уже загружаются, ждем завершения...')
      return this.loadingPromise
    }

    // Если уже загружены и не требуется перезагрузка
    if (this.contracts.size > 0 && !options?.forceReload) {
      console.log(`✅ Контракты уже загружены: ${this.contracts.size}`)
      return
    }

    console.log('🚀 Начинаем загрузку контрактов из API...')
    this.isLoading = true

    this.loadingPromise = this.performLoad(options)
    
    try {
      await this.loadingPromise
    } finally {
      this.isLoading = false
      this.loadingPromise = null
    }
  }

  private async performLoad(options?: {
    limit?: number
    offset?: number
    trusted?: boolean
  }): Promise<void> {
    try {
      const contracts = await this.contractsAPI!.getContracts(options)
      
      console.log(`📦 Получено контрактов из API: ${contracts.length}`)
      
      // Очищаем старые контракты
      this.contracts.clear()
      
      // Добавляем новые контракты
      contracts.forEach(contract => {
        this.addContract(contract)
      })

      console.log(`✅ Успешно загружено контрактов: ${this.contracts.size}`)
      
    } catch (error: any) {
      console.error('❌ Ошибка загрузки контрактов:', error)
      throw new Error(`Не удалось загрузить контракты: ${error.message}`)
    }
  }

  /**
   * Добавляет контракт в реестр
   */
  addContract(contract: ContractABI): void {
    const key = contract.address.toLowerCase()
    
    // Убеждаемся, что parsedFunctions установлены
    if (!contract.parsedFunctions) {
      console.warn(`⚠️ Контракт ${contract.name} не имеет parsedFunctions, пропускаем`)
      return
    }
    
    this.contracts.set(key, contract)
    
    console.log(`📝 Добавлен контракт ${contract.name} (${contract.address})`)
    console.log(`   Функций для Safe: ${contract.parsedFunctions.length}`)
  }

  /**
   * Получает контракт по адресу
   */
  getContract(address: string): ContractABI | null {
    const key = address.toLowerCase()
    return this.contracts.get(key) || null
  }

  /**
   * Получает все контракты
   */
  getAllContracts(): ContractABI[] {
    return Array.from(this.contracts.values())
  }

  /**
   * Получает функции контракта
   */
  getContractFunctions(address: string): ParsedFunction[] {
    const contract = this.getContract(address)
    return contract?.parsedFunctions || []
  }

  /**
   * Получает функцию по адресу контракта и имени функции
   */
  getFunction(address: string, functionName: string): ParsedFunction | null {
    const functions = this.getContractFunctions(address)
    return functions.find(func => func.name === functionName) || null
  }

  /**
   * Проверяет, существует ли контракт
   */
  hasContract(address: string): boolean {
    const key = address.toLowerCase()
    return this.contracts.has(key)
  }

  /**
   * Загружает конкретный контракт по адресу из API
   */
  async loadContract(address: string): Promise<ContractABI | null> {
    if (!this.contractsAPI) {
      throw new Error('ContractRegistry не инициализирован. Вызовите initializeForChain() сначала.')
    }

    try {
      console.log(`🔍 Загружаем контракт из API: ${address}`)
      const contract = await this.contractsAPI.getContract(address)
      
      if (contract) {
        this.addContract(contract)
        console.log(`✅ Контракт загружен и добавлен: ${contract.name}`)
      } else {
        console.log(`ℹ️ Контракт не найден в API: ${address}`)
      }
      
      return contract
    } catch (error: any) {
      console.error(`❌ Ошибка загрузки контракта ${address}:`, error)
      throw error
    }
  }

  /**
   * Получает статус загрузки
   */
  getLoadingStatus(): {
    isLoading: boolean
    contractsCount: number
    hasContracts: boolean
  } {
    return {
      isLoading: this.isLoading,
      contractsCount: this.contracts.size,
      hasContracts: this.contracts.size > 0
    }
  }

  /**
   * Очищает все контракты
   */
  clear(): void {
    console.log('🧹 Очищаем реестр контрактов')
    this.contracts.clear()
    this.contractsAPI = null
    this.loadingPromise = null
    this.isLoading = false
  }
}

// Экспорт singleton instance
export const contractRegistry = ContractRegistry.getInstance()