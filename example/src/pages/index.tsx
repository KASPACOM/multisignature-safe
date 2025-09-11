import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { SafeTransaction } from '@safe-global/types-kit'

import SafeOnChain, { 
  TransactionParams, 
  UniversalFunctionCall,
  SafeConnectionForm,
  SafeCreationForm
} from '../lib/onchain'
import { SafeManagement, UserProposals } from '../components'
import SafeOffChain, { UniversalOperationResult } from '../lib/offchain'
import { 
  connectWallet, 
  checkWalletConnection, 
  formatAddress, 
  formatEthValue,
  parseEthValue,
  onAccountsChanged,
  onChainChanged,
  removeEventListeners,
  getNetworkConfig
} from '../lib/safe-common'
import { NETWORK_NAMES, NETWORK_COLORS, getSupportedNetworks, isNetworkSupported } from '../lib/constants'

interface SafeInfo {
  address: string
  owners: string[]
  threshold: number
  balance: string
  nonce: number
}

// Интерфейс информации о транзакции (из бывшего SafeManager)
interface TransactionInfo {
  safeTxHash: string
  to: string
  value: string
  data: string
  nonce: number
  confirmationsRequired: number
  confirmationsCount: number
  isExecuted: boolean
  canExecute: boolean
  signatures: { [ownerAddress: string]: string }
}


interface UniversalTransactionResult {
  transactionHash: string
  safeTransaction: SafeTransaction | null // Может быть null при использовании SafeManager
  encodedData: string
  transactionDetails: {
    to: string
    value: string
    data: string
    nonce: number
  }
}

interface SignatureResult {
  signature: string
  r: string
  s: string
  v: number
  recoveryId: number
  encodedPacked: string
}

interface CollectedSignature {
  signer: string
  signature: string
}

interface ExecutionResult {
  hash: string
  signaturesUsed: number
  threshold: number
}

interface ApprovedHashInfo {
  txHash: string
  approvedCount: number
  totalOwners: number
  threshold: number
  canExecute: boolean
  approvedOwners: string[]
}

interface ImportSignatureForm {
  signerAddress: string
  signature: string
}

interface ExternalTransactionForm {
  contractAddress: string
  functionSignature: string
  functionParams: string[]
  ethValue: string
}

interface UniversalTransactionForm {
  contractAddress: string
  functionSignature: string
  functionParams: string[]
  ethValue: string
}

