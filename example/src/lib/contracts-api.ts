import axios from 'axios'
import { ContractABI } from './contract-types'
import { ABIParser } from './abi-parser'

// Типы для API ответа Safe Transaction Service
export interface ContractAPIResponse {
  count: number
  next: string | null
  previous: string | null
  results: ContractAPIResult[]
}

export interface ContractAPIResult {
  address: string
  name: string
  displayName: string
  logoUri: string | null
  contractAbi: {
    abi: any[]
    description: string
    relevance: number
  }
  trustedForDelegateCall: boolean
}

/**
 * API клиент для получения списка контрактов из Safe Transaction Service
 */
export class ContractsAPI {
  private baseUrl: string

  constructor(chainId: bigint) {
    // Определяем URL Safe Transaction Service на основе chainId
    this.baseUrl = this.getTxServiceUrl(chainId)
  }

  /**
   * Получает URL Safe Transaction Service для заданного chainId
   */
  private getTxServiceUrl(chainId: bigint): string {
    const chainIdNumber = Number(chainId)
    
    switch (chainIdNumber) {
      case 1: // Ethereum Mainnet
        return 'https://safe-transaction-mainnet.safe.global'
      case 5: // Goerli
        return 'https://safe-transaction-goerli.safe.global'
      case 11155111: // Sepolia
        return 'https://safe-transaction-sepolia.safe.global'
      case 100: // Gnosis Chain
        return 'https://safe-transaction-gnosis-chain.safe.global'
      case 137: // Polygon
        return 'https://safe-transaction-polygon.safe.global'
      case 42161: // Arbitrum One
        return 'https://safe-transaction-arbitrum.safe.global'
      case 10: // Optimism
        return 'https://safe-transaction-optimism.safe.global'
      case 8453: // Base
        return 'https://safe-transaction-base.safe.global'
      case 31337: // Local/Anvil
        return 'http://localhost:8000' // Предполагаем локальный Safe Transaction Service
      default:
        console.warn(`⚠️ Неизвестный chainId: ${chainIdNumber}, используем mainnet URL`)
        return 'https://safe-transaction-mainnet.safe.global'
    }
  }

  /**
   * Получает список контрактов ABI из Safe Transaction Service
   */
  async getContracts(options?: {
    limit?: number
    offset?: number
    trusted?: boolean
  }): Promise<ContractABI[]> {
    try {
      console.log('🔍 Загружаем контракты из Safe Transaction Service...')
      console.log('🌐 URL:', this.baseUrl)

      const params = new URLSearchParams()
      if (options?.limit) params.append('limit', options.limit.toString())
      if (options?.offset) params.append('offset', options.offset.toString())
      if (options?.trusted !== undefined) params.append('trusted', options.trusted.toString())

      const url = `${this.baseUrl}/api/v1/contracts/`
      console.log('📡 Полный URL запроса:', url + (params.toString() ? `?${params.toString()}` : ''))

      const response = await axios.get<ContractAPIResponse>(url, {
        params: Object.fromEntries(params),
        timeout: 10000, // 10 секунд таймаут
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })

      console.log('✅ Получен ответ от API:', {
        count: response.data.count,
        resultsLength: response.data.results.length,
        hasNext: !!response.data.next,
        hasPrevious: !!response.data.previous
      })

      // Преобразуем API ответ в наш формат ContractABI
      const contracts: ContractABI[] = response.data.results.map(result => {
        console.log(`🔧 Парсим контракт: ${result.name} (${result.address})`)
        
        const parsedFunctions = ABIParser.parseFunctions(result.contractAbi.abi)
        console.log(`  📋 Найдено функций для Safe пропозалов: ${parsedFunctions.length}`)

        return {
          name: result.displayName || result.name,
          address: result.address,
          abi: result.contractAbi.abi,
          parsedFunctions
        }
      })

      console.log(`🎯 Успешно загружено контрактов: ${contracts.length}`)
      return contracts

    } catch (error: any) {
      console.error('❌ Ошибка загрузки контрактов из API:', error)
      
      if (error.response) {
        console.error('📊 Детали ошибки API:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        })
        throw new Error(`API ошибка: ${error.response.status} - ${error.response.statusText}`)
      } else if (error.request) {
        console.error('🌐 Ошибка сети:', error.message)
        throw new Error(`Ошибка сети: ${error.message}`)
      } else {
        console.error('⚙️ Общая ошибка:', error.message)
        throw new Error(`Ошибка: ${error.message}`)
      }
    }
  }

  /**
   * Получает информацию о конкретном контракте
   */
  async getContract(address: string): Promise<ContractABI | null> {
    try {
      console.log(`🔍 Загружаем контракт: ${address}`)
      
      const url = `${this.baseUrl}/api/v1/contracts/${address}/`
      console.log('📡 URL запроса:', url)

      const response = await axios.get<ContractAPIResult>(url, {
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })

      const result = response.data
      const parsedFunctions = ABIParser.parseFunctions(result.contractAbi.abi)
      
      console.log(`✅ Контракт загружен: ${result.name}, функций: ${parsedFunctions.length}`)

      return {
        name: result.displayName || result.name,
        address: result.address,
        abi: result.contractAbi.abi,
        parsedFunctions
      }

    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`ℹ️ Контракт не найден в API: ${address}`)
        return null
      }
      
      console.error(`❌ Ошибка загрузки контракта ${address}:`, error)
      throw error
    }
  }
}
