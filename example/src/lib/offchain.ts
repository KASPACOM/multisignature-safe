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
  safeTransaction: SafeTransaction
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
        console.warn('STS URL не настроен')
        return
      }

      this.apiKit = new SafeApiKit({
        txServiceUrl: this.networkConfig.stsUrl,
        chainId: BigInt(this.networkConfig.chainId)
      })

      console.log('✅ SafeApiKit инициализирован:', this.networkConfig.stsUrl)
    } catch (error) {
      console.error('❌ Ошибка инициализации SafeApiKit:', error)
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
  }

  // Получение транзакции из STS
  async getTransaction(safeTxHash: string) {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    return await this.apiKit.getTransaction(safeTxHash)
  }

  // Проверка, является ли адрес владельцем Safe
  async isOwner(safeAddress: string, ownerAddress: string): Promise<boolean> {
    try {
      const owners = (await this.getSafeInfo(safeAddress)).owners
      return owners.map(addr => addr.toLowerCase()).includes(ownerAddress.toLowerCase())
    } catch (error) {
      return false
    }
  }

  // Подтверждение транзакции через STS API Kit
  async confirmTransaction(
    safeTxHash: string,
    signature: string
  ): Promise<void> {
    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    console.log('✅ Подтверждение транзакции:', safeTxHash)

    await this.apiKit.confirmTransaction(safeTxHash, signature)
    console.log('🎉 Транзакция подтверждена в STS')
  }

  // Отправка универсальной операции в STS
  async proposeUniversalResult(
    safeAddress: string,
    universalResult: UniversalOperationResult,
    senderAddress: string,
    origin?: string
  ): Promise<void> {
    console.log('🚀 Отправка пропозала:', universalResult.transactionHash)

    if (!this.apiKit) {
      throw new Error('STS недоступен')
    }

    // Получаем подпись из транзакции
    const signature = universalResult.safeTransaction.signatures?.get(senderAddress.toLowerCase())
    if (!signature) {
      throw new Error('Подпись не найдена в универсальной транзакции')
    }

    try {
      // Проверяем регистрацию Safe в STS
      await this.getSafeInfo(safeAddress)
      
      // Отправляем транзакцию в STS
      const proposeTransactionProps: ProposeTransactionProps = {
        safeAddress,
        safeTransactionData: universalResult.safeTransaction.data,
        safeTxHash: universalResult.transactionHash,
        senderAddress,
        senderSignature: signature.data,
        origin: origin || 'Universal Operation'
      }

      await this.apiKit.proposeTransaction(proposeTransactionProps)
      console.log('✅ Пропозал отправлен в STS:', safeAddress)

    } catch (error) {
      console.error('❌ Ошибка отправки пропозала:', error)
      throw error
    }
  }

  // ===============================================
  // МЕТОДЫ ДЛЯ РАБОТЫ С ПРОПОЗАЛАМИ ПОЛЬЗОВАТЕЛЕЙ
  // ===============================================

  // Получение всех пропозалов для конкретного пользователя
  async getUserProposals(filter: UserProposalsFilter): Promise<UserProposal[]> {
    const proposals: UserProposal[] = []

    // Получаем все Safe, где пользователь является владельцем
    const userSafes = filter.safeAddress ? [filter.safeAddress] : await this.getUserSafes(filter.userAddress)

    for (const safeAddress of userSafes) {
      try {
        // Проверяем, является ли пользователь владельцем этого Safe
        const isUserOwner = await this.isOwner(safeAddress, filter.userAddress)
        if (!isUserOwner) {
          continue
        }

        // Получаем транзакции для этого Safe
        const safeProposals = await this.getSTSProposalsOnly(safeAddress)
        proposals.push(...safeProposals)

      } catch (error) {
        // Продолжаем обработку других Safe
      }
    }

    // Применяем фильтры и сортировку
    return this.filterAndSortProposals(proposals, filter)
  }

  // Получение статистики пропозалов пользователя
  async getUserProposalsStats(userAddress: string): Promise<{
    total: number
    pending: number
    executable: number
    executed: number
    byStatus: {
      needsMySignature: number
      waitingForOthers: number
      readyToExecute: number
      executed: number
    }
  }> {
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

      return stats

    } catch (error) {
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

  // Получение Safe контрактов пользователя
  async getUserSafes(userAddress: string): Promise<string[]> {
    try {
      const allSafes = await this.apiKit?.getSafesByOwner(userAddress)
      return allSafes?.safes || []
    } catch (error) {
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

  // Получение пропозалов из STS
  private async getSTSProposalsOnly(safeAddress: string): Promise<UserProposal[]> {
    if (!this.apiKit) {
      return []
    }

    try {
      const response = await this.apiKit.getMultisigTransactions(safeAddress)
      return response.results
    } catch (error: any) {
      // Если Safe не найден в STS (404), возвращаем пустой список
      if (error.status === 404 || error.message?.includes('Not Found')) {
        return []
      }
      throw error
    }
  }
}

// Экспорт основного класса
export default SafeOffChain