const SafeMultisigApp: React.FC = () => {
  // Состояние подключения
  const [signer, setSigner] = useState<ethers.Signer | null>(null)
  const [userAddress, setUserAddress] = useState<string>('')
  const [isConnecting, setIsConnecting] = useState(false)

  // Состояние Safe
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null)
  const [predictedAddress, setPredictedAddress] = useState<string>('')
  const [lastCreatedSafeAddress, setLastCreatedSafeAddress] = useState<string>('')

  // Состояние транзакций
  const [pendingTransactions, setPendingTransactions] = useState<TransactionInfo[]>([])
  const [currentTransaction, setCurrentTransaction] = useState<TransactionInfo | null>(null)

  // Состояние Safe подключения
  const [showSafeManagement, setShowSafeManagement] = useState(!safeInfo)
  const [predictedSafeAddress, setPredictedSafeAddress] = useState<string>('')
  
  // Состояние пропозалов пользователя
  const [showUserProposals, setShowUserProposals] = useState(true)
  const [userProposalsRefresh, setUserProposalsRefresh] = useState(0)

  const [transactionForm, setTransactionForm] = useState({
    to: '',
    value: '0',
    data: '0x'
  })

  // Состояние универсальной формы транзакций
  const [universalForm, setUniversalForm] = useState<UniversalTransactionForm>({
    contractAddress: '',
    functionSignature: '',
    functionParams: [''],
    ethValue: '0'
  })

  // Результат создания универсальной транзакции
  const [universalResult, setUniversalResult] = useState<UniversalTransactionResult | null>(null)
  
  // Результат подписи хеша
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null)
  
  // Собранные подписи для выполнения транзакции
  const [collectedSignatures, setCollectedSignatures] = useState<CollectedSignature[]>([])
  
  // Результат выполнения транзакции
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  
  // Approved hash информация для транзакций
  const [approvedHashInfos, setApprovedHashInfos] = useState<Map<string, ApprovedHashInfo>>(new Map())
  
  // Форма для импорта подписей
  const [importSignatureForm, setImportSignatureForm] = useState<ImportSignatureForm>({
    signerAddress: '',
    signature: ''
  })
  
  // Режим импорта готовых подписей
  const [showImportMode, setShowImportMode] = useState<boolean>(false)
  
  // Форма для внешней транзакции (функция с параметрами)
  const [externalTransactionForm, setExternalTransactionForm] = useState<ExternalTransactionForm>({
    contractAddress: '',
    functionSignature: '',
    functionParams: [''],
    ethValue: '0'
  })

  // Состояние загрузки
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({})
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  // Экземпляры классов  
  const [safeOnChain, setSafeOnChain] = useState<SafeOnChain | null>(null)
  const [safeOffChain] = useState(() => new SafeOffChain())

  // Инициализация при загрузке
  useEffect(() => {
    initializeApp()

    // Обработчики событий кошелька
    onAccountsChanged(handleAccountsChanged)
    onChainChanged(handleChainChanged)

    return () => {
      removeEventListeners()
    }
  }, [])

  // Обновление safeOnChain при изменении signer
  useEffect(() => {
    if (signer) {
      console.log('🔄 Создание нового SafeOnChain из-за изменения signer')
      
      // Если был подключен Safe, нужно переподключиться с новым signer
      const currentSafeAddress = safeInfo?.address
      const currentOwners = safeInfo?.owners
      const currentThreshold = safeInfo?.threshold
      
      const newSafeOnChain = new SafeOnChain(signer)
      setSafeOnChain(newSafeOnChain)
      
      // Делаем SafeOnChain доступным глобально для отладки
      if (typeof window !== 'undefined') {
        // Добавляем SafeOnChain в window для отладки
        const w = window as any
        w.debugSafeOnChain = newSafeOnChain
        w.debugSafeOffChain = safeOffChain
        
        console.log('🔧 Отладочные объекты доступны в консоли:')
        console.log('  - debugSafeOnChain - основной класс для блокчейн операций')
        console.log('  - debugSafeOffChain - класс для работы с STS и пропозалами')
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
            setPendingTransactions([])
            setShowSafeManagement(true)
            showError('Safe отключен из-за смены аккаунта. Переподключитесь.')
          }
        }, 100)
      }
    } else {
      setSafeOnChain(null)
      // При отключении signer очищаем все состояние Safe
      setSafeInfo(null)
      setPendingTransactions([])
      setShowSafeManagement(true)
    }
  }, [signer])

  // Инициализация приложения
  const initializeApp = async () => {
    try {
      const connectedSigner = await checkWalletConnection()
      if (connectedSigner) {
        setSigner(connectedSigner)
        const address = await connectedSigner.getAddress()
        setUserAddress(address)
      }
    } catch (error) {
      console.error('Ошибка инициализации:', error)
    }
  }

  // Обработчики событий кошелька
  const handleAccountsChanged = async (accounts: string[]) => {
    if (accounts.length === 0) {
      setSigner(null)
      setUserAddress('')
      setSafeInfo(null)
    } else {
      await initializeApp()
    }
  }

  const handleChainChanged = () => {
    // Перезагружаем страницу при смене сети
    window.location.reload()
  }

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

  // 1. Подключение кошелька
  const handleConnectWallet = async () => {
    setIsConnecting(true)
    try {
      const connectedSigner = await connectWallet()
      setSigner(connectedSigner)
      const address = await connectedSigner.getAddress()
      setUserAddress(address)
      showSuccess('Кошелек подключен успешно!')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Ошибка подключения')
    }
    setIsConnecting(false)
  }

  // 2. Создание Safe с формой
  const handleCreateSafeWithForm = async (formData: SafeCreationForm) => {
    if (!safeOnChain || !signer) {
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
      
      setLastCreatedSafeAddress(safeAddress)
      
      // Получаем информацию о Safe
      const safeData = await safeOnChain.getCurrentSafeInfo()
      setSafeInfo({
        address: safeData.address,
        owners: safeData.owners,
        threshold: safeData.threshold,
        balance: safeData.balance,
        nonce: safeData.nonce
      })
      
      // Для новосозданного Safe не загружаем сразу транзакции (их еще нет)
      // Просто инициализируем пустым списком
      setPendingTransactions([])
      
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

  // Подключение к существующему Safe с формой
  const handleConnectToSafeWithForm = async (formData: SafeConnectionForm) => {
    if (!safeOnChain) {
      showError('Подключите кошелек')
      return
    }

    setLoadingState('connectSafe', true)
    try {
      console.log('🔌 Подключение к Safe с формой:', formData)
      
      // Подключаемся к Safe (SafeManager проверит существование автоматически)
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
      
      // Загружаем ожидающие транзакции (с улучшенной обработкой ошибок)
      await loadPendingTransactions(formData.safeAddress)
      
      // Скрываем форму управления
      setShowSafeManagement(false)
      
      showSuccess(`Подключен к Safe: ${formatAddress(formData.safeAddress)}`)
    } catch (error) {
      console.error('❌ Ошибка подключения к Safe:', error)
      showError(error instanceof Error ? error.message : 'Ошибка подключения к Safe')
    }
    setLoadingState('connectSafe', false)
  }

  // 3. Предложение транзакции
  const handleProposeTransaction = async () => {
    if (!safeOnChain || !safeInfo || !signer) {
      showError('Safe не подключен')
      return
    }

    if (!transactionForm.to || !ethers.isAddress(transactionForm.to)) {
      showError('Введите корректный адрес получателя')
      return
    }

    setLoadingState('propose', true)
    try {
      // Используем старую логику SafeOnChain.proposeTransaction (без STS дублирования)
      const safeTxHash = await safeOnChain.proposeTransaction(transactionForm)

      // Обновляем список транзакций
      await loadPendingTransactions(safeInfo.address)
      
      // Обновляем пропозалы пользователя
      refreshUserProposals()
      
      showSuccess(`Транзакция предложена успешно! Hash: ${formatAddress(safeTxHash)}`)
      
      // Очищаем форму
      setTransactionForm({ to: '', value: '0', data: '0x' })
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Ошибка предложения транзакции')
    }
    setLoadingState('propose', false)
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
        Nonce: ${result.transactionDetails.nonce}`)

    } catch (error: any) {
      console.error('❌ Ошибка создания универсального хеша:', error)
      showError(`Ошибка: ${error.message}`)
    }

    setLoadingState('universalHash', false)
  }

  // Подписание хеша транзакции
  const handleSignTransactionHash = async () => {
    if (!universalResult || !signer || !safeOnChain || !safeInfo) {
      showError('Нет хеша для подписи, кошелек не подключен или Safe Manager недоступен')
      return
    }

    setLoadingState('signHash', true)
    setSignatureResult(null)

    try {
      console.log('🖋️ Подписываем транзакцию через Protocol Kit (EIP-712):', universalResult.transactionHash)

      // Получаем адрес пользователя
      const userAddress = await signer.getAddress()
      console.log('🔍 Пользовательский адрес:', userAddress)
      console.log('🔍 Хэш транзакции:', universalResult.transactionHash)

      // Подписываем транзакцию через Safe SDK
      const safeSdk = safeOnChain.getSafeSdk()
      const safeTransaction = universalResult.safeTransaction
      
      if (!safeTransaction) {
        throw new Error('SafeTransaction не найдена в универсальном результате')
      }
      
      console.log('📝 Подписываем транзакцию через Safe SDK (EIP-712)...')
      
      // Подписываем транзакцию и получаем подписанную версию
      const signedSafeTransaction = await safeSdk.signTransaction(safeTransaction, 'eth_signTypedData')
      
      console.log('📊 Подписей в подписанной транзакции:', signedSafeTransaction.signatures.size)
      
      // Получаем подпись пользователя из подписанной транзакции (пробуем разные форматы адреса)
      let userSignature = signedSafeTransaction.signatures.get(userAddress) || 
                         signedSafeTransaction.signatures.get(userAddress.toLowerCase()) ||
                         signedSafeTransaction.signatures.get(ethers.getAddress(userAddress))
      
      if (!userSignature) {
        console.log('🔍 Доступные ключи подписей:', Array.from(signedSafeTransaction.signatures.keys()))
        throw new Error(`Подпись не найдена для адреса ${userAddress}. Доступные подписи: ${Array.from(signedSafeTransaction.signatures.keys()).join(', ')}`)
      }
      
      console.log('✅ Найдена подпись пользователя!')
      
      const signatureData = typeof userSignature === 'object' && userSignature && 'data' in userSignature 
        ? String(userSignature.data) 
        : String(userSignature)
      
      // Обновляем оригинальную транзакцию подписями
      universalResult.safeTransaction = signedSafeTransaction
      
      // Разбираем подпись на компоненты для отображения
      const sig = ethers.Signature.from(signatureData)
      
      const signatureResult: SignatureResult = {
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

      setSignatureResult(signatureResult)

      // ТЕПЕРЬ отправляем подписанную транзакцию в STS
      if (safeOffChain) {
        try {
          console.log('📤 Отправляем подписанную транзакцию в STS...')
          await safeOffChain.proposeUniversalResult(
            safeInfo.address,
            universalResult,
            userAddress,
            'Universal Function Call'
          )
          console.log('✅ Транзакция успешно отправлена в STS!')
          
          // Обновляем пропозалы пользователя
          refreshUserProposals()
          
        } catch (stsError: any) {
          console.warn('⚠️ Не удалось отправить подписанную транзакцию в STS:', stsError)
          showError(`Ошибка отправки в STS: ${stsError.message}`)
        }
      }

      showSuccess(`✅ Транзакция подписана через EIP-712!
        Подпись: ${signatureData.slice(0, 20)}...${signatureData.slice(-10)}`)

      console.log('📦 EIP-712 подпись:', signatureResult)

    } catch (error: any) {
      console.error('❌ Ошибка EIP-712 подписи:', error)
      showError(`Ошибка подписи: ${error.message}`)
    }

    setLoadingState('signHash', false)
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

  // Добавление подписи в коллекцию
  const addSignatureToCollection = async () => {
    if (!signatureResult || !signer) {
      showError('Нет подписи для добавления или кошелек не подключен')
      return
    }

    try {
      const signerAddress = await signer.getAddress()
      
      // Проверяем, не добавлена ли уже подпись от этого адреса
      const existingSignature = collectedSignatures.find(s => s.signer.toLowerCase() === signerAddress.toLowerCase())
      if (existingSignature) {
        showError('Подпись от этого адреса уже добавлена')
        return
      }

      const newSignature: CollectedSignature = {
        signer: signerAddress,
        signature: signatureResult.signature
      }

      setCollectedSignatures(prev => [...prev, newSignature])
      
      // Упрощенная логика без localStorage
      
      showSuccess(`✅ Подпись от ${signerAddress} добавлена в коллекцию`)
      
      console.log('📝 Добавлена подпись:', newSignature)

    } catch (error: any) {
      console.error('❌ Ошибка добавления подписи:', error)
      showError(`Ошибка: ${error.message}`)
    }
  }

  // Удаление подписи из коллекции
  const removeSignatureFromCollection = (signer: string) => {
    setCollectedSignatures(prev => prev.filter(s => s.signer !== signer))
    
    // Подпись удалена из коллекции (без localStorage)
    
    showSuccess(`✅ Подпись от ${signer} удалена`)
  }

  // Импорт готовой подписи
  const importExternalSignature = async () => {
    if (!importSignatureForm.signerAddress || !importSignatureForm.signature) {
      showError('Заполните адрес подписанта и подпись')
      return
    }

    try {
      // Проверяем формат адреса
      const normalizedAddress = ethers.getAddress(importSignatureForm.signerAddress)
      
      // Проверяем, не добавлена ли уже подпись от этого адреса
      const existingSignature = collectedSignatures.find(s => s.signer.toLowerCase() === normalizedAddress.toLowerCase())
      if (existingSignature) {
        showError('Подпись от этого адреса уже добавлена')
        return
      }

      // Проверяем формат подписи (должна начинаться с 0x и иметь правильную длину)
      if (!importSignatureForm.signature.startsWith('0x') || importSignatureForm.signature.length !== 132) {
        showError('Неверный формат подписи. Ожидается 0x + 130 символов')
        return
      }

      const newSignature: CollectedSignature = {
        signer: normalizedAddress,
        signature: importSignatureForm.signature
      }

      setCollectedSignatures(prev => [...prev, newSignature])
      
      // Импортированная подпись добавлена в коллекцию (без localStorage)
      
      // Сбрасываем форму
      setImportSignatureForm({
        signerAddress: '',
        signature: ''
      })

      showSuccess(`✅ Подпись от ${normalizedAddress} импортирована`)
      
      console.log('📥 Импортирована подпись:', newSignature)

    } catch (error: any) {
      console.error('❌ Ошибка импорта подписи:', error)
      if (error.code === 'INVALID_ARGUMENT') {
        showError('Неверный формат адреса Ethereum')
      } else {
        showError(`Ошибка импорта: ${error.message}`)
      }
    }
  }

  // Сброс формы импорта
  const resetImportForm = () => {
    setImportSignatureForm({
      signerAddress: '',
      signature: ''
    })
  }

  // Включение режима импорта готовых подписей
  const startImportMode = () => {
    setShowImportMode(true)
    setCollectedSignatures([])
    setExecutionResult(null)
    resetImportForm()
    setExternalTransactionForm({
      contractAddress: '',
      functionSignature: '',
      functionParams: [''],
      ethValue: '0'
    })
    showSuccess('🔄 Режим импорта готовых подписей активирован')
  }

  // Выключение режима импорта
  const stopImportMode = () => {
    setShowImportMode(false)
    setCollectedSignatures([])
    setExecutionResult(null)
    resetImportForm()
    showSuccess('✅ Режим импорта деактивирован')
  }

  // Добавление параметра во внешнюю форму
  const addExternalFunctionParam = () => {
    setExternalTransactionForm(prev => ({
      ...prev,
      functionParams: [...prev.functionParams, '']
    }))
  }

  // Удаление параметра из внешней формы
  const removeExternalFunctionParam = (index: number) => {
    setExternalTransactionForm(prev => ({
      ...prev,
      functionParams: prev.functionParams.filter((_, i) => i !== index)
    }))
  }

  // Обновление параметра внешней формы
  const updateExternalFunctionParam = (index: number, value: string) => {
    setExternalTransactionForm(prev => ({
      ...prev,
      functionParams: prev.functionParams.map((param, i) => i === index ? value : param)
    }))
  }

  // Выполнение внешней транзакции с готовыми подписями
  const executeExternalTransaction = async () => {
    if (!safeInfo || !safeOnChain || collectedSignatures.length === 0 || !externalTransactionForm.contractAddress || !externalTransactionForm.functionSignature) {
      showError('Заполните адрес контракта, сигнатуру функции и добавьте подписи')
      return
    }

    // Дополнительная проверка подключения SafeManager
    if (!safeOnChain.isConnected()) {
      console.log('⚠️ SafeManager не подключен, пытаемся переподключиться...')
      try {
        await safeOnChain.connectToSafeWithForm({
          safeAddress: safeInfo.address,
          owners: safeInfo.owners,
          threshold: safeInfo.threshold
        })
        console.log('✅ SafeManager успешно переподключен для внешней транзакции')
      } catch (reconnectError) {
        console.error('❌ Не удалось переподключить SafeManager:', reconnectError)
        showError('Ошибка переподключения к Safe. Попробуйте переподключиться вручную.')
        return
      }
    }

    setLoadingState('executeExternalTransaction', true)
    setExecutionResult(null)

    try {
      console.log('🚀 Выполняем внешнюю транзакцию с подписями...')
      
      if (collectedSignatures.length < safeInfo.threshold) {
        throw new Error(`Недостаточно подписей! Требуется: ${safeInfo.threshold}, собрано: ${collectedSignatures.length}`)
      }

      // Создаем UniversalFunctionCall из формы
      const functionCall = {
        contractAddress: externalTransactionForm.contractAddress,
        functionSignature: externalTransactionForm.functionSignature,
        functionParams: externalTransactionForm.functionParams,
        value: externalTransactionForm.ethValue || '0'
      }

      console.log('📝 Параметры функции:', functionCall)

      // Создаем хеш и выполняем транзакцию через SafeManager
      const transactionResult = await safeOnChain.createUniversalTransactionHash(
        functionCall
      )

      console.log('🎯 Созданная транзакция:', transactionResult.transactionHash)

      // Подписи уже собраны в collectedSignatures (без localStorage)

      // Выполняем транзакцию с готовыми подписями
      // В новой архитектуре используем executeTransactionByHash
      const result = await safeOnChain.executeTransactionByHash(
        transactionResult.transactionHash,
        safeOffChain
      )

      setExecutionResult({
        hash: result,
        signaturesUsed: collectedSignatures.length,
        threshold: safeInfo.threshold
      })

      showSuccess(`✅ Внешняя транзакция успешно выполнена!
        Хеш транзакции: ${result}`)

      console.log('🎉 Внешняя транзакция выполнена:', result)

    } catch (error: any) {
      console.error('❌ Ошибка выполнения внешней транзакции:', error)
      showError(`Ошибка выполнения: ${error.message}`)
    }

    setLoadingState('executeExternalTransaction', false)
  }

  // Выполнение транзакции с собранными подписями
  const executeTransactionWithSignatures = async () => {
    if (!universalResult || !safeInfo || !safeOnChain || collectedSignatures.length === 0) {
      showError('Нет транзакции, Safe не подключен или нет собранных подписей')
      return
    }

    // Дополнительная проверка подключения SafeManager
    if (!safeOnChain.isConnected()) {
      console.log('⚠️ SafeManager не подключен, пытаемся переподключиться...')
      try {
        await safeOnChain.connectToSafeWithForm({
          safeAddress: safeInfo.address,
          owners: safeInfo.owners,
          threshold: safeInfo.threshold
        })
        console.log('✅ SafeManager успешно переподключен')
      } catch (reconnectError) {
        console.error('❌ Не удалось переподключить SafeManager:', reconnectError)
        showError('Ошибка переподключения к Safe. Попробуйте переподключиться вручную.')
        return
      }
    }

    setLoadingState('executeTransaction', true)
    setExecutionResult(null)

    try {
      console.log('🚀 Выполняем транзакцию с подписями...')
      console.log('📊 Количество подписей:', collectedSignatures.length)
      console.log('🎯 Threshold Safe:', safeInfo.threshold)

      if (collectedSignatures.length < safeInfo.threshold) {
        throw new Error(`Недостаточно подписей! Требуется: ${safeInfo.threshold}, собрано: ${collectedSignatures.length}`)
      }

      // Используем собранные подписи напрямую (без localStorage)

      // SafeManager выполняет транзакцию по safeTxHash
      // В новой архитектуре используем executeTransactionByHash  
      const result = await safeOnChain.executeTransactionByHash(
        universalResult.transactionHash,
        safeOffChain
      )

      setExecutionResult({
        hash: result,
        signaturesUsed: collectedSignatures.length,
        threshold: safeInfo.threshold
      })

      showSuccess(`✅ Транзакция успешно выполнена!
        Хеш транзакции: ${result}
        Использовано подписей: ${collectedSignatures.length}`)

      console.log('🎉 Транзакция выполнена:', result)

    } catch (error: any) {
      console.error('❌ Ошибка выполнения транзакции:', error)
      showError(`Ошибка выполнения: ${error.message}`)
    }

    setLoadingState('executeTransaction', false)
  }

  // =============================================================================
  // APPROVED HASH WORKFLOW
  // =============================================================================

  // Одобрение хэша транзакции владельцем
  const handleApproveTransactionHash = async (txInfo: TransactionInfo) => {
    if (!safeOnChain || !safeInfo || !signer) {
      showError('Safe не подключен')
      return
    }

    setLoadingState(`approve_${txInfo.safeTxHash}`, true)
    try {
      console.log('📝 Одобряем хэш транзакции:', txInfo.safeTxHash)
      
      // Получаем транзакцию из STS и выполняем approve
      const txData = await safeOffChain.getTransaction(txInfo.safeTxHash)
      const safeTransaction = await safeOnChain.createSafeTransaction({
        to: txData.to,
        value: ethers.formatEther(txData.value || '0'),
        data: txData.data || '0x'
      })
      
      // Approve hash в блокчейне
      await safeOnChain.approveTransactionHash(safeTransaction)
      
      // Обновляем информацию об одобрениях
      await updateApprovedHashInfo(txInfo.safeTxHash)
      
      showSuccess('✅ Хэш транзакции одобрен!')
      
    } catch (error: any) {
      console.error('❌ Ошибка одобрения хэша:', error)
      showError(`Ошибка одобрения: ${error.message}`)
    }
    setLoadingState(`approve_${txInfo.safeTxHash}`, false)
  }

  // Выполнение транзакции с pre-approved подписями
  const handleExecuteWithPreApprovals = async (txInfo: TransactionInfo) => {
    if (!safeOnChain || !safeInfo || !signer) {
      showError('Safe не подключен')
      return
    }

    setLoadingState(`execute_preapproved_${txInfo.safeTxHash}`, true)
    try {
      console.log('🚀 Выполняем с pre-approved подписями:', txInfo.safeTxHash)
      
      // Используем executeTransactionByHash с STS интеграцией
      const txHash = await safeOnChain.executeTransactionByHash(txInfo.safeTxHash, safeOffChain)
      
      // Обновляем информацию о Safe и транзакциях
      const updatedSafeInfo = await safeOnChain.getCurrentSafeInfo()
      setSafeInfo({
        address: updatedSafeInfo.address,
        owners: updatedSafeInfo.owners,
        threshold: updatedSafeInfo.threshold,
        balance: updatedSafeInfo.balance,
        nonce: updatedSafeInfo.nonce
      })
      
      await loadPendingTransactions(safeInfo.address)
      
      // Обновляем пропозалы пользователя
      refreshUserProposals()
      
      // Очищаем approved hash информацию для выполненной транзакции
      setApprovedHashInfos(prev => {
        const newInfos = new Map(prev)
        newInfos.delete(txInfo.safeTxHash)
        return newInfos
      })
      
      showSuccess(`✅ Транзакция выполнена с pre-approved hash! Hash: ${formatAddress(txHash)}`)
      
    } catch (error: any) {
      console.error('❌ Ошибка выполнения с pre-approved:', error)
      showError(`Ошибка выполнения: ${error.message}`)
    }
    setLoadingState(`execute_preapproved_${txInfo.safeTxHash}`, false)
  }

  // Обновление информации об одобрениях для транзакции
  const updateApprovedHashInfo = async (safeTxHash: string) => {
    if (!safeOnChain) return

    try {
      // Получаем реальную информацию об одобрениях через SafeOnChain
      const approvedOwners = await safeOnChain.checkApprovedOwners(safeTxHash)
      const totalOwners = safeInfo?.owners?.length || 0
      const threshold = safeInfo?.threshold || 1
      
      const approvalInfo = {
        approvedCount: approvedOwners.length,
        totalOwners: totalOwners,
        threshold: threshold,
        canExecute: approvedOwners.length >= threshold,
        approvedOwners: approvedOwners
      }
      
      setApprovedHashInfos(prev => {
        const newInfos = new Map(prev)
        newInfos.set(safeTxHash, {
          txHash: safeTxHash,
          ...approvalInfo
        })
        return newInfos
      })
      
      console.log('📊 Обновлена информация об одобрениях:', approvalInfo)
      
    } catch (error) {
      console.error('❌ Ошибка получения информации об одобрениях:', error)
    }
  }

  // Обновление информации об одобрениях для всех транзакций
  const updateAllApprovedHashInfos = async () => {
    if (!safeOnChain) return

    console.log('🔄 Обновляем информацию об одобрениях для всех транзакций...')
    
    for (const tx of pendingTransactions) {
      if (!tx.isExecuted) {
        await updateApprovedHashInfo(tx.safeTxHash)
      }
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
    setCollectedSignatures([])
    setExecutionResult(null)
    resetImportForm()
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

  // 4. Подтверждение транзакции
  const handleConfirmTransaction = async (txInfo: TransactionInfo) => {
    if (!safeOnChain || !safeInfo || !signer) {
      showError('Safe не подключен')
      return
    }

    setLoadingState(`confirm_${txInfo.safeTxHash}`, true)
    try {
      // SafeManager автоматически обрабатывает STS/локальное хранилище
      // Получаем транзакцию из STS и выполняем approve  
      const txData = await safeOffChain.getTransaction(txInfo.safeTxHash)
      const safeTransaction = await safeOnChain.createSafeTransaction({
        to: txData.to,
        value: ethers.formatEther(txData.value || '0'),
        data: txData.data || '0x'
      })
      
      // Подписываем через approve hash в блокчейне
      await safeOnChain.approveTransactionHash(safeTransaction)

      // Обновляем список транзакций
      await loadPendingTransactions(safeInfo.address)
      
      // Обновляем пропозалы пользователя
      refreshUserProposals()
      
      showSuccess('Транзакция подписана!')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Ошибка подтверждения транзакции')
    }
    setLoadingState(`confirm_${txInfo.safeTxHash}`, false)
  }

  // 5. Выполнение транзакции
  const handleExecuteTransaction = async (txInfo: TransactionInfo) => {
    if (!safeOnChain || !safeInfo || !signer) {
      showError('Safe не подключен')
      return
    }

    // Дополнительная проверка подключения SafeManager
    if (!safeOnChain.isConnected()) {
      console.log('⚠️ SafeManager не подключен, пытаемся переподключиться...')
      try {
        await safeOnChain.connectToSafeWithForm({
          safeAddress: safeInfo.address,
          owners: safeInfo.owners,
          threshold: safeInfo.threshold
        })
        console.log('✅ SafeManager успешно переподключен для выполнения транзакции')
      } catch (reconnectError) {
        console.error('❌ Не удалось переподключить SafeManager:', reconnectError)
        showError('Ошибка переподключения к Safe. Попробуйте переподключиться вручную.')
        return
      }
    }

    setLoadingState(`execute_${txInfo.safeTxHash}`, true)
    try {
      // SafeManager автоматически собирает подписи и выполняет транзакцию
      // Используем executeTransactionByHash с STS интеграцией
      const txHash = await safeOnChain.executeTransactionByHash(txInfo.safeTxHash, safeOffChain)

      // Обновляем информацию о Safe и транзакциях
      const updatedSafeInfo = await safeOnChain.getCurrentSafeInfo()
      setSafeInfo({
        address: updatedSafeInfo.address,
        owners: updatedSafeInfo.owners,
        threshold: updatedSafeInfo.threshold,
        balance: updatedSafeInfo.balance,
        nonce: updatedSafeInfo.nonce
      })
      await loadPendingTransactions(safeInfo.address)
      
      // Обновляем пропозалы пользователя
      refreshUserProposals()
      
      showSuccess(`Транзакция выполнена! Hash: ${formatAddress(txHash)}`)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Ошибка выполнения транзакции')
    }
    setLoadingState(`execute_${txInfo.safeTxHash}`, false)
  }

  // Загрузка ожидающих транзакций
  const loadPendingTransactions = async (safeAddress: string) => {
    if (!safeOnChain) {
      console.log('SafeManager не инициализирован')
      return
    }

    try {
      // Используем safeOffChain для получения транзакций
      const stsTransactions = await safeOffChain.getPendingTransactions(safeAddress)
      
      // Преобразуем в формат TransactionInfo
      const transactions: TransactionInfo[] = stsTransactions.map(tx => ({
        safeTxHash: tx.safeTxHash,
        to: tx.to,
        value: ethers.formatEther(tx.value || '0'),
        data: tx.data || '0x',
        nonce: parseInt(tx.nonce?.toString() || '0'),
        confirmationsRequired: tx.confirmationsRequired || 1,
        confirmationsCount: tx.confirmations?.length || 0,
        isExecuted: tx.isExecuted || false,
        canExecute: (tx.confirmations?.length || 0) >= (tx.confirmationsRequired || 1),
        signatures: {}
      }))
      
      setPendingTransactions(transactions)

      console.log(`📋 Загружено ${transactions.length} ожидающих транзакций`)
      
      // Автоматически загружаем approved hash информацию для всех транзакций
      if (transactions.length > 0) {
        console.log('🔄 Автозагрузка approved hash информации...')
        setTimeout(async () => {
          await updateAllApprovedHashInfos()
        }, 500) // Небольшая задержка для избежания race conditions
      }
      
    } catch (error) {
      console.error('❌ Ошибка загрузки транзакций:', error)
    }
  }

  // Отключение от Safe
  const handleDisconnectFromSafe = () => {
    if (safeOnChain) {
      safeOnChain.disconnect()
    }
    setSafeInfo(null)
    setCurrentTransaction(null)
    setPendingTransactions([])
    setUniversalResult(null)
    setSignatureResult(null)
    setCollectedSignatures([])
    setExecutionResult(null)
    setPredictedSafeAddress('')
    setApprovedHashInfos(new Map()) // Очищаем approved hash информацию
    setShowSafeManagement(true)
    showSuccess('Отключено от Safe')
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
          setUserProposalsRefresh(prev => prev + 1)
          if (safeInfo) {
            await loadPendingTransactions(safeInfo.address)
          }
          break

        case 'execute':
          if (!safeOnChain) {
            showError('Safe Manager не инициализирован')
            return
          }
          
          // Выполняем транзакцию через STS интеграцию  
          const txHash = await safeOnChain.executeTransactionByHash(proposal.safeTxHash, safeOffChain)
          showSuccess(`Пропозал выполнен! Hash: ${formatAddress(txHash)}`)
          
          // Обновляем состояние
          setUserProposalsRefresh(prev => prev + 1)
          if (safeInfo) {
            const updatedSafeInfo = await safeOnChain.getCurrentSafeInfo()
            setSafeInfo({
              address: updatedSafeInfo.address,
              owners: updatedSafeInfo.owners,
              threshold: updatedSafeInfo.threshold,
              balance: updatedSafeInfo.balance,
              nonce: updatedSafeInfo.nonce
            })
            await loadPendingTransactions(safeInfo.address)
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

        {/* Статус подключения */}
        <div className="mb-8 p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Подключение</h2>
          
          {!signer ? (
            <div className="space-y-4">
              <button
                onClick={handleConnectWallet}
                disabled={isConnecting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isConnecting ? 'Подключение...' : 'Подключить кошелек'}
              </button>
              
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
          ):(
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
                  onClick={() => setShowUserProposals(!showUserProposals)}
                  className={`px-4 py-2 rounded-lg transition-colors text-sm ${
                    showUserProposals 
                      ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {showUserProposals ? '👁️ Скрыть пропозалы' : '📋 Показать пропозалы'}
                </button>
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

            {/* Кнопка активации режима импорта */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-medium mb-3">🚀 Действия с транзакциями:</h3>
              <div className="flex flex-wrap gap-3">
                {!showImportMode ? (
                  <button
                    onClick={startImportMode}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                  >
                    📥 Импортировать готовые подписи
                  </button>
                ) : (
                  <button
                    onClick={stopImportMode}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
                  >
                    ❌ Отменить импорт
                  </button>
                )}
                <p className="text-sm text-gray-600 flex items-center">
                  {showImportMode 
                    ? '🔄 Режим импорта готовых подписей активен' 
                    : 'Используйте если у вас уже есть подписанные хеши транзакций'
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Режим импорта готовых подписей */}
        {showImportMode && safeInfo && (
          <div className="mb-8 p-6 bg-purple-50 border-2 border-purple-200 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">📥 Импорт готовых подписей и выполнение транзакции</h2>
            <p className="text-gray-700 mb-6">
              Укажите функцию для вызова, затем импортируйте готовые подписи и выполните транзакцию.
            </p>

            {/* Форма данных функции */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">🎯 Данные вызова функции:</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Адрес контракта:
                  </label>
                  <input
                    type="text"
                    value={externalTransactionForm.contractAddress}
                    onChange={(e) => setExternalTransactionForm(prev => ({ ...prev, contractAddress: e.target.value }))}
                    placeholder="0x1234567890123456789012345678901234567890"
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ETH Value:
                  </label>
                  <input
                    type="text"
                    value={externalTransactionForm.ethValue}
                    onChange={(e) => setExternalTransactionForm(prev => ({ ...prev, ethValue: e.target.value }))}
                    placeholder="0"
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Сигнатура функции:
                </label>
                <input
                  type="text"
                  value={externalTransactionForm.functionSignature}
                  onChange={(e) => setExternalTransactionForm(prev => ({ ...prev, functionSignature: e.target.value }))}
                  placeholder="transfer(address,uint256)"
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Формат: functionName(type1,type2,...)
                </p>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Параметры функции:
                  </label>
                  <button
                    onClick={addExternalFunctionParam}
                    type="button"
                    className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                  >
                    + Добавить параметр
                  </button>
                </div>
                
                {externalTransactionForm.functionParams.map((param, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={param}
                      onChange={(e) => updateExternalFunctionParam(index, e.target.value)}
                      placeholder={`Параметр ${index + 1}`}
                      className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
                    />
                    {externalTransactionForm.functionParams.length > 1 && (
                      <button
                        onClick={() => removeExternalFunctionParam(index)}
                        type="button"
                        className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                      >
                        ❌
                      </button>
                    )}
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-1">
                  Введите параметры в том порядке, в котором они указаны в сигнатуре функции
                </p>
              </div>
            </div>

            {/* Форма импорта подписей */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">📝 Импорт подписей:</h3>
              <div className="p-4 bg-white border border-gray-200 rounded-lg">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Адрес подписанта:
                    </label>
                    <input
                      type="text"
                      value={importSignatureForm.signerAddress}
                      onChange={(e) => setImportSignatureForm(prev => ({ ...prev, signerAddress: e.target.value }))}
                      placeholder="0x1234567890123456789012345678901234567890"
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Подпись:
                    </label>
                    <textarea
                      value={importSignatureForm.signature}
                      onChange={(e) => setImportSignatureForm(prev => ({ ...prev, signature: e.target.value }))}
                      placeholder="0x1234567890abcdef... (132 символа)"
                      rows={2}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      onClick={importExternalSignature}
                      disabled={!importSignatureForm.signerAddress || !importSignatureForm.signature}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                      📝 Добавить подпись
                    </button>
                    <button
                      onClick={resetImportForm}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      🔄 Очистить
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Список собранных подписей */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">
                📋 Собранные подписи ({collectedSignatures.length} из {safeInfo.threshold}):
              </h3>
              
              {collectedSignatures.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 text-sm">
                    🔍 Подписи пока не добавлены. Используйте форму выше для импорта подписей.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {collectedSignatures.map((sig, index) => (
                    <div key={sig.signer} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-green-900 text-sm mb-1">
                            👤 Подписант #{index + 1}: {sig.signer}
                          </div>
                          <div className="font-mono text-xs text-green-700 break-all">
                            🔐 {sig.signature.slice(0, 20)}...{sig.signature.slice(-10)}
                          </div>
                        </div>
                        <button
                          onClick={() => removeSignatureFromCollection(sig.signer)}
                          className="ml-3 px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-xs"
                          title="Удалить подпись"
                        >
                          ❌
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Кнопка выполнения */}
            <div className="mb-6">
              <button
                onClick={executeExternalTransaction}
                               disabled={
                 loading.executeExternalTransaction || 
                 collectedSignatures.length < safeInfo.threshold ||
                 !externalTransactionForm.contractAddress ||
                 !externalTransactionForm.functionSignature
               }
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                {loading.executeExternalTransaction ? 'Выполнение...' : '🚀 Выполнить транзакцию с импортированными подписями'}
              </button>
              
              {collectedSignatures.length < safeInfo.threshold && (
                <p className="mt-2 text-sm text-gray-500">
                  Недостаточно подписей: {collectedSignatures.length} из {safeInfo.threshold} требуемых
                </p>
              )}
              
              {(!externalTransactionForm.contractAddress || !externalTransactionForm.functionSignature) && (
                <p className="mt-2 text-sm text-gray-500">
                  Заполните обязательные поля: адрес контракта и сигнатуру функции
                </p>
              )}
            </div>

            {/* Результат выполнения */}
            {executionResult && (
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-4">🎉 Транзакция успешно выполнена!</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="font-medium text-gray-700 mb-2 block">
                      🔗 Хеш транзакции:
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-3 bg-white border rounded-lg font-mono text-sm break-all">
                        {executionResult.hash}
                      </div>
                      <button
                        onClick={() => copyToClipboard(executionResult.hash, 'Хеш транзакции')}
                        className="px-3 py-3 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                        title="Скопировать хеш"
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-gray-700">Использовано подписей:</span>
                      <span className="ml-2 text-green-600">{executionResult.signaturesUsed}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Требуется threshold:</span>
                      <span className="ml-2 text-green-600">{executionResult.threshold}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Пропозалы пользователя */}
        {signer && safeInfo && showUserProposals && (
          <div className="mb-8">
            <UserProposals
              userAddress={userAddress}
              onProposalAction={handleUserProposalAction}
              refreshTrigger={userProposalsRefresh}
              className=""
            />
          </div>
        )}

        {/* Управление Safe */}
        {signer && showSafeManagement && (
          <SafeManagement
            onConnect={handleConnectToSafeWithForm}
            onCreate={handleCreateSafeWithForm}
            onPredict={handlePredictSafeAddress}
            loading={loading.createSafe || loading.connectSafe}
            predicting={loading.predictAddress}
            predictedAddress={predictedSafeAddress}
            userAddress={userAddress}
            className="mb-8"
          />
        )}

        {/* Быстрое переподключение к созданному Safe */}
        {signer && !safeInfo && lastCreatedSafeAddress && showSafeManagement && (
          <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-green-900 mb-1">🚀 Переподключение к созданному Safe</h3>
                <p className="text-sm text-green-800">
                  Адрес: <code className="bg-white px-2 py-1 rounded text-xs">{formatAddress(lastCreatedSafeAddress)}</code>
                </p>
              </div>
              <button
                onClick={() => {
                  // Мы не можем использовать handleConnectToSafe(старый метод) из-за отсутствия параметров
                  showError('Пожалуйста, используйте форму подключения с указанием владельцев и порога')
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                🔄 Переподключиться
              </button>
            </div>
            <p className="mt-2 text-xs text-green-700">
              ℹ️ Для подключения укажите владельцев и порог в форме выше
            </p>
          </div>
        )}

        {signer && safeInfo && (
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

                {/* Шаги 4-5: Список ожидающих транзакций */}
                <div className="p-6 bg-white rounded-lg shadow">
                  <h2 className="text-xl font-semibold mb-4">4. Ожидающие транзакции</h2>
                  
                  {pendingTransactions.length === 0 ? (
                    <p className="text-gray-500">Нет ожидающих транзакций</p>
                  ) : (
                    <div className="space-y-4">
                      {pendingTransactions.map((tx) => {
                        const approvalInfo = approvedHashInfos.get(tx.safeTxHash)
                        
                        return (
                          <div key={tx.safeTxHash} className="p-4 border border-gray-200 rounded-lg">
                            {/* Основная информация о транзакции */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                              <div>
                                <p><strong>Получатель:</strong> {formatAddress(tx.to)}</p>
                                <p><strong>Сумма:</strong> {tx.value} ETH</p>
                              </div>
                              <div>
                                <p><strong>Nonce:</strong> {tx.nonce}</p>
                              </div>
                            </div>
                            
                            {/* Approved Hash информация */}
                            {approvalInfo && (
                              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-blue-900">📝 Approved Hash Status</h4>
                                  <button
                                    onClick={() => updateApprovedHashInfo(tx.safeTxHash)}
                                    className="text-blue-600 hover:text-blue-800 text-sm"
                                  >
                                    🔄
                                  </button>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                  <div>
                                    <span className="font-medium text-gray-700">Одобрения:</span>
                                    <span className={`ml-2 font-semibold ${approvalInfo.canExecute ? 'text-green-600' : 'text-orange-600'}`}>
                                      {approvalInfo.approvedCount} / {approvalInfo.threshold}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-700">Статус:</span>
                                    <span className={`ml-2 ${approvalInfo.canExecute ? 'text-green-600' : 'text-orange-600'}`}>
                                      {approvalInfo.canExecute ? '✅ Готово к выполнению' : '⏳ Требуются одобрения'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-700">Владельцев:</span>
                                    <span className="ml-2 text-gray-600">{approvalInfo.totalOwners}</span>
                                  </div>
                                </div>
                                
                                {approvalInfo.approvedOwners.length > 0 && (
                                  <div className="mt-2">
                                    <span className="text-xs font-medium text-gray-700">Одобрившие:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {approvalInfo.approvedOwners.map((owner, index) => (
                                        <span key={index} className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                          👤 {formatAddress(owner)}
                                          {owner.toLowerCase() === userAddress.toLowerCase() && (
                                            <span className="ml-1 text-green-600">●</span>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            <p className="text-xs font-mono text-gray-500 mb-4">
                              Hash: {tx.safeTxHash}
                            </p>

                            {/* Кнопки действий */}
                            <div className="flex flex-wrap gap-2">

                              {/* Approved Hash кнопки */}
                              {!tx.isExecuted && (
                                <>
                                  <button
                                    onClick={() => handleApproveTransactionHash(tx)}
                                    disabled={loading[`approve_${tx.safeTxHash}`]}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {loading[`approve_${tx.safeTxHash}`] ? 'Одобряем...' : '📝 Одобрить хэш'}
                                  </button>
                                  
                                  {approvalInfo && approvalInfo.canExecute && (
                                    <button
                                      onClick={() => handleExecuteWithPreApprovals(tx)}
                                      disabled={loading[`execute_preapproved_${tx.safeTxHash}`]}
                                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                    >
                                      {loading[`execute_preapproved_${tx.safeTxHash}`] ? 'Выполнение...' : '🏆 Выполнить (Approved Hash)'}
                                    </button>
                                  )}

                                  <button
                                    onClick={() => updateApprovedHashInfo(tx.safeTxHash)}
                                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                  >
                                    🔄 Проверить одобрения
                                  </button>
                                </>
                              )}

                              {tx.isExecuted && (
                                <span className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">
                                  ✅ Выполнено
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => safeInfo && loadPendingTransactions(safeInfo.address)}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      🔄 Обновить список
                    </button>
                    <button
                      onClick={updateAllApprovedHashInfos}
                      disabled={pendingTransactions.length === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      📝 Проверить все одобрения
                    </button>
                  </div>
                  
                  {/* Информационная панель approved hash */}
                  <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <h3 className="font-medium text-purple-900 mb-2">💡 Approved Hash Workflow</h3>
                    <div className="text-sm text-purple-800 space-y-1">
                      <p><strong>1️⃣ Одобрение:</strong> Владельцы нажимают "📝 Одобрить хэш" для транзакции</p>
                      <p><strong>2️⃣ Проверка:</strong> Используйте "🔄 Проверить одобрения" чтобы увидеть текущий статус</p>
                      <p><strong>3️⃣ Выполнение:</strong> Когда набрано {safeInfo?.threshold || 'N'} одобрений, любой может нажать "🏆 Выполнить (Approved Hash)"</p>
                      <p><strong>⚡ Преимущество:</strong> Газ за выполнение платит только один человек!</p>
                    </div>
                  </div>
                </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SafeMultisigApp
