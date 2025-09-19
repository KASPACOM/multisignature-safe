import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { SafeTransaction } from '@safe-global/types-kit'

import SafeOnChain, {
  UniversalFunctionCall,
  SafeCreationForm,
  SafeConnectionForm as SafeConnectionFormData
} from '../lib/onchain'
import { SafeManagement, ProposalsPage } from '../components'
import { ContractSelector } from '../components/ContractSelector'
import { FunctionSelector } from '../components/FunctionSelector'
import { ParameterForm } from '../components/ParameterForm'
import { ContractDropdown } from '../components/ContractDropdown'
import { FunctionDropdown } from '../components/FunctionDropdown'
import { ContractInfo } from '../components/TokenInfo'
import SafeOffChain, { UniversalOperationResult } from '../lib/offchain'
import {
  formatAddress
} from '../lib/safe-common'
import { NETWORK_COLORS, getSupportedNetworks } from '../lib/constants'
import { Network, WalletState, ConnectionStatus } from '../lib/network-types'
import { networkProvider } from '../lib/network-provider'
import { ContractABI, ParsedFunction, FunctionFormData } from '../lib/contract-types'
import { contractRegistry } from '../lib/contract-registry'

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

// Enum для секций приложения
enum AppSection {
  PROPOSALS = 'proposals',
  CREATE_PROPOSAL = 'main'
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
  const [currentSection, setCurrentSection] = useState<AppSection>(AppSection.PROPOSALS)

