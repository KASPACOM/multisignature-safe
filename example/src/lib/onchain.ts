import { ethers } from 'ethers'
import Safe from '@safe-global/protocol-kit'
import {
  SafeTransaction,
  MetaTransactionData,
  SafeTransactionDataPartial
} from '@safe-global/types-kit'
import {
  SafeAccountConfig,
  PredictedSafeProps,
  SafeConfig,
  ConnectSafeConfig
} from '@safe-global/protocol-kit'

import {
  getNetworkConfig,
  createContractNetworksConfig
} from './safe-common'
import { UniversalOperationResult } from './offchain'

// Интерфейс для создания Safe (deprecated - используйте SafeCreationForm)
export interface CreateSafeParams {
  owners: string[]
  threshold: number
  signer: ethers.Signer
}

// Интерфейс для транзакции
export interface TransactionParams {
  to: string
  value: string
  data: string
}

// Интерфейс для формы подключения к Safe (frontend)
export interface SafeConnectionForm {
  safeAddress: string
  owners: string[]
  threshold: number
  safeVersion?: string // по умолчанию '1.4.1'
  fallbackHandler?: string // если не указан, будет использован из сети
}

// Интерфейс для создания нового Safe
export interface SafeCreationForm {
  owners: string[]
  threshold: number
  safeVersion?: string // по умолчанию '1.4.1'
  fallbackHandler?: string // если не указан, будет использован из сети
}

// Интерфейс для универсального вызова функции контракта
export interface UniversalFunctionCall {
  contractAddress: string
  functionSignature: string // например: "transfer(address,uint256)" 
  functionParams: any[] // параметры функции в правильном порядке
  value?: string // ETH value, по умолчанию "0"
}

// Класс для работы с Safe ончейн операциями
export class SafeOnChain {
  private signer: ethers.Signer
  private networkConfig = getNetworkConfig()
  private contractNetworks = createContractNetworksConfig(this.networkConfig)
  private safeSdk: Safe | null = null
  private currentSafeAddress: string | null = null
  
  // 🔄 Два режима работы Safe SDK:
  // 1️⃣ PREDICT MODE: симулируем Safe (для создания) - используем predictedSafe
  // 2️⃣ ADDRESS MODE: подключаемся к развернутому Safe - используем safeAddress

  constructor(signer: ethers.Signer) {
    this.signer = signer
  }

  // 🔄 Метод для обновления signer (при смене пользователя в MetaMask)
  async updateSigner(newSigner: ethers.Signer) {
    console.log('🔄 SafeOnChain: Обновляем signer для нового пользователя...')
    
    try {
      const oldAddress = await this.signer?.getAddress()
      const newAddress = await newSigner?.getAddress()
      console.log('📍 Старый адрес:', oldAddress || 'неизвестен') 
      console.log('📍 Новый адрес:', newAddress || 'неизвестен')
    } catch (error) {
      console.log('⚠️ Не удалось получить адреса signer:', error)
    }
    
    this.signer = newSigner
    
    // Сброс текущих подключений - нужно переподключиться с новым signer
    this.safeSdk = null
    this.currentSafeAddress = null
    
    console.log('✅ SafeOnChain: Signer обновлен! Требуется переподключение к Safe.')
  }

  // Получить текущий Safe SDK или бросить ошибку
  getSafeSdk(): Safe {
    if (!this.safeSdk) {
      throw new Error('Safe не подключен. Сначала создайте или подключитесь к Safe.')
    }
    return this.safeSdk
  }

  // Получить текущий адрес Safe
  getCurrentSafeAddress(): string | null {
    return this.currentSafeAddress
  }

  // Получить адрес текущего signer
  async getSignerAddress(): Promise<string> {
    return await this.signer.getAddress()
  }

  // Проверить подключен ли Safe
  isConnected(): boolean {
    const hasSafeSdk = this.safeSdk !== null
    const hasCurrentSafeAddress = this.currentSafeAddress !== null
    return hasSafeSdk && hasCurrentSafeAddress
  }

