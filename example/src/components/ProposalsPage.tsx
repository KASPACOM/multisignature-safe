import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'

import SafeOnChain, { 
  SafeConnectionForm,
} from '../lib/onchain'
import { UserProposals } from '../components'
import SafeOffChain from '../lib/offchain'
import { 
  formatAddress, 
} from '../lib/safe-common'
import { Network } from '../lib/network-types'

interface SafeInfo {
  address: string
  owners: string[]
  threshold: number
  balance: string
  nonce: number
}

interface UserProposalsStats {
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
}

interface ProposalsPageProps {
  network: Network | null
  userAddress: string
  safeOnChain: SafeOnChain | null
  safeOffChain: SafeOffChain
  safeInfo: SafeInfo | null
  setSafeInfo: (info: SafeInfo | null) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
  loadPendingTransactions?: (address: string) => Promise<void>
}

const ProposalsPage: React.FC<ProposalsPageProps> = ({
  network,
  userAddress,
  safeOnChain,
  safeOffChain,
  safeInfo,
  setSafeInfo,
  showError,
  showSuccess,
  loadPendingTransactions
}) => {
  // Состояние статистики пропозалов пользователя
  const [userProposalsStats, setUserProposalsStats] = useState<UserProposalsStats | null>(null)
  const [statsLoading, setStatsLoading] = useState<boolean>(false)
  const [userProposalsRefresh, setUserProposalsRefresh] = useState(0)
  
  // Состояние фильтров пропозалов
  const [proposalsFilter, setProposalsFilter] = useState<'all' | 'needsSignature' | 'readyToExecute' | 'executed'>('all')

  // Загрузка статистики пропозалов пользователя
  const loadUserProposalsStats = async (address: string) => {
    console.log('📊 Загружаем статистику пропозалов для:', address)
    setStatsLoading(true)

    try {
      const stats = await safeOffChain.getUserProposalsStats(address)
      setUserProposalsStats(stats)
      
      console.log('✅ Статистика пропозалов загружена:', stats)
      
      // Показываем краткую информацию пользователю если есть активные задачи
      if (stats.pending > 0 || stats.executable > 0) {
        let message = ''
        if (stats.pending > 0) {
          message += `${stats.pending} пропозалов требуют вашей подписи`
        }
        if (stats.executable > 0) {
          if (message) message += ', '
          message += `${stats.executable} готовы к выполнению`
        }
        showSuccess(`📋 ${message}`)
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки статистики пропозалов:', error)
      // Не показываем ошибку пользователю, так как это не критично
      setUserProposalsStats(null)
    } finally {
      setStatsLoading(false)
    }
  }

  // Обработка действий с пропозалами пользователя
  const handleUserProposalAction = async (proposal: any, action: 'sign' | 'execute' | 'view') => {
    console.log(`🎬 Действие с пропозалом пользователя: ${action}`, proposal.safeTxHash)

    try {
      switch (action) {
        case 'sign':
          if (!safeOnChain) {
            showError('Safe Manager не инициализирован')
            return
          }
          
          console.log('🔌 Проверяем подключение к Safe для подписи:', proposal.safeAddress)
          
          // Проверяем, подключены ли мы к нужному Safe адресу
          const currentSafeAddressSign = safeInfo?.address?.toLowerCase()
          const requiredSafeAddressSign = proposal.safeAddress.toLowerCase()
          
          if (currentSafeAddressSign !== requiredSafeAddressSign) {
            console.log(`🔄 Нужно подключиться к Safe ${requiredSafeAddressSign}, текущий: ${currentSafeAddressSign || 'не подключен'}`)
            
            // Автоматически подключаемся к нужному Safe
            try {
              // Получаем информацию о Safe для создания формы подключения
              const safeInfoFromSTS = await safeOffChain.getSafeInfo(proposal.safeAddress)
              const connectionForm: SafeConnectionForm = {
                safeAddress: proposal.safeAddress,
                owners: safeInfoFromSTS.owners,
                threshold: safeInfoFromSTS.threshold
              }
              
              await safeOnChain.connectToSafeWithForm(connectionForm)
              
              // Обновляем информацию о Safe
              const safeData = await safeOnChain.getCurrentSafeInfo()
              setSafeInfo({
                address: safeData.address,
                owners: safeData.owners,
                threshold: safeData.threshold,
                balance: safeData.balance,
                nonce: safeData.nonce
              })
              
              console.log('✅ Подключились к Safe для подписи:', proposal.safeAddress)
            } catch (connectError) {
              showError(`Не удалось подключиться к Safe ${formatAddress(proposal.safeAddress)}: ${connectError instanceof Error ? connectError.message : 'Неизвестная ошибка'}`)
              return
            }
          } else {
            console.log('✅ Уже подключены к нужному Safe для подписи')
          }
          
          // Подписываем пропозал через approve hash
          const txData = await safeOffChain.getTransaction(proposal.safeTxHash)
          const safeTransaction = await safeOnChain.createSafeTransaction({
            to: txData.to,
            value: ethers.formatEther(txData.value || '0'),
            data: txData.data || '0x'
          })
          
          await safeOnChain.approveTransactionHash(safeTransaction)
          showSuccess('Пропозал подписан!')
          
          // Обновляем пропозалы пользователя и список ожидающих транзакций
          refreshUserProposals()
          if (safeInfo && loadPendingTransactions) {
            await loadPendingTransactions(safeInfo.address)
          }
          break

        case 'execute':
          if (!safeOnChain) {
            showError('Safe Manager не инициализирован')
            return
          }
          
          console.log('🔌 Проверяем подключение к Safe:', proposal.safeAddress)
          
          // Проверяем, подключены ли мы к нужному Safe адресу
          const currentSafeAddress = safeInfo?.address?.toLowerCase()
          const requiredSafeAddress = proposal.safeAddress.toLowerCase()
          
          if (currentSafeAddress !== requiredSafeAddress) {
            console.log(`🔄 Нужно подключиться к Safe ${requiredSafeAddress}, текущий: ${currentSafeAddress || 'не подключен'}`)
            
            // Автоматически подключаемся к нужному Safe
            try {
              // Получаем информацию о Safe для создания формы подключения
              const safeInfoFromSTS = await safeOffChain.getSafeInfo(proposal.safeAddress)
              const connectionForm: SafeConnectionForm = {
                safeAddress: proposal.safeAddress,
                owners: safeInfoFromSTS.owners,
                threshold: safeInfoFromSTS.threshold
              }
              
              await safeOnChain.connectToSafeWithForm(connectionForm)
              
              // Обновляем информацию о Safe
              const safeData = await safeOnChain.getCurrentSafeInfo()
              setSafeInfo({
                address: safeData.address,
                owners: safeData.owners,
                threshold: safeData.threshold,
                balance: safeData.balance,
                nonce: safeData.nonce
              })
              
              console.log('✅ Подключились к Safe:', proposal.safeAddress)
            } catch (connectError) {
              showError(`Не удалось подключиться к Safe ${formatAddress(proposal.safeAddress)}: ${connectError instanceof Error ? connectError.message : 'Неизвестная ошибка'}`)
              return
            }
          } else {
            console.log('✅ Уже подключены к нужному Safe')
          }
          
          // Выполняем транзакцию через STS интеграцию  
          const txHash = await safeOnChain.executeTransactionByHash(proposal.safeTxHash, safeOffChain)
          showSuccess(`Пропозал выполнен! Hash: ${formatAddress(txHash)}`)
          
          // Обновляем состояние
          refreshUserProposals()
          if (safeInfo) {
            const updatedSafeInfo = await safeOnChain.getCurrentSafeInfo()
            setSafeInfo({
              address: updatedSafeInfo.address,
              owners: updatedSafeInfo.owners,
              threshold: updatedSafeInfo.threshold,
              balance: updatedSafeInfo.balance,
              nonce: updatedSafeInfo.nonce
            })
            if (loadPendingTransactions) {
              await loadPendingTransactions(safeInfo.address)
            }
          }
          break

        case 'view':
          // Показываем детальную информацию о пропозале
          console.log('📋 Детали пропозала:', proposal)
          showSuccess('Детали пропозала выведены в консоль')
          break

        default:
          console.warn('Неизвестное действие:', action)
      }
    } catch (error) {
      console.error(`❌ Ошибка выполнения действия ${action}:`, error)
      showError(error instanceof Error ? error.message : `Ошибка выполнения действия ${action}`)
    }
  }

  // Обновление пропозалов пользователя
  const refreshUserProposals = () => {
    setUserProposalsRefresh(prev => prev + 1)
    
    // Также обновляем статистику пропозалов
    if (userAddress) {
      loadUserProposalsStats(userAddress)
    }
  }

  // Загружаем статистику при подключении пользователя
  useEffect(() => {
    if (userAddress) {
      loadUserProposalsStats(userAddress)
    } else {
      setUserProposalsStats(null)
    }
  }, [userAddress])

  // Если кошелек не подключен
  if (!network || !userAddress) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center py-12">
            <div className="mb-4">
              <span className="text-6xl">🔗</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Подключите кошелек</h3>
            <p className="text-gray-500 mb-6">Для работы с пропозалами необходимо подключить кошелек</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            📋 Управление пропозалами
          </h1>
          <p className="text-gray-600">
            Просматривайте, подписывайте и выполняйте свои пропозалы
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">📊 Статистика пропозалов</h2>
              <button
                onClick={() => userAddress && loadUserProposalsStats(userAddress)}
                disabled={statsLoading}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 text-sm"
              >
                {statsLoading ? '⏳ Загрузка...' : '🔄 Обновить'}
              </button>
            </div>

            {/* Статистика пропозалов */}
            {userProposalsStats && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-3">📊 Статистика</h3>
                {userProposalsStats.total > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-2xl text-gray-800">{userProposalsStats.total}</div>
                      <div className="text-gray-600">Всего пропозалов</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-bold text-2xl ${userProposalsStats.byStatus.needsMySignature > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                        {userProposalsStats.byStatus.needsMySignature}
                      </div>
                      <div className="text-gray-600">Требуют вашей подписи</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-bold text-2xl ${userProposalsStats.byStatus.readyToExecute > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {userProposalsStats.byStatus.readyToExecute}
                      </div>
                      <div className="text-gray-600">Готовы к выполнению</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-2xl text-gray-500">{userProposalsStats.byStatus.executed}</div>
                      <div className="text-gray-600">Выполнены</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-gray-500">✨ У вас пока нет пропозалов</div>
                  </div>
                )}
              </div>
            )}

            {/* Фильтры пропозалов */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">🔍 Фильтровать пропозалы:</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setProposalsFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    proposalsFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📋 Все ({userProposalsStats?.total || 0})
                </button>
                <button
                  onClick={() => setProposalsFilter('needsSignature')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    proposalsFilter === 'needsSignature'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ✍️ Требуют подписи ({userProposalsStats?.byStatus.needsMySignature || 0})
                </button>
                <button
                  onClick={() => setProposalsFilter('readyToExecute')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    proposalsFilter === 'readyToExecute'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🚀 Готовы к выполнению ({userProposalsStats?.byStatus.readyToExecute || 0})
                </button>
                <button
                  onClick={() => setProposalsFilter('executed')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    proposalsFilter === 'executed'
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ✅ Выполнены ({userProposalsStats?.byStatus.executed || 0})
                </button>
              </div>
            </div>
          </div>

          {/* Список пропозалов */}
          <div>
            <UserProposals
              userAddress={userAddress}
              onProposalAction={handleUserProposalAction}
              refreshTrigger={userProposalsRefresh}
              className=""
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProposalsPage
