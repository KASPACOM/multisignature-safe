import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'

import SafeOnChain, { 
  SafeConnectionForm,
} from '../lib/onchain'
import UserProposals, { ProposalAction } from './UserProposals'
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
  onNavigateToSafeCreation?: (safeAddress: string, owners: string[], threshold: number) => void
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
  loadPendingTransactions,
  onNavigateToSafeCreation
}) => {
  // Состояние статистики пропозалов пользователя
  const [userProposalsStats, setUserProposalsStats] = useState<UserProposalsStats | null>(null)
  const [statsLoading, setStatsLoading] = useState<boolean>(false)
  const [userProposalsRefresh, setUserProposalsRefresh] = useState(0)
  
  // Состояние фильтров пропозалов
  const [proposalsFilter, setProposalsFilter] = useState<'all' | 'needsSignature' | 'readyToExecute' | 'executed'>('all')
  
  // Состояние Safe контрактов без пропозалов
  const [safesWithoutProposals, setSafesWithoutProposals] = useState<string[]>([])
  const [safesLoading, setSafesLoading] = useState<boolean>(false)

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

  // Загрузка Safe контрактов без пропозалов
  const loadSafesWithoutProposals = async (address: string) => {
    console.log('🏠 Загружаем Safe контракты без пропозалов для:', address)
    setSafesLoading(true)

    try {
      const safes = await safeOffChain.getUserSafesWithoutProposals(address)
      setSafesWithoutProposals(safes)
      
      console.log('✅ Safe контракты без пропозалов загружены:', safes.length)
    } catch (error) {
      console.error('❌ Ошибка загрузки Safe контрактов:', error)
      setSafesWithoutProposals([])
    } finally {
      setSafesLoading(false)
    }
  }

  // Обработка действий с пропозалами пользователя
  const handleUserProposalAction = async (proposal: any, action: ProposalAction) => {
    console.log(`🎬 Действие с пропозалом пользователя: ${action}`, proposal.safeTxHash)

    try {
      switch (action) {
        case ProposalAction.SIGN:
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
          
          // Подписываем пропозал через EIP-712 подпись
          console.log('📝 Подписываем пропозал через EIP-712:', proposal.safeTxHash)
          
          if (!network) {
            showError('Network не подключен')
            return
          }
          
          try {
            // 1. Получаем данные транзакции из STS
            const stsTransaction = await safeOffChain.getTransaction(proposal.safeTxHash)
            
            // 2. Восстанавливаем SafeTransaction из данных STS
            const safeTransaction = await safeOnChain.createSafeTransaction({
              to: stsTransaction.to,
              value: stsTransaction.value || '0',
              data: stsTransaction.data || '0x'
            })
            
            // Устанавливаем nonce из STS
            if (stsTransaction.nonce !== undefined) {
              safeTransaction.data.nonce = parseInt(stsTransaction.nonce.toString())
            }
            
            console.log('📝 Подписываем восстановленную транзакцию через Safe SDK (EIP-712)...')
            
            // 3. Подписываем транзакцию через Safe SDK (вызовет MetaMask)
            const safeSdk = safeOnChain.getSafeSdk()
            const signedSafeTransaction = await safeSdk.signTransaction(safeTransaction)
            
            // 4. Получаем адрес пользователя и его подпись
            const userAddress = await network.signer.getAddress()
            const userSignature = signedSafeTransaction.signatures.get(userAddress) ||
              signedSafeTransaction.signatures.get(userAddress.toLowerCase()) ||
              signedSafeTransaction.signatures.get(ethers.getAddress(userAddress))
            
            if (!userSignature) {
              const availableKeys = Array.from(signedSafeTransaction.signatures.keys())
              throw new Error(`Подпись не найдена для адреса ${userAddress}. Доступные: ${availableKeys.join(', ')}`)
            }
            
            const signatureData = typeof userSignature === 'object' && userSignature && 'data' in userSignature
              ? String(userSignature.data)
              : String(userSignature)
            
            console.log('✅ EIP-712 подпись создана:', signatureData.slice(0, 20) + '...')
            
            // 5. Отправляем реальную подпись в STS
            await safeOffChain.confirmTransaction(proposal.safeTxHash, signatureData)
            showSuccess('✅ Пропозал подписан через EIP-712 и подтверждён в STS!')
            
          } catch (signError: any) {
            console.error('❌ Ошибка подписи EIP-712:', signError)
            showError(`Ошибка подписи: ${signError.message}`)
            return
          }
          
          // Точечное обновление пропозала произойдет автоматически через UserProposals
          break

        case ProposalAction.EXECUTE:
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
          
          // Точечное обновление пропозала произойдет автоматически через UserProposals
          
          if (safeInfo) {
            // Обновляем информацию о Safe сразу
            const updatedSafeInfo = await safeOnChain.getCurrentSafeInfo()
            setSafeInfo({
              address: updatedSafeInfo.address,
              owners: updatedSafeInfo.owners,
              threshold: updatedSafeInfo.threshold,
              balance: updatedSafeInfo.balance,
              nonce: updatedSafeInfo.nonce
            })
            
            // Обновляем список транзакций с задержкой
            if (loadPendingTransactions) {
              setTimeout(async () => {
                await loadPendingTransactions(safeInfo.address)
              }, 2000)
            }
          }
          break

        case ProposalAction.VIEW:
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

  // Обработка клика по Safe контракту
  const handleSafeClick = async (safeAddress: string) => {
    console.log('🏠 Клик по Safe контракту:', safeAddress)
    
    try {
      // Получаем информацию о Safe из STS
      const safeInfoFromSTS = await safeOffChain.getSafeInfo(safeAddress)
      
      console.log('📋 Информация о Safe:', {
        address: safeAddress,
        owners: safeInfoFromSTS.owners,
        threshold: safeInfoFromSTS.threshold
      })
      
      // Переходим на экран создания Safe с заполненными данными
      if (onNavigateToSafeCreation) {
        onNavigateToSafeCreation(safeAddress, safeInfoFromSTS.owners, safeInfoFromSTS.threshold)
      } else {
        showError('Функция навигации к созданию Safe не настроена')
      }
      
    } catch (error) {
      console.error('❌ Ошибка получения информации о Safe:', error)
      showError(`Не удалось получить информацию о Safe ${formatAddress(safeAddress)}`)
    }
  }

  // Обновление пропозалов пользователя
  const refreshUserProposals = () => {
    setUserProposalsRefresh(prev => prev + 1)
    
    // Также обновляем статистику пропозалов и Safe контракты
    if (userAddress) {
      loadUserProposalsStats(userAddress)
      loadSafesWithoutProposals(userAddress)
    }
  }

  // Точечное обновление одного пропозала (передается в UserProposals)
  const handleSingleProposalUpdate = (safeTxHash: string) => {
    console.log('🎯 Запрос точечного обновления пропозала:', safeTxHash)
    // Логика обновления будет в самом UserProposals компоненте через updateSingleProposal
    // Здесь мы можем дополнительно обновить статистику
    if (userAddress) {
      setTimeout(() => {
        loadUserProposalsStats(userAddress)
      }, 2000) // Обновляем статистику с задержкой
    }
  }

  // Загружаем статистику и Safe контракты при подключении пользователя
  useEffect(() => {
    if (userAddress) {
      loadUserProposalsStats(userAddress)
      loadSafesWithoutProposals(userAddress)
    } else {
      setUserProposalsStats(null)
      setSafesWithoutProposals([])
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

          {/* Секция Safe контрактов без пропозалов */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">🏠 Мои Safe контракты</h2>
              <button
                onClick={() => userAddress && loadSafesWithoutProposals(userAddress)}
                disabled={safesLoading}
                className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 text-sm"
              >
                {safesLoading ? '⏳ Загрузка...' : '🔄 Обновить'}
              </button>
            </div>

            {safesLoading ? (
              <div className="text-center py-8">
                <div className="text-gray-500">⏳ Загружаем ваши Safe контракты...</div>
              </div>
            ) : safesWithoutProposals.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4">
                  💡 Нажмите на адрес Safe контракта, чтобы создать пропозал для него
                </p>
                {safesWithoutProposals.map((safeAddress) => (
                  <div
                    key={safeAddress}
                    onClick={() => handleSafeClick(safeAddress)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm text-gray-800">
                          {formatAddress(safeAddress)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          🏠 Safe контракт без активных пропозалов
                        </div>
                      </div>
                      <div className="text-blue-600 text-sm">
                        ➡️ Создать пропозал
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-500">
                  ✨ У вас пока нет Safe контрактов без активных пропозалов
                </div>
                <div className="text-sm text-gray-400 mt-2">
                  Создайте Safe контракт или дождитесь выполнения всех пропозалов
                </div>
              </div>
            )}
          </div>

          {/* Список пропозалов */}
          <div>
            <UserProposals
              userAddress={userAddress}
              onProposalAction={handleUserProposalAction}
              refreshTrigger={userProposalsRefresh}
              onSingleProposalUpdate={handleSingleProposalUpdate}
              className=""
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProposalsPage
