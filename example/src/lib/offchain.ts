import SafeApiKit from '@safe-global/api-kit'
import {
  SafeTransaction
} from '@safe-global/types-kit'
import {
  ProposeTransactionProps,
  SafeMultisigTransactionListResponse,
} from '@safe-global/api-kit'
import type {
  SafeMultisigConfirmationResponse
} from '@safe-global/types-kit'

import { getNetworkConfig } from './safe-common'


// Use the type returned by getAllTransactions from API Kit
export type UserProposal = SafeMultisigTransactionListResponse['results'][0]

// Interface for user proposal filters
export interface UserProposalsFilter {
  userAddress: string
  safeAddress?: string
  executed?: boolean
  trusted?: boolean
  limit?: number
  offset?: number
  requiresUserSignature?: boolean // Only those that require user signature
  sortBy?: 'submissionDate' | 'nonce' | 'modified'
  sortOrder?: 'asc' | 'desc'
}

// Interface for universal operation result  
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

// Class for working with Safe Transaction Service (STS)
export class SafeOffChain {
  private apiKit: SafeApiKit | null = null
  private networkConfig = getNetworkConfig()

  constructor() {
    this.initializeApiKit()
  }

  // Initialize API Kit
  private async initializeApiKit() {
    try {
      if (!this.networkConfig.stsUrl) {
        console.warn('STS URL not configured')
        return
      }

      this.apiKit = new SafeApiKit({
        txServiceUrl: this.networkConfig.stsUrl,
        chainId: BigInt(this.networkConfig.chainId)
      })

      console.log('✅ SafeApiKit initialized:', this.networkConfig.stsUrl)
    } catch (error) {
      console.error('❌ SafeApiKit initialization error:', error)
    }
  }

  // Check STS availability
  isSTSAvailable(): boolean {
    return this.apiKit !== null
  }

  // Get Safe information from STS
  async getSafeInfo(safeAddress: string) {
    if (!this.apiKit) {
      throw new Error('STS unavailable')
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

  // Get transaction from STS
  async getTransaction(safeTxHash: string) {
    if (!this.apiKit) {
      throw new Error('STS unavailable')
    }

    return await this.apiKit.getTransaction(safeTxHash)
  }

  // Check if address is Safe owner
  async isOwner(safeAddress: string, ownerAddress: string): Promise<boolean> {
    try {
      const owners = (await this.getSafeInfo(safeAddress)).owners
      return owners.map(addr => addr.toLowerCase()).includes(ownerAddress.toLowerCase())
    } catch (error) {
      return false
    }
  }

  // Confirm transaction via STS API Kit
  async confirmTransaction(
    safeTxHash: string,
    signature: string
  ): Promise<void> {
    if (!this.apiKit) {
      throw new Error('STS unavailable')
    }

    console.log('✅ Confirming transaction:', safeTxHash)

    await this.apiKit.confirmTransaction(safeTxHash, signature)
    console.log('🎉 Transaction confirmed in STS')
  }

  // Send universal operation to STS
  async proposeUniversalResult(
    safeAddress: string,
    universalResult: UniversalOperationResult,
    senderAddress: string,
    origin?: string
  ): Promise<void> {
    console.log('🚀 Sending proposal:', universalResult.transactionHash)

    if (!this.apiKit) {
      throw new Error('STS unavailable')
    }

    // Get signature from transaction
    const signature = universalResult.safeTransaction.signatures?.get(senderAddress.toLowerCase())
    if (!signature) {
      throw new Error('Signature not found in universal transaction')
    }

    try {
      // Check Safe registration in STS
      await this.getSafeInfo(safeAddress)
      
      // Send transaction to STS
      const proposeTransactionProps: ProposeTransactionProps = {
        safeAddress,
        safeTransactionData: universalResult.safeTransaction.data,
        safeTxHash: universalResult.transactionHash,
        senderAddress,
        senderSignature: signature.data,
        origin: origin || 'Universal Operation'
      }

      await this.apiKit.proposeTransaction(proposeTransactionProps)
      console.log('✅ Proposal sent to STS:', safeAddress)

    } catch (error) {
      console.error('❌ Proposal sending error:', error)
      throw error
    }
  }

  // ===============================================
  // METHODS FOR WORKING WITH USER PROPOSALS
  // ===============================================

  // Get all proposals for a specific user
  async getUserProposals(filter: UserProposalsFilter): Promise<UserProposal[]> {
    const proposals: UserProposal[] = []

    // Get all Safes where user is owner
    const userSafes = filter.safeAddress ? [filter.safeAddress] : await this.getUserSafes(filter.userAddress)

    for (const safeAddress of userSafes) {
      try {
        // Check if user is owner of this Safe
        const isUserOwner = await this.isOwner(safeAddress, filter.userAddress)
        if (!isUserOwner) {
          continue
        }

        // Get transactions for this Safe
        const safeProposals = await this.getSTSProposalsOnly(safeAddress)
        proposals.push(...safeProposals)

      } catch (error) {
        // Continue processing other Safes
      }
    }

    // Apply filters and sorting
    return this.filterAndSortProposals(proposals, filter)
  }

  // Get user proposals statistics
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

  // Get user Safe contracts
  async getUserSafes(userAddress: string): Promise<string[]> {
    try {
      const allSafes = await this.apiKit?.getSafesByOwner(userAddress)
      return allSafes?.safes || []
    } catch (error) {
      return []
    }
  }

  // Filter and sort proposals
  private filterAndSortProposals(proposals: UserProposal[], filter: UserProposalsFilter): UserProposal[] {
    let filtered = [...proposals]

    // Filter by user signature requirement
    if (filter.requiresUserSignature) {
      filtered = filtered.filter(proposal => {
        if (proposal.isExecuted) return false

        const userHasSigned = proposal.confirmations?.some(
          (conf: SafeMultisigConfirmationResponse) => conf.owner.toLowerCase() === filter.userAddress.toLowerCase()
        ) || false
        return !userHasSigned
      })
    }

    // Sorting
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

  // Get proposals from STS
  private async getSTSProposalsOnly(safeAddress: string): Promise<UserProposal[]> {
    if (!this.apiKit) {
      return []
    }

    try {
      const response = await this.apiKit.getMultisigTransactions(safeAddress)
      return response.results
    } catch (error: any) {
      // If Safe not found in STS (404), return empty list
      if (error.status === 404 || error.message?.includes('Not Found')) {
        return []
      }
      throw error
    }
  }
}

// Export main class
export default SafeOffChain
