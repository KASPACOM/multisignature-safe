import { ethers } from 'ethers'
import SafeApiKit from '@safe-global/api-kit'
import {
  SafeTransaction
} from '@safe-global/types-kit'
import {
  ProposeTransactionProps,
  SafeMultisigTransactionListResponse,
} from '@safe-global/api-kit'

import { getNetworkConfig } from './safe-common'

// Интерфейс для предложения транзакции
export interface ProposeTransactionParams {
  safeAddress: string
  safeTransaction: SafeTransaction
  safeTxHash: string
  senderAddress: string
  senderSignature: string
  origin?: string
}

// Интерфейс для подтверждения транзакции
export interface ConfirmTransactionParams {
  safeTxHash: string
  signature: string
  senderAddress: string
}

// Интерфейс для пропозала пользователя
export interface UserProposal {
  safeTxHash: string
  safeAddress: string
  to: string
  value: string
  data: string
  operation: number
  safeTxGas: string
  baseGas: string
  gasPrice: string
  gasToken: string
  refundReceiver: string
  nonce: number
  submissionDate: string
  modified: string
  blockNumber?: number
  transactionHash?: string
  trusted: boolean
  signatures: Array<{
    owner: string
    signature: string
    signatureType: string
  }>
  confirmationsRequired: number
  confirmations: Array<{
    owner: string
    submissionDate: string
    transactionHash?: string
    signature: string
    signatureType: string
  }>
  isExecuted: boolean
  isSuccessful?: boolean
  ethGasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  gasUsed?: string
  fee?: string
  origin: string
  dataDecoded?: any
  executor?: string
}

// Интерфейс для фильтров пропозалов пользователя
export interface UserProposalsFilter {
  userAddress: string
  safeAddress?: string
  executed?: boolean
  trusted?: boolean
  limit?: number
  offset?: number
  requiresUserSignature?: boolean // Только те, что требуют подписи от пользователя
  sortBy?: 'submissionDate' | 'nonce' | 'modified'
  sortOrder?: 'asc' | 'desc'
}

// Интерфейс для результата универсальной операции
export interface UniversalOperationResult {
  transactionHash: string
  safeTransaction: any
  encodedData: string
  transactionDetails: {
    to: string
    value: string
    data: string
    nonce: number
  }
}

// Класс для работы с Safe Transaction Service (STS)
export class SafeOffChain {
  private apiKit: SafeApiKit | null = null
  private networkConfig = getNetworkConfig()

  constructor() {
    this.initializeApiKit()
  }

  // Инициализация API Kit
  private async initializeApiKit() {
    try {
      if (!this.networkConfig.stsUrl) {
        console.warn('STS URL не настроен, некоторые функции будут недоступны')
        return
      }

      this.apiKit = new SafeApiKit({
        txServiceUrl: this.networkConfig.stsUrl,
        chainId: BigInt(this.networkConfig.chainId)
      })
      
      console.log('🔧 SafeApiKit настройки:')
      console.log('  📡 TX Service URL:', this.networkConfig.stsUrl)
      console.log('  🔗 Chain ID:', this.networkConfig.chainId)

      console.log('SafeApiKit инициализирован для STS:', this.networkConfig.stsUrl)
    } catch (error) {
      console.error('Ошибка инициализации SafeApiKit:', error)
    }
  }

  // Проверка доступности STS
  isSTSAvailable(): boolean {
    return this.apiKit !== null
  }