  // Состояние Safe
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null)

  // Состояние Safe подключения
  const [showSafeManagement, setShowSafeManagement] = useState(false)
  const [predictedSafeAddress, setPredictedSafeAddress] = useState<string>('')

  // Состояние универсальной формы транзакций
  const [universalForm, setUniversalForm] = useState<UniversalTransactionForm>({
    contractAddress: '',
    functionSignature: '',
    functionParams: [''],
    ethValue: '0'
  })

  // Состояние для нового UI с ABI
  const [selectedContract, setSelectedContract] = useState<ContractABI | null>(null)
  const [selectedFunction, setSelectedFunction] = useState<ParsedFunction | null>(null)
  const [structuredFormData, setStructuredFormData] = useState<FunctionFormData>({
    parameters: {},
    ethValue: '0'
  })
  const [useStructuredMode, setUseStructuredMode] = useState<boolean>(true)

  // Результат создания универсальной транзакции
  const [universalResult, setUniversalResult] = useState<UniversalOperationResult | null>(null)

  // Результат подписи хеша
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null)

  // Состояние загрузки контрактов
  const [contractsLoading, setContractsLoading] = useState<boolean>(false)
  const [contractsError, setContractsError] = useState<string | null>(null)

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
        setCurrentSection(AppSection.CREATE_PROPOSAL)
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

      // Инициализируем ContractRegistry для новой сети
      console.log('🔗 Инициализируем ContractRegistry для chainId:', network.id)
      contractRegistry.initializeForChain(network.id)
      
      // Загружаем контракты асинхронно
      loadContractsForNetwork()

      // Если был подключен Safe, нужно переподключиться с новым Network
      const currentSafeAddress = safeInfo?.address
      const currentOwners = safeInfo?.owners
      const currentThreshold = safeInfo?.threshold

      const newSafeOnChain = new SafeOnChain(network)
      setSafeOnChain(newSafeOnChain)

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
            if (currentSection === AppSection.CREATE_PROPOSAL) {
            setShowSafeManagement(true)
            }
            showError('Safe отключен из-за смены коннекта. Переподключитесь.')
          }
        }, 100)
      }
    } else {
      setSafeOnChain(null)
      // При отсутствии Network очищаем все состояние Safe
      setSafeInfo(null)
      if (currentSection === AppSection.CREATE_PROPOSAL) {
      setShowSafeManagement(true)
      }
    }
  }, [network])

  // Автоматически показываем Safe Management при переключении на страницу "Создание пропозала"
  useEffect(() => {
    if (currentSection === AppSection.CREATE_PROPOSAL && !safeInfo) {
      setShowSafeManagement(true)
    }
  }, [currentSection, safeInfo])

  // Очищаем состояние формы при переключении на страницу "Создание пропозала"
  useEffect(() => {
    if (currentSection === AppSection.CREATE_PROPOSAL) {
      // Очищаем только если нет активного Safe
      if (!safeInfo) {
        setUniversalForm({
          contractAddress: '',
          functionSignature: '',
          functionParams: [''],
          ethValue: '0'
        })
        setUniversalResult(null)
        setSignatureResult(null)
        
        // Очищаем новые состояния
        setSelectedContract(null)
        setSelectedFunction(null)
        setStructuredFormData({
          parameters: {},
          ethValue: '0'
        })
      }
    }
  }, [currentSection, safeInfo])

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

  // Загрузка контрактов для текущей сети
  const loadContractsForNetwork = async () => {
    setContractsLoading(true)
    setContractsError(null)

    try {
      console.log('📦 Начинаем загрузку контрактов из API...')
      await contractRegistry.loadContracts({
        limit: 100, // Загружаем первые 100 контрактов
        trusted: true // Только доверенные контракты
      })
      console.log('✅ Контракты успешно загружены')
    } catch (error: any) {
      console.error('❌ Ошибка загрузки контрактов:', error)
      setContractsError(error.message)
      showError(`Не удалось загрузить контракты: ${error.message}`)
    } finally {
      setContractsLoading(false)
    }
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

  // Функция навигации к созданию Safe с заполненными данными
  const handleNavigateToSafeCreation = async (safeAddress: string, owners: string[], threshold: number) => {
    console.log('🔄 Навигация к созданию Safe с данными:', { safeAddress, owners, threshold })
    
    // Переключаемся на страницу "Создание пропозала"
    setCurrentSection(AppSection.CREATE_PROPOSAL)
    
    // Сразу подключаемся к Safe
    const connectionFormData: SafeConnectionFormData = {
      safeAddress,
      owners,
      threshold,
      safeVersion: '1.4.1',
      fallbackHandler: ''
    }
    
    showSuccess(`Подключаемся к Safe ${formatAddress(safeAddress)}...`)
    await handleConnectToSafe(connectionFormData)
  }

  // Функция подключения к Safe
  const handleConnectToSafe = async (formData: SafeConnectionFormData) => {
    if (!safeOnChain || !network) {
      showError('Подключите кошелек')
      return
    }

    setLoadingState('createSafe', true)
    try {
      console.log('🔌 Подключение к Safe с формой:', formData)

      await safeOnChain.connectToSafeWithForm(formData)

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

      showSuccess(`✅ Подключились к Safe ${formatAddress(safeData.address)}`)
      
    } catch (error) {
      console.error('❌ Ошибка подключения к Safe:', error)
      showError(error instanceof Error ? error.message : 'Ошибка подключения к Safe')
    } finally {
      setLoadingState('createSafe', false)
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

      const safeAddress = safeOnChain.currentSafeAddress
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

  // Создание структурированного хеша транзакции (новый подход с ABI)
  const handleCreateStructuredHash = async () => {
    if (!safeOnChain || !safeInfo) {
      showError('Safe не подключен')
      return
    }

    if (!selectedContract || !selectedFunction) {
      showError('Выберите контракт и функцию')
      return
    }

    setLoadingState('universalHash', true)
    setUniversalResult(null)

    try {
      console.log('🚀 Создаем структурированную транзакцию...')
      
      const result = await safeOnChain.createStructuredTransactionHash(
        selectedContract.address,
        selectedFunction,
        structuredFormData
      )

      setUniversalResult(result)
      showSuccess('Хеш транзакции успешно создан!')
      
    } catch (error: any) {
      console.error('❌ Ошибка создания структурированной транзакции:', error)
      showError(`Ошибка создания транзакции: ${error.message}`)
    } finally {
      setLoadingState('universalHash', false)
    }
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

      // Конвертируем ETH в wei (BigInt)
      let valueInWei: bigint = 0n
      if (universalForm.ethValue && universalForm.ethValue !== '0' && universalForm.ethValue !== '') {
        try {
          valueInWei = ethers.parseEther(universalForm.ethValue.toString())
          console.log('💰 Конвертируем пользовательский ввод ETH в wei (ручной режим):', universalForm.ethValue, '→', valueInWei.toString())
        } catch (parseError) {
          console.error('❌ Ошибка парсинга ETH value (ручной режим):', universalForm.ethValue, parseError)
          throw new Error(`Неверный формат ETH value: ${universalForm.ethValue}`)
        }
      }

      const functionCall: UniversalFunctionCall = {
        contractAddress: universalForm.contractAddress,
        functionSignature: universalForm.functionSignature,
        functionParams: convertedParams,
        value: valueInWei
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
  const sendSignatureToSTS = async (transactionHash: string, userAddress: string) => {
    if (!safeOffChain || !safeInfo) {
      console.log('⚠️ SafeOffChain или SafeInfo недоступны')
      return
    }

    console.log('📤 Отправляем подписанную транзакцию в STS...')

    // Проверяем, существует ли транзакция в STS
    try {
      await safeOffChain.getTransaction(transactionHash)
      console.log('✅ Транзакция уже существует в STS. Перенаправляем в раздел "Мои пропозалы"')

      setTimeout(() => {
        console.log('📋 Переключаемся на раздел "Мои пропозалы" - транзакция уже существует')
        setCurrentSection(AppSection.PROPOSALS)
      }, 1500)
    } catch (error: any) {
      // Если транзакция не найдена (404 или текст ошибки), создаем новый пропозал
      if (error?.response?.status === 404 ||
        error?.status === 404 ||
        error?.message?.includes('No MultisigTransaction matches') ||
        error?.message?.includes('Transaction not found') ||
        error?.message?.includes('404') ||
        error?.message?.includes('Not Found')) {
        console.log('📝 Транзакции еще нет в STS, создаём пропозал...')
        await proposeUniversalResult(userAddress)
        return
      }
      // Если другая ошибка, прокидываем её дальше
      throw error
    }
  }

  const proposeUniversalResult = async (userAddress: string) => {
    if (!safeOffChain || !safeInfo) {
      console.log('⚠️ SafeOffChain или SafeInfo недоступны')
      return
    }

    try {
      await safeOffChain.proposeUniversalResult(
        safeInfo.address,
        universalResult!,
        userAddress,
        'Universal Function Call'
      )

      showSuccess('✅ Пропозал создан успешно!')

      // Очищаем состояние формы после успешного создания пропозала
      setUniversalForm({
        contractAddress: '',
        functionSignature: '',
        functionParams: [''],
        ethValue: '0'
      })
      setUniversalResult(null)
      setSignatureResult(null)
      
      // Очищаем новые состояния
      setSelectedContract(null)
      setSelectedFunction(null)
      setStructuredFormData({
        parameters: {},
        ethValue: '0'
      })

      setTimeout(() => {
        console.log('📋 Переключаемся на раздел "Мои пропозалы" - пропозал создан')
        setCurrentSection(AppSection.PROPOSALS)
      }, 1500)
    } catch (error: any) {
        console.error('❌ Ошибка создания пропозала:', error)
        showError(`Ошибка создания пропозала: ${error.message}`)
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

        // 4. Обновляем состояние с результатами подписи
        universalResult.safeTransaction = signedSafeTransaction

        const sig = ethers.Signature.from(userSignature.data)
        const newSignatureResult: SignatureResult = {
          signature: userSignature.data,
          r: sig.r,
          s: sig.s,
          v: sig.v,
          recoveryId: sig.v,
          encodedPacked: ethers.solidityPacked(
            ['bytes', 'bytes32', 'bytes32', 'uint8'],
            [userSignature.data, sig.r, sig.s, sig.v]
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
      // Очищаем форму при отключении от Safe
      setUniversalForm({
        contractAddress: '',
        functionSignature: '',
        functionParams: [''],
        ethValue: '0'
      })
      
      // Очищаем новые состояния
      setSelectedContract(null)
      setSelectedFunction(null)
      setStructuredFormData({
        parameters: {},
        ethValue: '0'
      })
      if (currentSection === AppSection.CREATE_PROPOSAL) {
      setShowSafeManagement(true)
      }
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
                  onClick={() => setCurrentSection(AppSection.PROPOSALS)}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${currentSection === AppSection.PROPOSALS
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  📋 Мои пропозалы
                </button>
                <button
                  onClick={() => setCurrentSection(AppSection.CREATE_PROPOSAL)}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${currentSection === AppSection.CREATE_PROPOSAL
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  🚀 Создание пропозала
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
          {currentSection === AppSection.CREATE_PROPOSAL && (
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
              {network && safeInfo && (
                <div className="mb-8 p-6 bg-white rounded-lg shadow">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Информация о Safe</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setCurrentSection(AppSection.CREATE_PROPOSAL)
                          setShowSafeManagement(true)
                        }}
                        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                      >
                        🔄 Переподключиться
                      </button>
                      <button
                        onClick={handleDisconnectFromSafe}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                      >
                        🔄 Сбросить Safe
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
              {network && currentSection === AppSection.CREATE_PROPOSAL && (!safeInfo || showSafeManagement) && (
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

              {network && currentSection === AppSection.CREATE_PROPOSAL && safeInfo && (
                <div className="space-y-8">
                  {/* Универсальные транзакции */}
                  <div className="p-6 bg-white rounded-lg shadow">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">🎯 Универсальные вызовы функций</h2>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setUseStructuredMode(true)}
                          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            useStructuredMode
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          📋 ABI режим
                        </button>
                        <button
                          onClick={() => setUseStructuredMode(false)}
                          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            !useStructuredMode
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          ✏️ Ручной ввод
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 mb-6">
                      {useStructuredMode 
                        ? 'Выберите контракт из списка и функцию из ABI для безопасного создания транзакции.'
                        : 'Создайте хеш для любого вызова функции смарт-контракта. Укажите адрес контракта, сигнатуру функции и параметры.'
                      }
                    </p>

                    {useStructuredMode ? (
                      /* Новый UI с Dropdown */
                      <div className="space-y-6">
                        {/* Dropdown для выбора контракта */}
                        <ContractDropdown
                          onContractSelect={setSelectedContract}
                          selectedContract={selectedContract}
                          isLoading={contractsLoading}
                          error={contractsError}
                        />

                        {/* Dropdown для выбора функции */}
                        <FunctionDropdown
                          contractAddress={selectedContract?.address || null}
                          onFunctionSelect={setSelectedFunction}
                          selectedFunction={selectedFunction}
                        />

                        {/* Информация о контракте */}
                        {selectedContract && safeOnChain && (
                          <ContractInfo 
                            contractAddress={selectedContract.address}
                            safeOnChain={safeOnChain}
                          />
                        )}

                        {/* Параметры функции */}
                        {selectedFunction && (
                          <ParameterForm
                            selectedFunction={selectedFunction}
                            onFormChange={setStructuredFormData}
                            formData={structuredFormData}
                          />
                        )}

                        {/* Кнопка создания хеша */}
                        {selectedContract && selectedFunction && (
                          <div className="pt-6 border-t border-gray-200">
                            <button
                              onClick={handleCreateStructuredHash}
                              disabled={loading.universalHash}
                              className={`w-full px-6 py-3 rounded-lg font-medium transition-colors ${
                                loading.universalHash
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                            >
                              {loading.universalHash ? (
                                <span className="flex items-center justify-center">
                                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Создание хеша...
                                </span>
                              ) : (
                                '🔐 Создать хеш транзакции'
                              )}
                            </button>
                          </div>
                        )}

                        {/* Результат для ABI режима */}
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

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                              <div className="flex gap-3 pt-4">
                                <button
                                  onClick={handleSignTransactionHash}
                                  disabled={loading.signature}
                                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                                    loading.signature
                                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                      : 'bg-purple-600 text-white hover:bg-purple-700'
                                  }`}
                                >
                                  {loading.signature ? '🔄 Подписываем...' : '🖋️ Подписать транзакцию'}
                                </button>

                                <button
                                  onClick={() => copyToClipboard(universalResult.transactionHash, 'Хеш транзакции')}
                                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                >
                                  📋 Скопировать хеш
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <p className="text-blue-800 text-sm">
                                💡 <strong>Следующие шаги:</strong> Нажмите "Подписать транзакцию" для автоматической подписи через ваш кошелек, или скопируйте хеш для ручной подписи.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Старый ручной UI */
                      <div className="space-y-6">
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
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* РАЗДЕЛ УПРАВЛЕНИЯ ПРОПОЗАЛАМИ */}
          {currentSection === AppSection.PROPOSALS && (
            <ProposalsPage
              network={network}
              userAddress={userAddress}
              safeOnChain={safeOnChain}
              safeOffChain={safeOffChain}
              safeInfo={safeInfo}
              setSafeInfo={setSafeInfo}
              showError={showError}
              showSuccess={showSuccess}
              onNavigateToSafeCreation={handleNavigateToSafeCreation}
            />
          )}

        </div>
      </div>
    )
  }

  export default SafeMultisigApp
