import React, { useState, useEffect } from 'react'
import SafeOffChain, { UserProposal, UserProposalsFilter } from '../lib/offchain'
import { formatAddress, formatEthValue } from '../lib/safe-common'

interface UserProposalsProps {
  userAddress: string
  className?: string
  onProposalAction?: (proposal: UserProposal, action: 'sign' | 'execute' | 'view') => void
  refreshTrigger?: number // Для принудительного обновления извне
}

interface ProposalStats {
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
}

type ProposalFilter = 'all' | 'needsMySignature' | 'waitingForOthers' | 'readyToExecute' | 'executed'

const UserProposals: React.FC<UserProposalsProps> = ({
  userAddress,
  className = "",
  onProposalAction,
  refreshTrigger
}) => {
  const [safeOffChain] = useState(() => new SafeOffChain())
  const [proposals, setProposals] = useState<UserProposal[]>([])
  const [stats, setStats] = useState<ProposalStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [filter, setFilter] = useState<ProposalFilter>('all')
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null)

  // Загрузка пропозалов пользователя
  const loadUserProposals = async () => {
    if (!userAddress) return

    setLoading(true)
    setError('')

    try {
      console.log('📥 Загружаем пропозалы пользователя:', userAddress)
      
      // Получаем статистику пропозалов
      const statsData = await safeOffChain.getUserProposalsStats(userAddress)
      setStats(statsData)
      
      // Получаем все пропозалы пользователя
      const userProposalsFilter: UserProposalsFilter = {
        userAddress,
        sortBy: 'submissionDate',
        sortOrder: 'desc',
        limit: 50
      }
      
      const userProposals = await safeOffChain.getUserProposals(userProposalsFilter)
      setProposals(userProposals)
      
      console.log('✅ Пропозалы загружены:', {
        stats: statsData,
        proposals: userProposals.length
      })

    } catch (err) {
      console.error('❌ Ошибка загрузки пропозалов:', err)
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  // Эффект для начальной загрузки и обновления при изменении пользователя
  useEffect(() => {
    loadUserProposals()
  }, [userAddress, refreshTrigger])

  // Фильтрация пропозалов по статусу
  const getFilteredProposals = (): UserProposal[] => {
    if (!stats) return proposals

    switch (filter) {
      case 'needsMySignature':
        return proposals.filter(p => {
          if (p.isExecuted) return false
          const userHasSigned = p.confirmations.some(
            conf => conf.owner.toLowerCase() === userAddress.toLowerCase()
          )
          return !userHasSigned
        })

      case 'waitingForOthers':
        return proposals.filter(p => {
          if (p.isExecuted) return false
          const userHasSigned = p.confirmations.some(
            conf => conf.owner.toLowerCase() === userAddress.toLowerCase()
          )
          const hasEnoughSignatures = p.confirmations.length >= p.confirmationsRequired
          return userHasSigned && !hasEnoughSignatures
        })

      case 'readyToExecute':
        return proposals.filter(p => {
          if (p.isExecuted) return false
          return p.confirmations.length >= p.confirmationsRequired
        })

      case 'executed':
        return proposals.filter(p => p.isExecuted)

      case 'all':
      default:
        return proposals
    }
  }

  // Получение иконки статуса пропозала
  const getProposalStatusIcon = (proposal: UserProposal): { icon: string, color: string, text: string } => {
    if (proposal.isExecuted) {
      return { 
        icon: '✅', 
        color: 'text-green-600', 
        text: 'Выполнено' 
      }
    }

    const userHasSigned = proposal.confirmations.some(
      conf => conf.owner.toLowerCase() === userAddress.toLowerCase()
    )
    const hasEnoughSignatures = proposal.confirmations.length >= proposal.confirmationsRequired

    if (!userHasSigned) {
      return { 
        icon: '✍️', 
        color: 'text-orange-600', 
        text: 'Требует вашей подписи' 
      }
    }

    if (hasEnoughSignatures) {
      return { 
        icon: '🚀', 
        color: 'text-blue-600', 
        text: 'Готово к выполнению' 
      }
    }

    return { 
      icon: '⏳', 
      color: 'text-yellow-600', 
      text: 'Ожидает других подписей' 
    }
  }

  // Обработка действий с пропозалами
  const handleProposalAction = (proposal: UserProposal, action: 'sign' | 'execute' | 'view') => {
    console.log(`🎬 Действие с пропозалом: ${action}`, proposal.safeTxHash)
    onProposalAction?.(proposal, action)
  }

  // Переключение развернутого отображения пропозала
  const toggleExpandedProposal = (safeTxHash: string) => {
    setExpandedProposal(expandedProposal === safeTxHash ? null : safeTxHash)
  }

  const filteredProposals = getFilteredProposals()

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Заголовок */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              📋 Мои пропозалы
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Транзакции, назначенные на {formatAddress(userAddress)}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={loadUserProposals}
              disabled={loading}
              className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 transition-colors text-sm"
            >
              {loading ? '🔄' : '🔄'} Обновить
            </button>
            
            {!safeOffChain.isSTSAvailable() && (
              <div className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                Локальный режим
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Статистика */}
      {stats && (
        <div className="px-6 py-4 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Всего</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.byStatus.needsMySignature}</div>
              <div className="text-sm text-gray-600">Требуют подписи</div>
            </div>
            
            <div className="text-2xl font-bold text-blue-600 text-center">
              <div>{stats.byStatus.readyToExecute}</div>
              <div className="text-sm text-gray-600">Готовы к выполнению</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.byStatus.executed}</div>
              <div className="text-sm text-gray-600">Выполнено</div>
            </div>
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div className="px-6 py-3 border-b border-gray-100">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: '📋 Все', count: stats?.total || 0 },
            { key: 'needsMySignature', label: '✍️ Требуют подписи', count: stats?.byStatus.needsMySignature || 0 },
            { key: 'waitingForOthers', label: '⏳ Ожидают других', count: stats?.byStatus.waitingForOthers || 0 },
            { key: 'readyToExecute', label: '🚀 Готовы к выполнению', count: stats?.byStatus.readyToExecute || 0 },
            { key: 'executed', label: '✅ Выполненные', count: stats?.byStatus.executed || 0 },
          ].map((filterOption) => (
            <button
              key={filterOption.key}
              onClick={() => setFilter(filterOption.key as ProposalFilter)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filter === filterOption.key
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filterOption.label}
              {filterOption.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-white rounded-full text-xs">
                  {filterOption.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Сообщения об ошибках */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <div className="flex items-center gap-2">
            <span>❌</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Состояние загрузки */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span>Загрузка пропозалов...</span>
          </div>
        </div>
      )}

      {/* Список пропозалов */}
      {!loading && (
        <div className="px-6 py-4">
          {filteredProposals.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {filter === 'all' ? (
                <div>
                  <div className="text-4xl mb-3">📭</div>
                  <div className="text-lg font-medium mb-2">Нет пропозалов</div>
                  <div className="text-sm">
                    {safeOffChain.isSTSAvailable() 
                      ? 'STS не содержит пропозалов для этого пользователя' 
                      : 'Нет сохраненных пропозалов в локальном хранилище'
                    }
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-2xl mb-2">🔍</div>
                  <div>Нет пропозалов с таким статусом</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProposals.map((proposal) => {
                const status = getProposalStatusIcon(proposal)
                const isExpanded = expandedProposal === proposal.safeTxHash
                
                return (
                  <div key={proposal.safeTxHash} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Основная информация */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-lg ${status.color}`}>{status.icon}</span>
                          <div>
                            <div className="font-medium text-gray-900">
                              {formatAddress(proposal.to)} 
                              {proposal.value !== '0' && (
                                <span className="ml-2 text-sm text-green-600">
                                  {formatEthValue(proposal.value)} ETH
                                </span>
                              )}
                            </div>
                            <div className={`text-sm ${status.color}`}>
                              {status.text}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            Nonce: {proposal.nonce}
                          </span>
                          
                          <button
                            onClick={() => toggleExpandedProposal(proposal.safeTxHash)}
                            className="p-1 rounded hover:bg-gray-100"
                          >
                            <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                              ▼
                            </span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Краткая информация о подписях */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Подписи:</span>
                            <span className={`ml-1 ${
                              proposal.confirmations.length >= proposal.confirmationsRequired 
                                ? 'text-green-600' 
                                : 'text-orange-600'
                            }`}>
                              {proposal.confirmations.length} / {proposal.confirmationsRequired}
                            </span>
                          </div>
                          
                          <div>
                            <span className="font-medium">Safe:</span>
                            <span className="ml-1">{formatAddress(proposal.safeAddress)}</span>
                          </div>
                          
                          <div>
                            <span className="font-medium">Дата:</span>
                            <span className="ml-1">
                              {new Date(proposal.submissionDate).toLocaleDateString('ru-RU')}
                            </span>
                          </div>
                        </div>
                        
                        {/* Кнопки действий */}
                        <div className="flex gap-2">
                          {!proposal.isExecuted && (
                            <>
                              {!proposal.confirmations.some(conf => 
                                conf.owner.toLowerCase() === userAddress.toLowerCase()
                              ) && (
                                <button
                                  onClick={() => handleProposalAction(proposal, 'sign')}
                                  className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-sm hover:bg-orange-200 transition-colors"
                                >
                                  ✍️ Подписать
                                </button>
                              )}
                              
                              {proposal.confirmations.length >= proposal.confirmationsRequired && (
                                <button
                                  onClick={() => handleProposalAction(proposal, 'execute')}
                                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200 transition-colors"
                                >
                                  🚀 Выполнить
                                </button>
                              )}
                            </>
                          )}
                          
                          <button
                            onClick={() => handleProposalAction(proposal, 'view')}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors"
                          >
                            👁️ Детали
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Развернутая информация */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50 p-4">
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm font-medium text-gray-700">TX Hash:</label>
                            <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                              {proposal.safeTxHash}
                            </div>
                          </div>
                          
                          {proposal.data && proposal.data !== '0x' && (
                            <div>
                              <label className="text-sm font-medium text-gray-700">Data:</label>
                              <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                                {proposal.data.slice(0, 100)}
                                {proposal.data.length > 100 && '...'}
                              </div>
                            </div>
                          )}
                          
                          {proposal.confirmations.length > 0 && (
                            <div>
                              <label className="text-sm font-medium text-gray-700 mb-2 block">
                                Подписи ({proposal.confirmations.length}):
                              </label>
                              <div className="space-y-2">
                                {proposal.confirmations.map((conf, index) => (
                                  <div key={index} className="flex items-center gap-3 p-2 bg-white border rounded">
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">
                                        {formatAddress(conf.owner)}
                                        {conf.owner.toLowerCase() === userAddress.toLowerCase() && (
                                          <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                            Вы
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {new Date(conf.submissionDate).toLocaleString('ru-RU')}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      {conf.signatureType || 'EOA'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {proposal.dataDecoded && (
                            <div>
                              <label className="text-sm font-medium text-gray-700">Декодированные данные:</label>
                              <div className="mt-1 p-2 bg-white border rounded text-xs">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(proposal.dataDecoded, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default UserProposals
