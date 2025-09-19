/**
 * Реестр контрактов для управления ABI и метаданными
 */

import { ContractABI, ParsedFunction } from './contract-types'
import { ABIParser } from './abi-parser'

// Импорт ABI файлов
import ERC20MintableABI from '../abi/ERC20Mintable.json'
import ICombineRouterData from '../abi/ICombineRouter.json'
import WKAS from '../abi/WKAS.json'


export class ContractRegistry {
  private static instance: ContractRegistry
  private contracts: Map<string, ContractABI> = new Map()
  private parsedFunctions: Map<string, ParsedFunction[]> = new Map()

  private constructor() {
    this.initializePredefinedContracts()
  }

  static getInstance(): ContractRegistry {
    if (!ContractRegistry.instance) {
      ContractRegistry.instance = new ContractRegistry()
    }
    return ContractRegistry.instance
  }

  /**
   * Инициализация предопределенных контрактов
   */
  private initializePredefinedContracts(): void {
    console.log('🏗️ Инициализируем предопределенные контракты...')

    const predefinedContracts: ContractABI[] = [
      {
        name: 'ERC20 Mintable Token',
        address: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
        abi: ERC20MintableABI
      },
      {
        name: 'Combine Router',
        address: '0x698f56cFE6F6c994E02ac61AcD0AfEDf480Ca518',
        abi: ICombineRouterData.abi
      },
      {
        name: 'WKAS',
        address: '0x698f56cFE6F6c994E02ac61AcD0AfEDf480Ca518',
        abi: WKAS.abi
      }
    ]

    predefinedContracts.forEach(contract => {
      this.addContract(contract)
    })

    console.log(`✅ Загружено ${predefinedContracts.length} предопределенных контрактов`)
  }

  /**
   * Добавляет контракт в реестр
   */
  addContract(contract: ContractABI): void {
    const key = contract.address.toLowerCase()
    this.contracts.set(key, contract)
    
    // Парсим функции при добавлении
    const functions = ABIParser.parseFunctions(contract.abi)
    this.parsedFunctions.set(key, functions)
    
    console.log(`📝 Добавлен контракт ${contract.name} (${contract.address})`)
    console.log(`   Функций: ${functions.length}`)
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
    const key = address.toLowerCase()
    return this.parsedFunctions.get(key) || []
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

}

// Экспорт singleton instance
export const contractRegistry = ContractRegistry.getInstance()
