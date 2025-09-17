import { ethers } from 'ethers'
import SafeApiKit from '@safe-global/api-kit'
import {
  SafeTransaction
} from '@safe-global/types-kit'
import {
  ProposeTransactionProps,
  SafeMultisigTransactionListResponse,
} from '@safe-global/api-kit'
import type {
  SafeMultisigTransactionResponse,
  SafeMultisigConfirmationResponse,
  SignatureType,
  DataDecoded
} from '@safe-global/types-kit'

import { getNetworkConfig } from './safe-common'


// Используем тип, который возвращает getAllTransactions из API Kit
export type UserProposal = SafeMultisigTransactionListResponse['results'][0]

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
  safeTransaction: any | null // Может быть null в некоторых случаях
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

  // Получение транзакции из STS
  async getTransaction(safeTxHash: string) {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    try {
      return await this.apiKit.getTransaction(safeTxHash)
    } catch (error: any) {
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

  // Подтверждение транзакции через STS API Kit (аналог approve hash в блокчейне)
  async confirmTransaction(
    safeTxHash: string,
    signature: string
  ): Promise<void> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    console.log('✅ Подтверждаем транзакцию в STS через API Kit:', safeTxHash)
    console.log('📝 Подпись:', signature.slice(0, 20) + '...')

    try {
      // Используем API Kit для подтверждения транзакции с подписью
      await this.apiKit.confirmTransaction(safeTxHash, signature)

      console.log('🎉 Транзакция подтверждена в STS!')

    } catch (error) {
      console.error('❌ Ошибка подтверждения транзакции:', error)
      throw error
    }
  }

  // ЕДИНСТВЕННАЯ функция: проверка регистрации Safe + отправка универсальной операции в STS
  async proposeUniversalResult(
    safeAddress: string,
    universalResult: UniversalOperationResult,
    senderAddress: string,
    origin?: string
  ): Promise<void> {
    console.log('🚀 НАЧИНАЕМ proposeUniversalResult для транзакции:', universalResult.transactionHash)
    console.log('   📍 Safe адрес:', safeAddress)
    console.log('   👤 Отправитель:', senderAddress)
    console.log('   🏷️ Источник:', origin || 'Universal Operation')

    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    // Получаем подпись из транзакции
    const signature = universalResult.safeTransaction.signatures?.get(senderAddress.toLowerCase())
    if (!signature) {
      console.log('❌ Подпись не найдена для адреса:', senderAddress.toLowerCase())
      console.log('🔍 Доступные подписи:', Array.from(universalResult.safeTransaction.signatures.keys()))
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
      await this.getSafeInfo(safeAddress)
      // 2. Отправляем универсальную транзакцию в STS (это автоматически зарегистрирует Safe если нужно)
      const proposeTransactionProps: ProposeTransactionProps = {
        safeAddress,
        safeTransactionData: universalResult.safeTransaction.data,
        safeTxHash: universalResult.transactionHash,
        senderAddress,
        senderSignature: signatureData,
        origin: origin || 'Universal Operation'
      }

      console.log('📨 Отправляем пропозал в STS через API Kit...')
      await this.apiKit.proposeTransaction(proposeTransactionProps)
      console.log('🎉 Универсальная операция успешно отправлена в STS!')
      console.log('   📍 Safe адрес:', safeAddress)
      console.log('   🔗 Транзакция:', universalResult.transactionHash)

    } catch (error) {
      console.error('❌ Ошибка обработки универсальной операции:', error)
      console.error('   🔍 Детали ошибки:', error)
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
        const safeProposals = await this.getSTSProposalsOnly(safeAddress)
        proposals.push(...safeProposals)

      } catch (error) {
        console.error(`❌ Ошибка получения пропозалов для Safe ${safeAddress}:`, error)
        // Продолжаем обработку других Safe
      }
    }

    // Применяем фильтры и сортировку
    return this.filterAndSortProposals(proposals, filter)
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
          const userHasSigned = proposal.confirmations?.some(
            (conf: SafeMultisigConfirmationResponse) => conf.owner.toLowerCase() === userAddress.toLowerCase()
          ) || false
          const hasEnoughSignatures = (proposal.confirmations?.length || 0) >= proposal.confirmationsRequired

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

  // Публичный метод для получения списка Safe контрактов пользователя
  async getUserSafesList(userAddress: string): Promise<string[]> {
    console.log('📋 Получаем список Safe контрактов для пользователя:', userAddress)
    
    try {
      const safes = await this.getUserSafes(userAddress)
      console.log('✅ Найдено Safe контрактов:', safes.length)
      return safes
    } catch (error) {
      console.error('❌ Ошибка получения списка Safe:', error)
      return []
    }
  }

  // Получение Safe контрактов без активных пропозалов
  async getUserSafesWithoutProposals(userAddress: string): Promise<string[]> {
    console.log('🔍 Получаем Safe контракты без активных пропозалов для:', userAddress)
    
    try {
      // Получаем все Safe контракты пользователя
      const allSafes = await this.getUserSafesList(userAddress)
      console.log('📋 Всего Safe контрактов:', allSafes.length)
      
      // Получаем все пропозалы пользователя
      const allProposals = await this.getUserProposals({ userAddress })
      console.log('📋 Всего пропозалов:', allProposals.length)
      
      // Создаем Set адресов Safe с активными пропозалами
      const safesWithProposals = new Set(
        allProposals
          .filter(proposal => !proposal.isExecuted) // Только невыполненные пропозалы
          .map(proposal => proposal.safe.toLowerCase())
      )
      
      console.log('📋 Safe с активными пропозалами:', safesWithProposals.size)
      
      // Фильтруем Safe контракты, исключая те, у которых есть активные пропозалы
      const safesWithoutProposals = allSafes.filter(
        safeAddress => !safesWithProposals.has(safeAddress.toLowerCase())
      )
      
      console.log('✅ Safe контрактов без активных пропозалов:', safesWithoutProposals.length)
      return safesWithoutProposals
      
    } catch (error) {
      console.error('❌ Ошибка получения Safe без пропозалов:', error)
      return []
    }
  }

  // Фильтрация и сортировка пропозалов
  private filterAndSortProposals(proposals: UserProposal[], filter: UserProposalsFilter): UserProposal[] {
    let filtered = [...proposals]

    // Фильтрация по требованию подписи пользователя
    if (filter.requiresUserSignature) {
      filtered = filtered.filter(proposal => {
        if (proposal.isExecuted) return false

        const userHasSigned = proposal.confirmations?.some(
          (conf: SafeMultisigConfirmationResponse) => conf.owner.toLowerCase() === filter.userAddress.toLowerCase()
        ) || false
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
          comparison = Number(a.nonce) - Number(b.nonce)
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

      // Возвращаем SafeMultisigTransactionResponse напрямую
      return response.results

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
