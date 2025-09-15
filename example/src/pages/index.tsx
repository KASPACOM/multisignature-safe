import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { SafeTransaction } from '@safe-global/types-kit'

import SafeOnChain, {
  UniversalFunctionCall,
  SafeCreationForm
} from '../lib/onchain'
import { SafeManagement, ProposalsPage } from '../components'
import SafeOffChain, { UniversalOperationResult } from '../lib/offchain'
import {
  formatAddress
} from '../lib/safe-common'
import { NETWORK_COLORS, getSupportedNetworks } from '../lib/constants'
import { Network, WalletState, ConnectionStatus } from '../lib/network-types'
import { networkProvider } from '../lib/network-provider'

interface SafeInfo {
  address: string
  owners: string[]
  threshold: number
  balance: string
  nonce: number
}

interface SignatureResult {
  signature: string
  r: string
  s: string
  v: number
  recoveryId: number
  encodedPacked: string
}

interface UniversalTransactionForm {
  contractAddress: string
  functionSignature: string
  functionParams: string[]
  ethValue: string
}

const SafeMultisigApp: React.FC = () => {
  // Состояние Network подключения
  const [network, setNetwork] = useState<Network | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    state: WalletState.Disconnected,
    isLoading: false
  })
  const [userAddress, setUserAddress] = useState<string>('')

  // Состояние управления разделами
  const [currentSection, setCurrentSection] = useState<'main' | 'proposals'>('main')

  // Состояние Safe
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null)

  // Состояние Safe подключения
  const [showSafeManagement, setShowSafeManagement] = useState(!safeInfo)
  const [predictedSafeAddress, setPredictedSafeAddress] = useState<string>('')

  // Состояние универсальной формы транзакций
  const [universalForm, setUniversalForm] = useState<UniversalTransactionForm>({
    contractAddress: '',
    functionSignature: '',
    functionParams: [''],
    ethValue: '0'
  })

  // Результат создания универсальной транзакции
  const [universalResult, setUniversalResult] = useState<UniversalOperationResult | null>(null)

  // Результат подписи хеша
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null)

  // Состояние загрузки
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({})
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  // Экземпляры классов  
  const [safeOnChain, setSafeOnChain] = useState<SafeOnChain | null>(null)
  const [safeOffChain] = useState(() => new SafeOffChain())

  // Инициализация при загрузке
  useEffect(() => {
    // Подписываемся на изменения состояния NetworkProvider
    const unsubscribe = networkProvider.onStatusChange((status: ConnectionStatus) => {
      console.log('🔄 React: Обновление состояния:', status)

      setConnectionStatus(status)

      if (status.network) {
        setNetwork(status.network)
      } else {
        setNetwork(null)
      }

      if (status.account) {
        setUserAddress(status.account)
      } else {
        setUserAddress('')
        // Возвращаемся на главную секцию при отключении
        setCurrentSection('main')
      }
    })

    // Проверяем текущее состояние при загрузке
    initializeApp()

    return () => {
      unsubscribe()
    }
  }, [])

  // Обновление safeOnChain при изменении Network
  useEffect(() => {
    if (network) {
      console.log('🔄 Создание нового SafeOnChain из-за изменения Network')

      // Если был подключен Safe, нужно переподключиться с новым Network
      const currentSafeAddress = safeInfo?.address
      const currentOwners = safeInfo?.owners
      const currentThreshold = safeInfo?.threshold

      const newSafeOnChain = new SafeOnChain(network)
      setSafeOnChain(newSafeOnChain)

      // Делаем SafeOnChain доступным глобально для отладки
      if (typeof window !== 'undefined') {
        // Добавляем SafeOnChain в window для отладки
        const w = window as any
        w.debugSafeOnChain = newSafeOnChain
        w.debugSafeOffChain = safeOffChain
        w.debugNetwork = network
        w.debugNetworkProvider = networkProvider

        console.log('🔧 Отладочные объекты доступны в консоли:')
        console.log('  - debugSafeOnChain - основной класс для блокчейн операций')
        console.log('  - debugSafeOffChain - класс для работы с STS и пропозалами')
        console.log('  - debugNetwork - текущий Network объект')
        console.log('  - debugNetworkProvider - NetworkProvider сервис')
      }

      // Если был подключенный Safe, автоматически переподключаемся
      if (currentSafeAddress && currentOwners && currentThreshold) {
        console.log('🔄 Переподключение к Safe:', currentSafeAddress)

        // Переподключаемся асинхронно
        setTimeout(async () => {
          try {
            await newSafeOnChain.connectToSafeWithForm({
              safeAddress: currentSafeAddress,
              owners: currentOwners,
              threshold: currentThreshold
            })
            console.log('✅ Safe автоматически переподключен')
          } catch (error) {
            console.error('❌ Ошибка автоматического переподключения Safe:', error)
            // Очищаем состояние Safe при ошибке
            setSafeInfo(null)
            setShowSafeManagement(true)
            showError('Safe отключен из-за смены коннекта. Переподключитесь.')
          }
        }, 100)
      }
    } else {
      setSafeOnChain(null)
      // При отсутствии Network очищаем все состояние Safe
      setSafeInfo(null)
      setShowSafeManagement(true)
    }
  }, [network])

  // Инициализация приложения
  const initializeApp = async () => {
    console.log('🚀 React: Инициализация приложения...')

    try {
      // Проверяем текущее состояние и попытаемся переподключиться
      const currentNetwork = await networkProvider.refresh()
      console.log('✅ React: Инициализация завершена:', {
        hasNetwork: !!currentNetwork,
        networkId: currentNetwork?.id?.toString()
      })
    } catch (error) {
      console.error('❌ React: Ошибка инициализации:', error)
    }
  }

  // Обработчики событий кошелька (теперь через NetworkProvider)
  // Не нужны - NetworkProvider обрабатывает это автоматически

  // Функции управления состоянием
  const setLoadingState = (key: string, value: boolean) => {
    setLoading(prev => ({ ...prev, [key]: value }))
  }

  const showError = (message: string) => {
    setError(message)
    setSuccess('')
    setTimeout(() => setError(''), 5000)
  }

  const showSuccess = (message: string) => {
    setSuccess(message)
    setError('')
    setTimeout(() => setSuccess(''), 5000)
  }


  // 1. Подключение кошелька через NetworkProvider
  const handleConnectWallet = async () => {
    console.log('🚀 React: Попытка подключения кошелька...')

    try {
      const connectedNetwork = await networkProvider.connect()
      showSuccess(`Кошелек подключен успешно! Сеть: ${connectedNetwork.id.toString()}`)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Ошибка подключения')
    }
  }

  // 2. Создание Safe с формой
  const handleCreateSafeWithForm = async (formData: SafeCreationForm) => {
    if (!safeOnChain || !network) {
      showError('Подключите кошелек')
      return
    }

    setLoadingState('createSafe', true)
    try {
      console.log('🚀 Создание Safe с формой:', formData)

      await safeOnChain.createSafeWithForm(formData)

      const safeAddress = safeOnChain.getCurrentSafeAddress()
      if (!safeAddress) {
        throw new Error('Не удалось получить адрес созданного Safe')
      }

      // Получаем информацию о Safe
      const safeData = await safeOnChain.getCurrentSafeInfo()
      setSafeInfo({
        address: safeData.address,
        owners: safeData.owners,
        threshold: safeData.threshold,
        balance: safeData.balance,
        nonce: safeData.nonce
      })

      // Скрываем форму управления
      setShowSafeManagement(false)

      showSuccess(`Safe создан и подключен: ${formatAddress(safeAddress)}`)
    } catch (error) {
      console.error('❌ Ошибка создания Safe:', error)
      showError(error instanceof Error ? error.message : 'Ошибка создания Safe')
    }
    setLoadingState('createSafe', false)
  }

  // Предсказание адреса Safe
  const handlePredictSafeAddress = async (formData: SafeCreationForm) => {
    if (!safeOnChain) {
      showError('Подключите кошелек')
      return
    }

    setLoadingState('predictAddress', true)
    try {
      console.log('🔮 Предсказываем адрес Safe по форме:', formData)

      const predictedAddress = await safeOnChain.getSafeAddressByForm(formData)
      setPredictedSafeAddress(predictedAddress)

      showSuccess(`Адрес Safe предсказан: ${formatAddress(predictedAddress)}`)
    } catch (error) {
      console.error('❌ Ошибка предсказания адреса:', error)
      showError(error instanceof Error ? error.message : 'Ошибка предсказания адреса')
    }
    setLoadingState('predictAddress', false)
  }

  // Создание универсального хеша транзакции
  const handleCreateUniversalHash = async () => {
    if (!safeOnChain || !safeInfo) {
      showError('Safe не подключен')
      return
    }

    setLoadingState('universalHash', true)
    setUniversalResult(null)

    try {
      if (!universalForm.contractAddress || !universalForm.functionSignature) {
        throw new Error('Заполните адрес контракта и сигнатуру функции')
      }

      // Парсим параметры функции из сигнатуры
      const paramTypes = universalForm.functionSignature
        .split('(')[1]
        ?.split(')')[0]
        ?.split(',')
        ?.map(p => p.trim())
        ?.filter(p => p.length > 0) || []

      const paramValues = universalForm.functionParams.slice(0, paramTypes.length)

      // Конвертируем параметры в правильные типы
      const convertedParams = paramValues.map((value, index) => {
        const paramType = paramTypes[index]
        if (!paramType) return value

        // Очищаем значение от пробелов
        const cleanValue = value.trim()
        if (!cleanValue) return value

        try {
          if (paramType.includes('uint') || paramType.includes('int')) {
            // Для чисел - парсим как BigInt
            if (cleanValue.includes('.')) {
              // Если есть десятичные, используем parseUnits
              return ethers.parseUnits(cleanValue, 18)
            } else {
              // Целое число
              return ethers.parseUnits(cleanValue, 0)
            }
          }
          if (paramType === 'address') {
            return ethers.getAddress(cleanValue) // Проверяем и форматируем адрес
          }
          if (paramType === 'bool') {
            return cleanValue.toLowerCase() === 'true'
          }
          // Для string, bytes и остальных оставляем как есть
          return cleanValue
        } catch (error) {
          console.warn(`Ошибка конвертации параметра ${index}: ${error}`)
          return cleanValue
        }
      })

      const functionCall: UniversalFunctionCall = {
        contractAddress: universalForm.contractAddress,
        functionSignature: universalForm.functionSignature,
        functionParams: convertedParams,
        value: universalForm.ethValue || '0'
      }

      console.log('🎯 Создаем универсальный хеш транзакции для:', functionCall)

      // Создаем хеш транзакции через SafeOnChain 
      const result = await safeOnChain.createUniversalTransactionHash(
        functionCall
      )

      // УБИРАЕМ отправку в STS на этапе создания хеша - она будет после подписания

      setUniversalResult({
        transactionHash: result.transactionHash,
        safeTransaction: result.safeTransaction,
        encodedData: result.encodedData,
        transactionDetails: result.transactionDetails
      })

      showSuccess(`✅ Хеш транзакции создан! 
        Хеш для подписи: ${result.transactionHash}
        Nonce: ${result.transactionDetails.nonce}
        
        ✍️ Следующий шаг: Нажмите "Подписать хеш EIP-712" для создания подписи и отправки в STS.`)

    } catch (error: any) {
      console.error('❌ Ошибка создания универсального хеша:', error)
      showError(`Ошибка: ${error.message}`)
    }

    setLoadingState('universalHash', false)
  }

  // Вспомогательная функция для отправки подписи в STS
  const sendSignatureToSTS = async (
    transactionHash: string, 
    userAddress: string
  ): Promise<boolean> => {
    if (!safeOffChain || !safeInfo) {
      console.log('⚠️ SafeOffChain или SafeInfo недоступны')
      return false
    }

    console.log('📤 Отправляем подписанную транзакцию в STS...')
    
    // Проверяем, существует ли транзакция в STS
    try {
      await safeOffChain.getTransaction(transactionHash)
      console.log('✅ Транзакция уже существует в STS. Перенаправляем в раздел "Мои пропозалы"')
      
      showSuccess(`✅ Транзакция уже существует в Safe Transaction Service!
        📋 Переходим к разделу "Мои пропозалы" для управления...`)

      // Переключаемся на раздел "Мои пропозалы" сразу
      setTimeout(() => {
        console.log('📋 Переключаемся на раздел "Мои пропозалы" - транзакция уже существует')
        setCurrentSection('proposals')
      }, 1500)
      
      return true
    } catch (error: any) {
      // Если транзакция не найдена (404 или текст ошибки), создаем новый пропозал
      if (error?.response?.status === 404 || 
          error?.status === 404 ||
          error?.message?.includes('No MultisigTransaction matches') ||
          error?.message?.includes('Transaction not found') ||
          error?.message?.includes('404') ||
          error?.message?.includes('Not Found')) {
        console.log('📝 Транзакции еще нет в STS, создаём пропозал...')
        await safeOffChain.proposeUniversalResult(
          safeInfo.address,
          universalResult!,
          userAddress,
          'Universal Function Call'
        )
        return true
      }
      // Если другая ошибка, прокидываем её дальше
      throw error
    }
  }

  // Подписание хеша транзакции
  const handleSignTransactionHash = async () => {
    if (!universalResult || !network || !safeOnChain || !safeInfo) {
      showError('Нет хеша для подписи, кошелек не подключен или Safe Manager недоступен')
      return
    }

    setLoadingState('signHash', true)
    setSignatureResult(null)

    try {
      console.log('🖋️ Подписываем транзакцию через Protocol Kit (EIP-712):', universalResult.transactionHash)

      // 1. Получаем данные пользователя
      const userAddress = await network.signer.getAddress()
      console.log('🔍 Пользовательский адрес:', userAddress)
      console.log('🔍 Хэш транзакции:', universalResult.transactionHash)

      // 2. Подписываем транзакцию через Safe SDK
      const safeSdk = safeOnChain.getSafeSdk()
      const safeTransaction = universalResult.safeTransaction

      if (!safeTransaction) {
        throw new Error('SafeTransaction не найдена в универсальном результате')
      }

      console.log('📝 Подписываем транзакцию через Safe SDK (EIP-712)...')
      const signedSafeTransaction = await safeSdk.signTransaction(safeTransaction)
      console.log('📊 Подписей в подписанной транзакции:', signedSafeTransaction.signatures.size)

      // 3. Извлекаем подпись пользователя
      const userSignature = signedSafeTransaction.signatures.get(userAddress) ||
        signedSafeTransaction.signatures.get(userAddress.toLowerCase()) ||
        signedSafeTransaction.signatures.get(ethers.getAddress(userAddress))

      if (!userSignature) {
        const availableKeys = Array.from(signedSafeTransaction.signatures.keys())
        console.log('🔍 Доступные ключи подписей:', availableKeys)
        throw new Error(`Подпись не найдена для адреса ${userAddress}. Доступные: ${availableKeys.join(', ')}`)
      }

      console.log('✅ Найдена подпись пользователя!')

      const signatureData = typeof userSignature === 'object' && userSignature && 'data' in userSignature
        ? String(userSignature.data)
        : String(userSignature)

      // 4. Обновляем состояние с результатами подписи
      universalResult.safeTransaction = signedSafeTransaction
      
      const sig = ethers.Signature.from(signatureData)
      const newSignatureResult: SignatureResult = {
        signature: signatureData,
        r: sig.r,
        s: sig.s,
        v: sig.v,
        recoveryId: sig.v,
        encodedPacked: ethers.solidityPacked(
          ['bytes', 'bytes32', 'bytes32', 'uint8'],
          [signatureData, sig.r, sig.s, sig.v]
        )
      }

      setSignatureResult(newSignatureResult)
      console.log('📦 EIP-712 подпись создана:', newSignatureResult)

      // 5. Отправляем подпись в STS (обрабатывает все внутри себя)
      try {
        await sendSignatureToSTS(universalResult.transactionHash, userAddress)
      } catch (stsError: any) {
        console.warn('⚠️ Не удалось отправить EIP-712 подпись в STS:', stsError)
        showError(`Ошибка отправки в STS: ${stsError.message}`)
      }

    } catch (error: any) {
      console.error('❌ Ошибка EIP-712 подписи:', error)
      showError(`Ошибка подписи: ${error.message}`)
    } finally {
      setLoadingState('signHash', false)
    }
  }

  // Копирование в буфер обмена
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showSuccess(`✅ ${label} скопировано в буфер обмена`)
    } catch (error) {
      console.error('Ошибка копирования:', error)
      showError('Не удалось скопировать')
    }
  }

  // Сброс формы универсальной транзакции
  const resetUniversalForm = () => {
    setUniversalForm({
      contractAddress: '',
      functionSignature: '',
      functionParams: [''],
      ethValue: '0'
    })
    setUniversalResult(null)
    setSignatureResult(null)
  }

  // Добавление параметра в форму
  const addFunctionParam = () => {
    setUniversalForm(prev => ({
      ...prev,
      functionParams: [...prev.functionParams, '']
    }))
  }

  // Удаление параметра из формы
  const removeFunctionParam = (index: number) => {
    setUniversalForm(prev => ({
      ...prev,
      functionParams: prev.functionParams.filter((_, i) => i !== index)
    }))
  }

  // Обновление параметра функции
  const updateFunctionParam = (index: number, value: string) => {
    setUniversalForm(prev => ({
      ...prev,
      functionParams: prev.functionParams.map((param, i) => i === index ? value : param)
    }))
  }

  // Отключение от Safe
  const handleDisconnectFromSafe = () => {
    if (safeOnChain) {
      safeOnChain.disconnect()
    }
    setSafeInfo(null)
    setUniversalResult(null)
    setSignatureResult(null)
    setPredictedSafeAddress('')
    setShowSafeManagement(true)
    showSuccess('Отключено от Safe')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🧩 Safe Multisig Manager
          </h1>
          <p className="text-gray-600">
            Создание и управление Safe мультисиг кошельком
          </p>
        </div>

        {/* Навигация между разделами */}
        {network && userAddress && (
          <div className="mb-8 flex justify-center">
            <div className="bg-white rounded-lg shadow p-1 flex">
              <button
                onClick={() => setCurrentSection('main')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${currentSection === 'main'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                🏠 Главная
              </button>
              <button
                onClick={() => setCurrentSection('proposals')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${currentSection === 'proposals'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                📋 Мои пропозалы
              </button>
            </div>
          </div>
        )}

        {/* Сообщения */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-100 border border-green-200 text-green-700 rounded-lg">
            {success}
          </div>
        )}

        {/* ГЛАВНАЯ СЕКЦИЯ */}
        {currentSection === 'main' && (
          <>
            {/* Статус подключения */}
            <div className="mb-8 p-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Подключение</h2>

              {connectionStatus.state !== WalletState.Connected ? (
                <div className="space-y-4">
                  <button
                    onClick={handleConnectWallet}
                    disabled={connectionStatus.isLoading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {connectionStatus.isLoading ? 'Подключение...' : 'Подключить кошелек'}
                  </button>

                  {/* Показываем состояние подключения */}
                  {connectionStatus.state !== WalletState.Disconnected && (
                    <div className="text-sm text-gray-600">
                      Состояние: {connectionStatus.state}
                      {connectionStatus.error && (
                        <div className="text-red-600 mt-1">{connectionStatus.error}</div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Поддерживаемые сети:</h3>
                    <div className="flex flex-wrap gap-2">
                      {getSupportedNetworks().map((network) => (
                        <div
                          key={network.chainId}
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: NETWORK_COLORS[network.chainId] + '20',
                            color: NETWORK_COLORS[network.chainId]
                          }}
                        >
                          {network.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p>Подключен кошелек: {formatAddress(userAddress)}</p>

                </div>
              )}
            </div>


            {/* Информация о Safe */}
            {safeInfo && (
              <div className="mb-8 p-6 bg-white rounded-lg shadow">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Информация о Safe</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowSafeManagement(true)}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                    >
                      🔄 Переподключиться
                    </button>
                    <button
                      onClick={handleDisconnectFromSafe}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                    >
                      🔌 Отключиться
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p><strong>Адрес:</strong> {formatAddress(safeInfo.address)}</p>
                    <p><strong>Порог:</strong> {safeInfo.threshold} из {safeInfo.owners.length}</p>
                  </div>
                  <div>
                    <p><strong>Баланс:</strong> {safeInfo.balance} ETH</p>
                    <p><strong>Nonce:</strong> {safeInfo.nonce}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <strong>Владельцы:</strong>
                  <ul className="mt-2 space-y-1">
                    {safeInfo.owners.map((owner, index) => (
                      <li key={index} className="text-sm font-mono">
                        {formatAddress(owner)}
                        {owner.toLowerCase() === userAddress.toLowerCase() && (
                          <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                            Вы
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

              </div>
            )}

            {/* Управление Safe */}
            {network && showSafeManagement && (
              <SafeManagement
                onCreate={handleCreateSafeWithForm}
                onPredict={handlePredictSafeAddress}
                loading={loading.createSafe}
                predicting={loading.predictAddress}
                predictedAddress={predictedSafeAddress}
                userAddress={userAddress}
                className="mb-8"
              />
            )}

            {network && safeInfo && (
              <div className="space-y-8">
                {/* Шаги 2-4: Доступны только когда Safe подключен */}

                {/* Универсальные транзакции */}
                <div className="p-6 bg-white rounded-lg shadow">
                  <h2 className="text-xl font-semibold mb-4">🎯 Универсальные вызовы функций</h2>
                  <p className="text-gray-600 mb-6">
                    Создайте хеш для любого вызова функции смарт-контракта. Укажите адрес контракта, сигнатуру функции и параметры.
                  </p>

                  {/* Основная форма */}
                  <div className="space-y-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Адрес контракта *
                        </label>
                        <input
                          type="text"
                          value={universalForm.contractAddress}
                          onChange={(e) => setUniversalForm(prev => ({ ...prev, contractAddress: e.target.value }))}
                          placeholder="0x..."
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ETH Value (необязательно)
                        </label>
                        <input
                          type="text"
                          value={universalForm.ethValue}
                          onChange={(e) => setUniversalForm(prev => ({ ...prev, ethValue: e.target.value }))}
                          placeholder="0"
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Сигнатура функции *
                        <span className="text-xs text-gray-500 ml-2">
                          (например: mint(address,uint256) или transfer(address,uint256))
                        </span>
                      </label>
                      <input
                        type="text"
                        value={universalForm.functionSignature}
                        onChange={(e) => setUniversalForm(prev => ({ ...prev, functionSignature: e.target.value }))}
                        placeholder="functionName(type1,type2)"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Параметры функции
                          <span className="text-xs text-gray-500 ml-2">
                            (в том же порядке, что и в сигнатуре)
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={addFunctionParam}
                          className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-200 transition-colors"
                        >
                          + Добавить параметр
                        </button>
                      </div>

                      <div className="space-y-3">
                        {universalForm.functionParams.map((param, index) => (
                          <div key={index} className="flex gap-3 items-center">
                            <div className="flex-1">
                              <input
                                type="text"
                                value={param}
                                onChange={(e) => updateFunctionParam(index, e.target.value)}
                                placeholder={`Параметр ${index + 1} (например: 0x123... или 100)`}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                              />
                            </div>
                            {universalForm.functionParams.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeFunctionParam(index)}
                                className="px-3 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                                title="Удалить параметр"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                        <p className="font-medium mb-2">Примеры параметров:</p>
                        <ul className="space-y-1 text-xs">
                          <li><strong>address:</strong> 0x1234567890123456789012345678901234567890</li>
                          <li><strong>uint256:</strong> 1000 (или 100.5 для токенов с decimals)</li>
                          <li><strong>string:</strong> Hello World</li>
                          <li><strong>bool:</strong> true или false</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Кнопки действий */}
                  <div className="flex gap-4">
                    <button
                      onClick={handleCreateUniversalHash}
                      disabled={loading.universalHash || !safeInfo}
                      className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {loading.universalHash ? 'Создание...' : '🎯 Создать хеш транзакции'}
                    </button>

                    <button
                      onClick={resetUniversalForm}
                      className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      Сбросить форму
                    </button>
                  </div>

                  {/* Результат */}
                  {universalResult && (
                    <div className="mt-6 p-4 bg-green-50 rounded-lg">
                      <h3 className="font-semibold text-green-900 mb-4">✅ Хеш транзакции создан!</h3>

                      <div className="space-y-3 text-sm">
                        <div>
                          <label className="font-medium text-gray-700">Хеш для подписи:</label>
                          <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                            {universalResult.transactionHash}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="font-medium text-gray-700">Контракт:</label>
                            <div className="mt-1 p-2 bg-white border rounded font-mono text-xs">
                              {formatAddress(universalResult.transactionDetails.to)}
                            </div>
                          </div>

                          <div>
                            <label className="font-medium text-gray-700">ETH Value:</label>
                            <div className="mt-1 p-2 bg-white border rounded">
                              {universalResult.transactionDetails.value} ETH
                            </div>
                          </div>

                          <div>
                            <label className="font-medium text-gray-700">Nonce:</label>
                            <div className="mt-1 p-2 bg-white border rounded">
                              {universalResult.transactionDetails.nonce}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="font-medium text-gray-700">Encoded Data:</label>
                          <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                            {universalResult.encodedData}
                          </div>
                        </div>

                        {/* Кнопка подписания */}
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={handleSignTransactionHash}
                            disabled={loading.signHash || signatureResult !== null}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                          >
                            {loading.signHash ? 'Подписание...' : '🖋️ Подписать транзакцию (EIP-712)'}
                          </button>

                          <button
                            onClick={() => copyToClipboard(universalResult.transactionHash, 'Хеш транзакции')}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                          >
                            📋 Скопировать хеш
                          </button>
                        </div>

                        <div className="mt-4 p-3 bg-blue-50 border-l-4 border-blue-400">
                          <p className="text-blue-800 text-sm">
                            💡 <strong>Следующие шаги:</strong> Нажмите "Подписать транзакцию" для автоматической подписи через ваш кошелек, или скопируйте хеш для ручной подписи.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Результат подписи */}
                  {signatureResult && (
                    <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                      <h3 className="font-semibold text-purple-900 mb-4">🖋️ Транзакция подписана!</h3>

                      <div className="space-y-3 text-sm">
                        <div>
                          <label className="font-medium text-gray-700">Подпись (EIP-712):</label>
                          <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                            {signatureResult.signature}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => copyToClipboard(signatureResult.signature, 'Подпись')}
                              className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200"
                            >
                              📋 Скопировать подпись
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="font-medium text-gray-700">R:</label>
                            <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                              {signatureResult.r}
                            </div>
                          </div>
                          <div>
                            <label className="font-medium text-gray-700">S:</label>
                            <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                              {signatureResult.s}
                            </div>
                          </div>
                          <div>
                            <label className="font-medium text-gray-700">V:</label>
                            <div className="mt-1 p-2 bg-white border rounded">
                              {signatureResult.v}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 p-3 bg-green-50 border-l-4 border-green-400">
                          <p className="text-green-800 text-sm">
                            ✅ <strong>Успешно!</strong> Транзакция подписана и отправлена в STS. Проверьте раздел "Пропозалы пользователя" для подтверждения.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </>
        )}

        {/* РАЗДЕЛ УПРАВЛЕНИЯ ПРОПОЗАЛАМИ */}
        {currentSection === 'proposals' && (
          <ProposalsPage
            network={network}
            userAddress={userAddress}
            safeOnChain={safeOnChain}
            safeOffChain={safeOffChain}
            safeInfo={safeInfo}
            setSafeInfo={setSafeInfo}
            showError={showError}
            showSuccess={showSuccess}
          />
        )}

      </div>
    </div>
  )
}

export default SafeMultisigApp