  // Создание нового Safe с формой
  async createSafeWithForm(form: SafeCreationForm): Promise<Safe> {
    const { owners, threshold } = form

    console.log('🚀 Создание Safe с формой:', { owners, threshold })
    
    const safeAccountConfig: SafeAccountConfig = {
      owners,
      threshold,
      fallbackHandler: form.fallbackHandler || this.networkConfig.contracts.compatibilityFallbackHandler
    }

    console.log('📋 SafeAccountConfig:', safeAccountConfig)
    console.log('🌐 Contract networks:', this.contractNetworks)

    // Создаем Safe с предсказанной конфигурацией
    const predictedSafe: PredictedSafeProps = {
      safeAccountConfig,
      safeDeploymentConfig: {
        safeVersion: '1.4.1'
      }
    }

    const safeConfig: SafeConfig = {
      provider: this.networkConfig.rpcUrl, // ← RPC для подключения к сети
      signer: await this.signer.getAddress(), // ← Адрес signer для подписи транзакций
      predictedSafe,
      contractNetworks: this.contractNetworks
    }

    try {
      console.log('🔧 Инициализируем Safe SDK...')
      const safeSdk = await Safe.init(safeConfig)

      console.log('🔮 Получаем предсказанный адрес...')
      const predictedAddress = await safeSdk.getAddress()
      console.log('📍 Predicted Safe address:', predictedAddress)

      // Проверяем, не существует ли уже Safe по этому адресу
      const provider = this.signer.provider!
      const existingCode = await provider.getCode(predictedAddress)
      
      console.log('🔍 Проверка существующего кода:')
      console.log('  📍 Адрес:', predictedAddress)
      console.log('  📋 Код:', existingCode)
      console.log('  📏 Длина:', existingCode?.length || 0)
      console.log('  ✅ Условие existingCode:', !!existingCode)
      console.log('  ✅ Условие !== "0x":', existingCode !== '0x')
      console.log('  ✅ Условие length > 2:', (existingCode?.length || 0) > 2)
      console.log('  🎯 Общий результат:', !!(existingCode && existingCode !== '0x' && existingCode.length > 2))

      if (existingCode && existingCode !== '0x' && existingCode.length > 2) {
        console.log('🔍 По адресу есть контракт, проверяем это ли Safe...')
        console.log('📍 Адрес:', predictedAddress)
        
        try {
          // Создаем конфигурацию для потенциального Safe
          const existingSafeConfig: SafeConfig = {
            provider: this.networkConfig.rpcUrl, // ← RPC для подключения к сети
            signer: await this.signer.getAddress(), // ← Адрес signer для approved hash операций
            safeAddress: predictedAddress, // Используем safeAddress для deployed Safe
            contractNetworks: this.contractNetworks
          }
          
          console.log('🔄 Пробуем инициализировать как Safe...')
          const existingSafeSdk = await Safe.init(existingSafeConfig)
          
          // Если дошли сюда - это действительно Safe контракт
          console.log('✅ Это действительно Safe! Подключаемся к нему...')
          console.log('🔄 ПЕРЕКЛЮЧЕНИЕ: PREDICT MODE → ADDRESS MODE')
          console.log('👥 Владельцы:', form.owners)
          console.log('🔢 Порог:', form.threshold)
          
          // Устанавливаем как текущий Safe (теперь в ADDRESS MODE)
          this.safeSdk = existingSafeSdk
          this.currentSafeAddress = predictedAddress
          
          console.log('🔗 Подключились к существующему Safe в ADDRESS MODE:', predictedAddress)
          return existingSafeSdk
          
        } catch (error) {
          console.log('⚠️ Контракт по адресу существует, но это не Safe:', error)
          console.log('🚀 Продолжаем создание нового Safe...')
          // Продолжаем выполнение - создаем новый Safe
        }
      }

      console.log('✅ Адрес свободен, создаем Safe...')

      // Деплоим Safe (остаемся в PREDICT MODE)
      console.log('🛠️ Deploying Safe в PREDICT MODE...')
      const deploymentTransaction = await safeSdk.createSafeDeploymentTransaction()
      const txResponse = await this.signer.sendTransaction({
        to: deploymentTransaction.to,
        value: deploymentTransaction.value,
        data: deploymentTransaction.data
      })

      console.log('📝 Safe deployment transaction:', txResponse.hash)

      // Ждем подтверждения
      const receipt = await txResponse.wait?.()
      console.log('✅ Safe deployed in block:', receipt?.blockNumber)

      // Устанавливаем текущий Safe (переходим к ADDRESS MODE после деплоя)
      const deployedSafeAddress = await safeSdk.getAddress()
      this.safeSdk = safeSdk // Теперь это ADDRESS MODE instance!
      this.currentSafeAddress = deployedSafeAddress
      
      console.log('🎉 Safe создан и подключен в ADDRESS MODE:', deployedSafeAddress)

      // Выводим информацию
      const [version, owners, threshold, nonce, balance] = await Promise.all([
        safeSdk.getContractVersion(),
        safeSdk.getOwners(),
        safeSdk.getThreshold(),
        safeSdk.getNonce(),
        safeSdk.getBalance()
      ])

      console.log('📊 Информация о Safe:')
      console.log('  🔍 Версия:', version)
      console.log('  👥 Владельцы:', owners)
      console.log('  🔢 Порог:', threshold)
      console.log('  📝 Nonce:', nonce)
      console.log('  💰 Баланс:', balance)

      return safeSdk

    } catch (error: any) {
      console.error('❌ Ошибка создания Safe:', error.message)
      throw error
    }
  }

  // Создание нового Safe (старый метод для совместимости)
  async createSafe(params: CreateSafeParams): Promise<Safe> {
    const form: SafeCreationForm = {
      owners: params.owners,
      threshold: params.threshold
    }
    return this.createSafeWithForm(form)
  }

  // Подключение к существующему Safe с формой
  async connectToSafeWithForm(form: SafeConnectionForm): Promise<Safe> {
    console.log('🔌 Подключение к Safe с формой:')
    console.log('  📍 Адрес:', form.safeAddress)
    console.log('  👥 Владельцы:', form.owners)
    console.log('  🔢 Порог:', form.threshold)
    console.log('  🔖 Версия:', form.safeVersion)
    
    try {
      // ДЛЯ СУЩЕСТВУЮЩЕГО SAFE используем safeAddress, НЕ predictedSafe!
      const safeConfig: SafeConfig = {
        provider: this.networkConfig.rpcUrl, // ← RPC для подключения к сети
        signer: await this.signer.getAddress(), // ← КРИТИЧНО! Адрес signer для approved hash операций
        safeAddress: form.safeAddress, // ← ПРАВИЛЬНО! Указываем адрес существующего Safe
        contractNetworks: this.contractNetworks,
        isL1SafeSingleton: false
      }

      console.log('🔧 Инициализируем Safe SDK для СУЩЕСТВУЮЩЕГО Safe...')
      const safeSdk = await Safe.init(safeConfig)

      // Устанавливаем текущий Safe
      this.safeSdk = safeSdk
      this.currentSafeAddress = form.safeAddress

      console.log('✅ Safe успешно подключен:', form.safeAddress)

      // Выводим информацию о подключенном Safe
      const [actualOwners, actualThreshold, nonce, balance] = await Promise.all([
        safeSdk.getOwners(),
        safeSdk.getThreshold(),
        safeSdk.getNonce(),
        safeSdk.getBalance()
      ])

      console.log('📊 Информация о подключенном Safe:')
      console.log('  👥 Владельцы:', actualOwners)
      console.log('  🔢 Порог:', actualThreshold)
      console.log('  📝 Nonce:', nonce)
      console.log('  💰 Баланс:', ethers.formatEther(balance), 'ETH')

      // Проверяем соответствие параметров
      if (actualOwners.length !== form.owners.length || actualThreshold !== form.threshold) {
        console.warn('⚠️ Параметры формы не соответствуют реальным параметрам Safe!')
        console.warn('  Форма владельцы/порог:', form.owners.length, '/', form.threshold)
        console.warn('  Реальные владельцы/порог:', actualOwners.length, '/', actualThreshold)
      }

      return safeSdk

    } catch (error) {
      console.error('❌ Ошибка подключения к Safe:', error)
      this.safeSdk = null
      this.currentSafeAddress = null
      throw error
    }
  }

  // Отключение от текущего Safe
  disconnect(): void {
    console.log('🔌 Отключение от Safe:', this.currentSafeAddress)
    this.safeSdk = null
    this.currentSafeAddress = null
  }


  // Получение адреса Safe по форме создания (без деплоя)
  async getSafeAddressByForm(form: SafeCreationForm): Promise<string> {
    console.log('🔮 Получаем предсказанный адрес Safe по форме...')
    console.log('👥 Владельцы:', form.owners)
    console.log('🔢 Порог:', form.threshold)
    
    try {
      const predictedSafe: PredictedSafeProps = {
        safeAccountConfig: {
          owners: form.owners,
          threshold: form.threshold,
          fallbackHandler: form.fallbackHandler || this.networkConfig.contracts.compatibilityFallbackHandler
        },
        safeDeploymentConfig: {
          safeVersion: '1.4.1'
        }
      }

      const safeConfig: SafeConfig = {
        provider: this.networkConfig.rpcUrl, // ← RPC для подключения к сети
        signer: await this.signer.getAddress(), // ← Адрес signer для предсказания адреса
        predictedSafe,
        isL1SafeSingleton: false,
        contractNetworks: this.contractNetworks,
      }

      const safeSdk = await Safe.init(safeConfig)
      const predictedAddress = await safeSdk.getAddress()
      
      console.log('📍 Предсказанный адрес Safe:', predictedAddress)
      return predictedAddress

    } catch (error) {
      console.error('❌ Ошибка получения адреса Safe:', error)
      throw error
    }
  }

  // Проверка существования Safe по адресу
  async isSafeDeployed(safeAddress: string): Promise<boolean> {
    try {
      // Проверяем код контракта напрямую через provider
      const provider = this.signer.provider!
      const code = await provider.getCode(safeAddress)

      console.log(`🔍 Проверка Safe по адресу ${safeAddress}:`, {
        codeLength: code.length,
        hasCode: code && code !== '0x' && code.length > 2
      })

      if (!code || code === '0x' || code.length <= 2) {
        console.log('❌ Safe не найден - нет кода контракта')
        return false
      }

      // Проверяем существование через код контракта
      console.log('✅ Safe найден - есть код контракта')
      return true
    } catch (error) {
      console.log('❌ Ошибка проверки Safe по адресу:', safeAddress, error)
      return false
    }
  }

  // Получение информации о текущем Safe
  async getCurrentSafeInfo() {
    const safeSdk = this.getSafeSdk()
    const safeAddress = this.getCurrentSafeAddress()

    if (!safeAddress) {
      throw new Error('Адрес Safe не определен')
    }

    const isDeployed = await safeSdk.isSafeDeployed()

    console.log('🔍 Safe деплоен:', isDeployed)
    console.log('🔍 Safe safeSdk.getOwners:', await safeSdk.getOwners())
    console.log('🔍 Safe safeSdk.getThreshold:', await safeSdk.getThreshold())
    console.log('🔍 Safe safeSdk.getBalance:', await safeSdk.getBalance())
    console.log('🔍 Safe safeSdk.getNonce:', await safeSdk.getNonce())
    console.log('🔍 Safe safeSdk.getContractVersion:', await safeSdk.getContractVersion())

    const [owners, threshold, balance, nonce, version] = await Promise.all([
      safeSdk.getOwners(),
      safeSdk.getThreshold(),
      safeSdk.getBalance(),
      safeSdk.getNonce(),
      safeSdk.getContractVersion()
    ])

    console.log('📊 Информация о Safe:')
    console.log('  👥 Владельцы:', owners)
    console.log('  🔢 Порог:', threshold)
    console.log('  💰 Баланс:', ethers.formatEther(balance), 'ETH')
    console.log('  📝 Nonce:', nonce)
    console.log('  🔖 Версия:', version)

    return {
      address: safeAddress,
      owners,
      threshold,
      balance: ethers.formatEther(balance),
      nonce,
      version,
      isDeployed: await safeSdk.isSafeDeployed()
    }
  }

  // Кодирование вызова функции контракта  
  encodeFunctionCall(functionCall: UniversalFunctionCall): string {
    try {
      console.log('🔧 Кодируем вызов функции:', functionCall.functionSignature)
      console.log('📝 Параметры:', functionCall.functionParams)

      // Создаем интерфейс для функции
      const functionAbi = [`function ${functionCall.functionSignature}`]
      const contractInterface = new ethers.Interface(functionAbi)

      // Получаем имя функции из signature
      const functionName = functionCall.functionSignature.split('(')[0]

      // Кодируем вызов функции
      const encodedData = contractInterface.encodeFunctionData(functionName, functionCall.functionParams)

      console.log('✅ Закодированные данные:', encodedData)
      return encodedData

    } catch (error) {
      console.error('❌ Ошибка кодирования функции:', error)
      throw new Error(`Не удалось закодировать функцию ${functionCall.functionSignature}: ${error}`)
    }
  }

  // Универсальное создание хеша транзакции Safe для текущего Safe
  async createUniversalTransactionHash(
    functionCall: UniversalFunctionCall
  ): Promise<UniversalOperationResult> {
    console.log('🏗️ Создаем универсальную транзакцию для текущего Safe...')
    
    const safeSdk = this.getSafeSdk()
    const safeAddress = this.getCurrentSafeAddress()

    if (!safeAddress) {
      throw new Error('Safe адрес не определен')
    }
    
    try {
      // 1. Кодируем вызов функции
      const encodedData = this.encodeFunctionCall(functionCall)

      // 2. Создаем параметры транзакции
      const transactionParams: TransactionParams = {
        to: functionCall.contractAddress,
        value: functionCall.value || '0',
        data: encodedData
      }

      console.log('📋 Параметры транзакции:')
      console.log(`   - Safe: ${safeAddress}`)
      console.log(`   - To: ${transactionParams.to}`)
      console.log(`   - Value: ${transactionParams.value} ETH`)
      console.log(`   - Data: ${transactionParams.data}`)

      // 3. Создаем Safe транзакцию (nonce будет получен динамически)
      const safeTransaction = await this.createSafeTransaction(transactionParams)
      
      // 4. Получаем актуальный nonce из созданной транзакции
      const nonce = safeTransaction.data.nonce
      console.log(`   - Nonce (из транзакции): ${nonce}`)

      // 5. Получаем хеш транзакции
      const transactionHash = await this.getTransactionHash(safeTransaction)

      console.log('🎯 Хеш транзакции для подписи:', transactionHash)

      return {
        transactionHash,
        safeTransaction,
        encodedData,
        transactionDetails: {
          to: transactionParams.to,
          value: transactionParams.value,
          data: transactionParams.data,
          nonce
        }
      }

    } catch (error) {
      console.error('❌ Ошибка создания универсальной транзакции:', error)
      throw error
    }
  }


  // Создание транзакции Safe для текущего Safe
  async createSafeTransaction(
    transactionParams: TransactionParams
  ): Promise<SafeTransaction> {
    const safeSdk = this.getSafeSdk()

    const metaTransactionData: MetaTransactionData = {
      to: transactionParams.to,
      value: ethers.parseEther(transactionParams.value).toString(),
      data: transactionParams.data
    }

    const safeTransaction = await safeSdk.createTransaction({
      transactions: [metaTransactionData]
    })
    return safeTransaction
  }

  // Создание мультисенд транзакции для текущего Safe
  async createMultiSendTransaction(
    transactions: TransactionParams[]
  ): Promise<SafeTransaction> {
    const safeSdk = this.getSafeSdk()

    const metaTransactions: MetaTransactionData[] = transactions.map(tx => ({
      to: tx.to,
      value: ethers.parseEther(tx.value).toString(),
      data: tx.data
    }))

    const safeTransaction = await safeSdk.createTransaction({
      transactions: metaTransactions
    })

    return safeTransaction
  }

  // Подпись транзакции для текущего Safe
  async signTransaction(
    safeTransaction: SafeTransaction
  ): Promise<SafeTransaction> {
    const safeSdk = this.getSafeSdk()
    const signedTransaction = await safeSdk.signTransaction(safeTransaction)
    return signedTransaction
  }

  // Получение хеша транзакции для текущего Safe
  async getTransactionHash(
    safeTransaction: SafeTransaction
  ): Promise<string> {
    const safeSdk = this.getSafeSdk()
    return await safeSdk.getTransactionHash(safeTransaction)
  }

  // Получение подписи из транзакции
  getSignatureFromTransaction(
    safeTransaction: SafeTransaction,
    signerAddress: string
  ): string | undefined {
    const signatures = safeTransaction.signatures
    if (!signatures) return undefined

    const signature = signatures.get(signerAddress.toLowerCase())
    return signature ? ((typeof signature === 'object' && signature && 'data' in signature) ? String(signature.data) : String(signature)) : undefined
  }

  // Выполнение транзакции для текущего Safe
  async executeTransaction(
    safeTransaction: SafeTransaction
  ): Promise<any> {
    const safeSdk = this.getSafeSdk()
    const safeAddress = this.getCurrentSafeAddress()

    console.log('🚀 Выполнение транзакции Safe:', safeAddress)
    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)

    console.log('✅ Транзакция отправлена, хеш:', executeTxResponse.hash)

    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse
    }
  }

  // Выполнение транзакции с добавлением подписей для текущего Safe
  async executeTransactionWithSignatures(
    safeTransaction: SafeTransaction,
    signatures: Array<{
      signer: string
      signature: string
    }>
  ): Promise<any> {
    console.log('🚀 Добавляем подписи и выполняем транзакцию...')
    
    const safeSdk = this.getSafeSdk()
    const safeAddress = this.getCurrentSafeAddress()

    // Получаем актуальную информацию о владельцах Safe
    const actualOwners = await safeSdk.getOwners()
    
    // Проверяем, что все подписанты являются владельцами
    for (const sig of signatures) {
      const isOwner = actualOwners.map(o => o.toLowerCase()).includes(sig.signer.toLowerCase())
      if (!isOwner) {
        throw new Error(`Адрес ${sig.signer} не является владельцем Safe! Владельцы: ${actualOwners.join(', ')}`)
      }
    }

    // Сортируем подписи по адресам (требование Safe GS026)
    const sortedSignatures = [...signatures].sort((a, b) => {
      return a.signer.toLowerCase().localeCompare(b.signer.toLowerCase())
    })

    console.log('🔄 Сортировка подписей:', sortedSignatures.map(s => s.signer))

    // Добавляем каждую подпись к транзакции в правильном порядке
    for (const sig of sortedSignatures) {
      console.log(`📝 Добавляем подпись от ${sig.signer}:`, sig.signature.slice(0, 10) + '...')
      
      // Создаем SafeSignature объект
      const safeSignature = {
        signer: sig.signer,
        data: sig.signature,
        isContractSignature: false,
        staticPart: (dynamicOffset?: string) => sig.signature,
        dynamicPart: () => ''
      }

      // Добавляем подпись к транзакции
      safeTransaction.addSignature(safeSignature)
    }

    console.log(`✅ Добавлено ${signatures.length} подписей`)
    console.log('📊 Общее количество подписей:', safeTransaction.signatures.size)

    // Проверяем достаточность подписей
    const threshold = await safeSdk.getThreshold()
    console.log(`🎯 Требуется подписей: ${threshold}, имеется: ${safeTransaction.signatures.size}`)

    if (safeTransaction.signatures.size < threshold) {
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, получено: ${safeTransaction.signatures.size}`)
    }

    // Выполняем транзакцию
    console.log('🚀 Выполняем транзакцию...')
    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)

    console.log('✅ Транзакция отправлена! Хеш:', executeTxResponse.hash)

    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse,
      signaturesUsed: signatures.length,
      threshold: threshold
    }
  }

  // Упрощенный метод с EIP-712 подписями через Safe SDK
  async createAndSignTransaction(transactions: Array<{to: string, data: string, value?: string}>): Promise<SafeTransaction> {
    const safeSdk = this.getSafeSdk()
    
    console.log('📝 Создаем транзакцию через Safe SDK...')
    
    // Преобразуем в правильный формат MetaTransactionData с обязательным value
    const metaTransactions = transactions.map(tx => ({
      to: tx.to,
      data: tx.data,
      value: tx.value || '0' // Если value не указан, используем '0'
    }))
    
    // Создаем транзакцию - Safe SDK сам правильно форматирует
    const safeTransaction = await safeSdk.createTransaction({ transactions: metaTransactions })
    
    console.log('✅ Транзакция создана, подписываем через EIP-712...')
    
    // Подписываем через EIP-712 (signTypedData_v4)
    await safeSdk.signTransaction(safeTransaction)
    
    console.log('✅ Транзакция подписана EIP-712!')
    console.log('📊 Подписей в транзакции:', safeTransaction.signatures.size)
    
    return safeTransaction
  }

  // Простое выполнение уже подписанной транзакции
  async executeSignedTransaction(safeTransaction: SafeTransaction): Promise<any> {
    const safeSdk = this.getSafeSdk()
    const threshold = await safeSdk.getThreshold()
    
    console.log(`🎯 Требуется подписей: ${threshold}, есть: ${safeTransaction.signatures.size}`)
    
    if (safeTransaction.signatures.size < threshold) {
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, есть: ${safeTransaction.signatures.size}`)
    }
    
    console.log('🚀 Выполняем подписанную транзакцию...')
    
    // Safe SDK сам разберется с подписями (v = 27/28 для EIP-712)
    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)
    
    console.log('✅ Транзакция выполнена! Хэш:', executeTxResponse.hash)
    
    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse,
      signaturesUsed: safeTransaction.signatures.size,
      threshold: threshold
    }
  }

  // Полный цикл: создать -> подписать -> выполнить (только для single-user)
  async createSignAndExecute(transactions: Array<{to: string, data: string, value?: string}>): Promise<any> {
    console.log('🔄 Полный цикл: создать -> подписать -> выполнить')
    
    // 1. Создаем и подписываем
    const signedTransaction = await this.createAndSignTransaction(transactions)
    
    // 2. Выполняем
    return await this.executeSignedTransaction(signedTransaction)
  }

  // Метод для одобрения хэша транзакции владельцем
  async approveTransactionHash(safeTransaction: SafeTransaction): Promise<string> {
    // Используем "ленивую инициализацию" с safeAddress чтобы избежать RPC проверок
    const currentAddress = this.getCurrentSafeAddress()
    if (!currentAddress) {
      throw new Error('Safe адрес не определен')
    }
    
    // Создаем временный SafeConfig с safeAddress (без RPC проверок)
    const lazyConfig: SafeConfig = {
      provider: this.networkConfig.rpcUrl, // ← RPC для подключения к сети
      signer: await this.signer.getAddress(), // ← КРИТИЧНО! Адрес signer для approved hash операций
      safeAddress: currentAddress, // ← Ленивая инициализация
      contractNetworks: this.contractNetworks
    }
    
    const safeSdk = await Safe.init(lazyConfig)
    
    // Теперь проверяем что Safe действительно развернут
    const isDeployed = await safeSdk.isSafeDeployed()
    if (!isDeployed) {
      throw new Error(`Safe не развернут! Сначала создайте Safe по адресу: ${currentAddress}`)
    }
    
    const txHash = await safeSdk.getTransactionHash(safeTransaction)
    
    console.log('📝 Одобряем хэш транзакции:', txHash)
    
    // Используем встроенный метод Safe SDK для одобрения
    const approveTxResponse = await safeSdk.approveTransactionHash(txHash)
    
    console.log('✅ Хэш одобрен! Tx:', approveTxResponse.hash)
    return txHash
  }

  // Проверяем сколько владельцев одобрили хэш (используем встроенный метод Safe SDK)
  async checkApprovedOwners(transactionHash: string): Promise<string[]> {
    const safeSdk = this.getSafeSdk()
    
    console.log('🔍 Проверяем кто одобрил хэш:', transactionHash)
    
    // Используем встроенный метод Safe SDK
    const approvedOwners = await safeSdk.getOwnersWhoApprovedTx(transactionHash)
    
    console.log('👥 Владельцы одобрившие хэш:', approvedOwners)
    return approvedOwners
  }

  // Гибкое выполнение с mixed подписями (EIP-712 + approved hash)
  async executeWithMixedSignatures(safeTransaction: SafeTransaction): Promise<any> {
    const safeSdk = this.getSafeSdk()
    const threshold = await safeSdk.getThreshold()
    
    // Получаем хэш транзакции и проверяем approved hash одобрения
    const txHash = await safeSdk.getTransactionHash(safeTransaction)
    const approvedOwners = await this.checkApprovedOwners(txHash)
    
    // Считаем общее количество подписей
    const existingSignatures = safeTransaction.signatures.size
    const totalSignatures = existingSignatures + approvedOwners.length
    
    console.log(`🎯 Требуется: ${threshold}`)
    console.log(`📝 EIP-712 подписей: ${existingSignatures}`) 
    console.log(`✅ Approved hash: ${approvedOwners.length}`)
    console.log(`🔢 Всего подписей: ${totalSignatures}`)
    
    if (totalSignatures < threshold) {
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, есть: ${totalSignatures} (EIP-712: ${existingSignatures}, approved: ${approvedOwners.length})`)
    }
    
    // Добавляем approved hash подписи для недостающих владельцев
    if (approvedOwners.length > 0) {
      // Сортируем по адресам (требование Safe)
      const sortedOwners = approvedOwners.sort((a, b) => 
        a.toLowerCase().localeCompare(b.toLowerCase())
      )
      
      sortedOwners.forEach(owner => {
        // Формат approved hash подписи: v=1, r=ownerAddress, s=0
        const approvedSignature = {
          signer: owner.toLowerCase(),
          data: `0x${owner.slice(2).padStart(64, '0')}${'0'.repeat(64)}01`,
          isContractSignature: false,
          staticPart: () => `0x${owner.slice(2).padStart(64, '0')}${'0'.repeat(64)}01`,
          dynamicPart: () => ''
        }
        
        safeTransaction.addSignature(approvedSignature)
      })
      
      console.log('✅ Добавлены approved hash подписи')
    }
    
    console.log('🚀 Выполняем транзакцию с mixed подписями...')
    
    // Выполняем транзакцию через Safe SDK
    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)
    
    console.log('✅ Транзакция выполнена! Хэш:', executeTxResponse.hash)
    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse,
      eip712Signatures: existingSignatures,
      approvedHashSignatures: approvedOwners.length,
      totalSignatures: totalSignatures,
      threshold: threshold
    }
  }

  // =============================================================================
  // ВЫСОКОУРОВНЕВЫЙ WORKFLOW (из SafeManager)
  // =============================================================================

  // Предложение транзакции (создание + подпись + approve hash)
  async proposeTransaction(params: TransactionParams): Promise<string> {
    console.log('📝 SafeOnChain: Предложение транзакции...')
    
    if (!this.isConnected()) {
      throw new Error('Safe не подключен')
    }

    try {
      // 1. Создаем транзакцию
      const safeTransaction = await this.createSafeTransaction(params)

      // 2. Подписываем транзакцию 
      const signedTransaction = await this.signTransaction(safeTransaction)

      // 3. Получаем хеш транзакции
      const safeTxHash = await this.getTransactionHash(signedTransaction)

      // 4. Одобряем хеш в блокчейне (вместо LocalStorage)
      await this.approveTransactionHash(signedTransaction)

      console.log('✅ SafeOnChain: Транзакция предложена и одобрена:', safeTxHash)
      return safeTxHash

    } catch (error) {
      console.error('❌ SafeOnChain: Ошибка предложения транзакции:', error)
      throw error
    }
  }

  // Выполнение транзакции с pre-approved подписями через SafeOffChain
  async executeTransactionByHash(safeTxHash: string, safeOffChain?: any): Promise<string> {
    console.log('🚀 SafeOnChain: Выполнение транзакции по хешу:', safeTxHash)
    
    if (!this.isConnected()) {
      throw new Error('Safe не подключен')
    }

    try {
      let safeTransaction: SafeTransaction

      if (safeOffChain) {
        // Пытаемся восстановить транзакцию из STS
        console.log('📡 Восстанавливаем транзакцию из STS...')
        const txFromSTS = await safeOffChain.getTransaction(safeTxHash)
        
        // Создаем SafeTransaction из данных STS
        safeTransaction = await this.createSafeTransaction({
          to: txFromSTS.to,
          value: txFromSTS.value || '0',
          data: txFromSTS.data || '0x'
        })
        
        // Устанавливаем параметры из STS
        if (txFromSTS.nonce !== undefined) {
          safeTransaction.data.nonce = parseInt(txFromSTS.nonce.toString())
        }
        
        console.log('✅ Транзакция восстановлена из STS')
      } else {
        throw new Error('Для выполнения транзакции по хешу требуется SafeOffChain для восстановления данных')
      }

      // Выполняем с pre-approved подписями
      const result = await this.executeWithPreApprovals(safeTransaction)
      
      console.log('✅ SafeOnChain: Транзакция выполнена по хешу:', result.hash)
      return result.hash

    } catch (error) {
      console.error('❌ SafeOnChain: Ошибка выполнения по хешу:', error)
      throw error
    }
  }

  // Получение информации о транзакции через SafeOffChain
  async getTransactionInfo(safeTxHash: string, safeOffChain?: any): Promise<any> {
    if (!safeOffChain) {
      throw new Error('Требуется SafeOffChain для получения информации о транзакции')
    }

    try {
      const [txData, status] = await Promise.all([
        safeOffChain.getTransaction(safeTxHash),
        safeOffChain.getTransactionStatus(safeTxHash)
      ])

      return {
        safeTxHash,
        to: txData.to,
        value: txData.value || '0',
        data: txData.data || '0x',
        nonce: parseInt(txData.nonce?.toString() || '0'),
        isExecuted: status.isExecuted,
        confirmationsCount: status.confirmationsCount,
        requiredConfirmations: status.requiredConfirmations,
        canExecute: status.canExecute
      }
    } catch (error) {
      console.error('❌ SafeOnChain: Ошибка получения информации о транзакции:', error)
      throw error
    }
  }

  // ОПТИМАЛЬНЫЙ WORKFLOW: Pre-approve then anyone execute
  async executeWithPreApprovals(safeTransaction: SafeTransaction): Promise<any> {
    // Используем "ленивую инициализацию" с safeAddress чтобы избежать RPC проверок
    const currentAddress = this.getCurrentSafeAddress()
    if (!currentAddress) {
      throw new Error('Safe адрес не определен')
    }
    
    // Создаем временный SafeConfig с safeAddress (без RPC проверок)
    const lazyConfig: SafeConfig = {
      provider: this.networkConfig.rpcUrl, // ← RPC для подключения к сети
      signer: await this.signer.getAddress(), // ← КРИТИЧНО! Адрес signer для approved hash операций
      safeAddress: currentAddress, // ← Ленивая инициализация
      contractNetworks: this.contractNetworks
    }
    
    const safeSdk = await Safe.init(lazyConfig)
    
    // Теперь проверяем что Safe действительно развернут
    const isDeployed = await safeSdk.isSafeDeployed()
    if (!isDeployed) {
      throw new Error(`Safe не развернут! Сначала создайте Safe по адресу: ${currentAddress}`)
    }
    
    const threshold = await safeSdk.getThreshold()
    const txHash = await safeSdk.getTransactionHash(safeTransaction)
    
    console.log('🔄 Проверяем pre-approved подписи для выполнения...')
    console.log('📋 Хэш транзакции:', txHash)
    
    // Проверяем кто уже одобрил через approveHash() заранее
    const preApprovedOwners = await this.checkApprovedOwners(txHash)
    
    console.log(`🎯 Требуется подписей: ${threshold}`)
    console.log(`✅ Pre-approved: ${preApprovedOwners.length}`)
    console.log(`👥 Одобрили: [${preApprovedOwners.join(', ')}]`)
    
    if (preApprovedOwners.length < threshold) {
      const missing = threshold - preApprovedOwners.length
      throw new Error(`Недостаточно pre-approved подписей! Требуется: ${threshold}, есть: ${preApprovedOwners.length}. Нужно еще ${missing} подписей.`)
    }
    
    // Создаем пустую транзакцию и добавляем только approved hash подписи
    const emptyTransaction = await safeSdk.createTransaction({ 
      transactions: [safeTransaction.data] 
    })
    
    // Сортируем владельцев по адресам (требование Safe GS026)
    const sortedOwners = preApprovedOwners.sort((a, b) => 
      a.toLowerCase().localeCompare(b.toLowerCase())
    )
    
    console.log('🔄 Сортированные pre-approved владельцы:', sortedOwners)
    
    // Добавляем approved hash подписи для каждого pre-approved владельца
    sortedOwners.forEach(owner => {
      const approvedSignature = {
        signer: owner.toLowerCase(),
        data: `0x${owner.slice(2).padStart(64, '0')}${'0'.repeat(64)}01`,
        isContractSignature: false,
        staticPart: () => `0x${owner.slice(2).padStart(64, '0')}${'0'.repeat(64)}01`,
        dynamicPart: () => ''
      }
      
      emptyTransaction.addSignature(approvedSignature)
      console.log(`📝 Добавлена approved подпись для: ${owner}`)
    })
    
    console.log('🚀 Выполняем транзакцию с pre-approved подписями...')
    console.log(`📊 Используем ${sortedOwners.length} approved hash подписей`)
    
    // Выполняем транзакцию (может выполнить ЛЮБОЙ, не обязательно владелец)
    const executeTxResponse = await safeSdk.executeTransaction(emptyTransaction)
    
    console.log('✅ Транзакция выполнена через pre-approval механизм!')
    console.log('🔗 Хэш выполнения:', executeTxResponse.hash)
    
    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse,
      preApprovedOwners: sortedOwners,
      usedSignatures: sortedOwners.length,
      threshold: threshold,
      executedBy: await this.signer.getAddress()
    }
  }

}

// Создание формы подключения к Safe
export function createSafeConnectionForm(
  safeAddress: string,
  owners: string[],
  threshold: number,
  options?: {
    safeVersion?: string
    fallbackHandler?: string
  }
): SafeConnectionForm {
  return {
    safeAddress,
    owners,
    threshold,
    safeVersion: options?.safeVersion || '1.4.1',
    fallbackHandler: options?.fallbackHandler
  }
}

// Создание формы создания Safe
export function createSafeCreationForm(
  owners: string[],
  threshold: number,
  options?: {
    safeVersion?: string
    fallbackHandler?: string
  }
): SafeCreationForm {
  return {
    owners,
    threshold,
    safeVersion: options?.safeVersion || '1.4.1',
    fallbackHandler: options?.fallbackHandler
  }
}

export default SafeOnChain