  // Получение информации о Safe из STS
  async getSafeInfo(safeAddress: string) {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      const safeInfo = await this.apiKit.getSafeInfo(safeAddress)
      return {
        address: safeInfo.address,
        nonce: parseInt(safeInfo.nonce),
        threshold: safeInfo.threshold,
        owners: safeInfo.owners,
        singleton: safeInfo.singleton,
        modules: safeInfo.modules,
        fallbackHandler: safeInfo.fallbackHandler,
        guard: safeInfo.guard,
        version: safeInfo.version
      }
    } catch (error) {
      console.error('Ошибка получения информации о Safe:', error)
      throw error
    }
  }

  // Простое предложение транзакции в STS (без автоматической регистрации)
  async proposeTransaction(params: ProposeTransactionParams): Promise<void> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      const proposeTransactionProps: ProposeTransactionProps = {
        safeAddress: params.safeAddress,
        safeTransactionData: params.safeTransaction.data,
        safeTxHash: params.safeTxHash,
        senderAddress: params.senderAddress,
        senderSignature: params.senderSignature,
        origin: params.origin || 'Safe Multisig Example'
      }

      await this.apiKit.proposeTransaction(proposeTransactionProps)
      console.log('✅ Транзакция предложена в STS с хешем:', params.safeTxHash)
    } catch (error) {
      console.error('❌ Ошибка предложения транзакции:', error)
      throw error
    }
  }

  // Подтверждение транзакции (добавление подписи)
  async confirmTransaction(params: ConfirmTransactionParams): Promise<void> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      await this.apiKit.confirmTransaction(
        params.safeTxHash,
        params.signature
      )
      console.log('Подпись добавлена для транзакции:', params.safeTxHash)
    } catch (error) {
      console.error('Ошибка подтверждения транзакции:', error)
      throw error
    }
  }

  // Получение транзакции из STS
  async getTransaction(safeTxHash: string) {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      return await this.apiKit.getTransaction(safeTxHash)
    } catch (error) {
      console.error('Ошибка получения транзакции:', error)
      throw error
    }
  }

  // Получение списка ожидающих транзакций
  async getPendingTransactions(safeAddress: string) {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      return (await this.apiKit.getPendingTransactions(safeAddress)).results
    } catch (error: any) {
      console.error('Ошибка получения ожидающих транзакций:', error)
      
      // Если Safe не найден в STS (обычная ситуация для новосозданных Safe)
      if (error.status === 404 || error.message?.includes('Not Found') || error.message?.includes('404')) {
        console.log('⚠️ Safe не найден в STS (возможно, только что создан). Возвращаем пустой список транзакций.')
        return []
      }
      
      throw error
    }
  }

  // Получение всех транзакций Safe
  async getAllTransactions(
    safeAddress: string,
    options?: {
      executed?: boolean
      queued?: boolean
      trusted?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<SafeMultisigTransactionListResponse> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      const response = await this.apiKit.getMultisigTransactions(safeAddress)
      return response
    } catch (error) {
      console.error('Ошибка получения транзакций:', error)
      throw error
    }
  }

  // Проверка статуса транзакции
  async getTransactionStatus(safeTxHash: string): Promise<{
    isExecuted: boolean
    confirmationsCount: number
    requiredConfirmations: number
    canExecute: boolean
  }> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      const transaction = await this.getTransaction(safeTxHash)
      const confirmationsCount = transaction.confirmations?.length || 0
      const requiredConfirmations = transaction.confirmationsRequired || 1

      return {
        isExecuted: transaction.isExecuted,
        confirmationsCount,
        requiredConfirmations,
        canExecute: confirmationsCount >= requiredConfirmations && !transaction.isExecuted
      }
    } catch (error: any) {
      console.error('Ошибка проверки статуса:', error)
      
      // Если транзакция не найдена в STS, возвращаем значения по умолчанию
      if (error.status === 404 || error.message?.includes('Not Found') || error.message?.includes('404')) {
        console.log('⚠️ Транзакция не найдена в STS. Возвращаем статус по умолчанию.')
        return {
          isExecuted: false,
          confirmationsCount: 0,
          requiredConfirmations: 1,
          canExecute: false
        }
      }
      
      throw error
    }
  }

  // Получение подписей транзакции
  async getTransactionSignatures(safeTxHash: string): Promise<{
    [ownerAddress: string]: string
  }> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      const transaction = await this.getTransaction(safeTxHash)
      const signatures: { [ownerAddress: string]: string } = {}

      transaction.confirmations?.forEach(confirmation => {
        if (confirmation.signature && confirmation.owner) {
          signatures[confirmation.owner] = confirmation.signature
        }
      })

      return signatures
    } catch (error: any) {
      console.error('Ошибка получения подписей:', error)
      
      // Если транзакция не найдена в STS, возвращаем пустой объект
      if (error.status === 404 || error.message?.includes('Not Found') || error.message?.includes('404')) {
        console.log('⚠️ Транзакция не найдена в STS. Возвращаем пустые подписи.')
        return {}
      }
      
      throw error
    }
  }

  // Получение информации о владельцах Safe
  async getSafeOwners(safeAddress: string): Promise<string[]> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      const safeInfo = await this.getSafeInfo(safeAddress)
      return safeInfo.owners
    } catch (error) {
      console.error('Ошибка получения владельцев:', error)
      throw error
    }
  }

  // Проверка, является ли адрес владельцем Safe
  async isOwner(safeAddress: string, ownerAddress: string): Promise<boolean> {
    try {
      const owners = await this.getSafeOwners(safeAddress)
      return owners.map(addr => addr.toLowerCase()).includes(ownerAddress.toLowerCase())
    } catch (error) {
      console.error('Ошибка проверки владельца:', error)
      return false
    }
  }

  // ===============================================
  // МЕТОДЫ РЕГИСТРАЦИИ И ОТПРАВКИ ОПЕРАЦИЙ В STS  
  // ===============================================

  // ЕДИНСТВЕННАЯ функция: проверка регистрации Safe + отправка универсальной операции в STS
  async proposeUniversalResult(
    safeAddress: string,
    universalResult: UniversalOperationResult,
    senderAddress: string,
    origin?: string
  ): Promise<void> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    // Получаем подпись из транзакции
    const signature = universalResult.safeTransaction.signatures?.get(senderAddress.toLowerCase())
    if (!signature) {
      throw new Error('Подпись не найдена в универсальной транзакции')
    }
    
    const signatureData = typeof signature === 'object' && signature && 'data' in signature 
      ? String(signature.data) 
      : String(signature)

    console.log('📤 Обрабатываем универсальную операцию:')
    console.log('  🎯 Хеш:', universalResult.transactionHash)
    console.log('  📍 Получатель:', universalResult.transactionDetails.to)
    console.log('  💰 Значение:', universalResult.transactionDetails.value)
    console.log('  📝 Nonce:', universalResult.transactionDetails.nonce)

    try {
      // 1. Проверяем, зарегистрирован ли Safe в STS
      console.log('🔍 Проверяем регистрацию Safe в STS:', safeAddress)
      try {
        await this.getSafeInfo(safeAddress)
        console.log('✅ Safe уже зарегистрирован в STS')
      } catch (error: any) {
        // Если это не 404, то это другая ошибка
        if (!error.message?.includes('404') && !error.message?.includes('Not Found')) {
          throw error
        }
        
        console.log('📝 Safe не найден в STS, регистрируем через текущую транзакцию...')
        // Не делаем отдельную регистрацию - просто отправляем транзакцию (это зарегистрирует Safe)
      }

      // 2. Отправляем универсальную транзакцию в STS (это автоматически зарегистрирует Safe если нужно)
      const proposeTransactionProps: ProposeTransactionProps = {
        safeAddress,
        safeTransactionData: universalResult.safeTransaction.data,
        safeTxHash: universalResult.transactionHash,
        senderAddress,
        senderSignature: signatureData,
        origin: origin || 'Universal Operation'
      }

      await this.apiKit.proposeTransaction(proposeTransactionProps)
      console.log('🎉 Универсальная операция успешно отправлена в STS!')
      console.log('   📍 Safe адрес:', safeAddress)
      console.log('   🔗 Транзакция:', universalResult.transactionHash)

    } catch (error) {
      console.error('❌ Ошибка обработки универсальной операции:', error)
      throw error
    }
  }

  // ===============================================
  // МЕТОДЫ ДЛЯ РАБОТЫ С ПРОПОЗАЛАМИ ПОЛЬЗОВАТЕЛЕЙ
  // ===============================================

  // Получение всех пропозалов для конкретного пользователя
  async getUserProposals(filter: UserProposalsFilter): Promise<UserProposal[]> {
    console.log('📥 Получаем пропозалы для пользователя:', filter.userAddress)
    
    const proposals: UserProposal[] = []

    // Получаем все Safe, где пользователь является владельцем
    const userSafes = filter.safeAddress ? [filter.safeAddress] : await this.getUserSafes(filter.userAddress)
    
    for (const safeAddress of userSafes) {
      try {
        console.log(`🔍 Проверяем Safe: ${safeAddress}`)
        
        // Проверяем, является ли пользователь владельцем этого Safe
        const isUserOwner = await this.isOwner(safeAddress, filter.userAddress)
        if (!isUserOwner) {
          console.log(`⚠️ Пользователь ${filter.userAddress} не является владельцем Safe ${safeAddress}`)
          continue
        }

        // Получаем транзакции для этого Safe
        const safeProposals = await this.getSafeProposals(safeAddress, filter)
        proposals.push(...safeProposals)
        
    } catch (error) {
        console.error(`❌ Ошибка получения пропозалов для Safe ${safeAddress}:`, error)
        // Продолжаем обработку других Safe
      }
    }

    // Применяем фильтры и сортировку
    return this.filterAndSortProposals(proposals, filter)
  }

  // Получение пропозалов, требующих подписи от пользователя  
  async getUserPendingProposals(filter: UserProposalsFilter): Promise<UserProposal[]> {
    console.log('⏳ Получаем пропозалы, требующие подписи от:', filter.userAddress)
    
    const allProposals = await this.getUserProposals({
      ...filter,
      executed: false, // Только неисполненные
      requiresUserSignature: true // Только требующие подписи
    })

    // Фильтруем только те, где пользователь еще не подписал
    const pendingProposals = allProposals.filter(proposal => {
      const userHasSigned = proposal.confirmations.some(
        conf => conf.owner.toLowerCase() === filter.userAddress.toLowerCase()
      )
      return !userHasSigned
    })

    console.log(`✅ Найдено ${pendingProposals.length} пропозалов, ожидающих подписи`)
    return pendingProposals
  }

  // Получение пропозалов готовых к выполнению (достаточно подписей)
  async getUserExecutableProposals(filter: UserProposalsFilter): Promise<UserProposal[]> {
    console.log('🚀 Получаем готовые к выполнению пропозалы для:', filter.userAddress)
    
    const allProposals = await this.getUserProposals({
      ...filter,
      executed: false // Только неисполненные
    })

    // Фильтруем только те, где достаточно подписей для выполнения
    const executableProposals = allProposals.filter(proposal => {
      return proposal.confirmations.length >= proposal.confirmationsRequired
    })

    console.log(`✅ Найдено ${executableProposals.length} готовых к выполнению пропозалов`)
    return executableProposals
  }

  // Получение статистики пропозалов пользователя
  async getUserProposalsStats(userAddress: string): Promise<{
    total: number
    pending: number // требуют подписи пользователя
    executable: number // готовы к выполнению
    executed: number // уже выполнены
    byStatus: {
      needsMySignature: number
      waitingForOthers: number
      readyToExecute: number
      executed: number
    }
  }> {
    console.log('📊 Получаем статистику пропозалов для:', userAddress)
    
    try {
      const allProposals = await this.getUserProposals({ userAddress })
      
      const stats = {
        total: allProposals.length,
        pending: 0,
        executable: 0,
        executed: 0,
        byStatus: {
          needsMySignature: 0,
          waitingForOthers: 0,
          readyToExecute: 0,
          executed: 0
        }
      }

      allProposals.forEach(proposal => {
        if (proposal.isExecuted) {
          stats.executed++
          stats.byStatus.executed++
        } else {
          const userHasSigned = proposal.confirmations.some(
            conf => conf.owner.toLowerCase() === userAddress.toLowerCase()
          )
          const hasEnoughSignatures = proposal.confirmations.length >= proposal.confirmationsRequired

          if (!userHasSigned) {
            stats.pending++
            stats.byStatus.needsMySignature++
          } else if (hasEnoughSignatures) {
            stats.executable++
            stats.byStatus.readyToExecute++
          } else {
            stats.byStatus.waitingForOthers++
          }
        }
      })

      console.log('📈 Статистика пропозалов:', stats)
      return stats
      
    } catch (error) {
      console.error('❌ Ошибка получения статистики:', error)
      return {
        total: 0,
        pending: 0,
        executable: 0,
        executed: 0,
        byStatus: {
          needsMySignature: 0,
          waitingForOthers: 0,
          readyToExecute: 0,
          executed: 0
        }
      }
    }
  }

  // ===============================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ===============================================

  // Получение списка Safe, где пользователь является владельцем
  private async getUserSafes(userAddress: string): Promise<string[]> {
    if (!this.apiKit) {
      console.warn('⚠️ STS недоступен, возвращаем пустой список Safe')
      return []
    }

    try {
      // Используем STS API для поиска Safe пользователя
      // Примечание: этот метод может отличаться в зависимости от версии API
      const userSafes = await this.apiKit.getSafesByOwner(userAddress)
      return userSafes.safes || []
    } catch (error) {
      console.error('❌ Ошибка получения Safe пользователя:', error)
      return []
    }
  }

  // Получение пропозалов для конкретного Safe - только из STS
  private async getSafeProposals(safeAddress: string, filter: UserProposalsFilter): Promise<UserProposal[]> {
    return await this.getSTSProposalsOnly(safeAddress)
  }

  // Фильтрация и сортировка пропозалов
  private filterAndSortProposals(proposals: UserProposal[], filter: UserProposalsFilter): UserProposal[] {
    let filtered = [...proposals]

    // Фильтрация по требованию подписи пользователя
    if (filter.requiresUserSignature) {
      filtered = filtered.filter(proposal => {
        if (proposal.isExecuted) return false
        
        const userHasSigned = proposal.confirmations.some(
          conf => conf.owner.toLowerCase() === filter.userAddress.toLowerCase()
        )
        return !userHasSigned
      })
    }

    // Сортировка
    const sortBy = filter.sortBy || 'submissionDate'
    const sortOrder = filter.sortOrder || 'desc'

    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'submissionDate':
          comparison = new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime()
          break
        case 'nonce':
          comparison = a.nonce - b.nonce
          break
        case 'modified':
          comparison = new Date(a.modified).getTime() - new Date(b.modified).getTime()
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }

  // Получение пропозалов - только из STS (убираем fallback на localStorage)
  private async getSTSProposalsOnly(safeAddress: string): Promise<UserProposal[]> {
    if (!this.apiKit) {
      console.log('⚠️ STS недоступен, пропозалы недоступны')
      return []
    }

    try {
      const response = await this.getAllTransactions(safeAddress)
      
      // Конвертируем в формат UserProposal
      const proposals: UserProposal[] = response.results.map(tx => ({
        safeTxHash: tx.safeTxHash,
        safeAddress: safeAddress,
        to: tx.to,
        value: tx.value,
        data: tx.data || '0x',
        operation: tx.operation,
        safeTxGas: tx.safeTxGas,
        baseGas: tx.baseGas,
        gasPrice: tx.gasPrice,
        gasToken: tx.gasToken,
        refundReceiver: tx.refundReceiver || '0x0000000000000000000000000000000000000000',
        nonce: parseInt(tx.nonce.toString()) || 0,
        submissionDate: tx.submissionDate,
        modified: tx.modified,
        blockNumber: tx.blockNumber ?? undefined,
        transactionHash: tx.transactionHash ?? undefined,
        trusted: tx.trusted,
        signatures: Array.isArray(tx.signatures) ? tx.signatures : [],
        confirmationsRequired: tx.confirmationsRequired,
        confirmations: Array.isArray(tx.confirmations) ? tx.confirmations : [],
        isExecuted: tx.isExecuted,
        isSuccessful: tx.isSuccessful ?? undefined,
        ethGasPrice: tx.ethGasPrice ?? undefined,
        maxFeePerGas: tx.maxFeePerGas ?? undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? undefined,
        gasUsed: tx.gasUsed?.toString(),
        fee: tx.fee ?? undefined,
        origin: tx.origin || 'STS',
        dataDecoded: tx.dataDecoded,
        executor: tx.executor ?? undefined
      }))

      return proposals

    } catch (error: any) {
      console.error(`❌ Ошибка получения пропозалов из STS для Safe ${safeAddress}:`, error)
      
      // Если Safe не найден в STS (404), возвращаем пустой список
      if (error.status === 404 || error.message?.includes('Not Found')) {
        console.log('⚠️ Safe не найден в STS. Возвращаем пустой список.')
        return []
      }
      
      throw error
    }
  }
}

// Экспорт основного класса
export default SafeOffChain
