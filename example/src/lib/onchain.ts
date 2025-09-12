import { BrowserProvider, Eip1193Provider, ethers } from 'ethers'
import { getSafeConfig } from './network-types'
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
import { Network } from './network-types'


export interface CreateSafeParams {
  owners: string[]
  threshold: number
  network: Network
}


export interface TransactionParams {
  to: string
  value: string
  data: string
}


export interface SafeConnectionForm {
  safeAddress: string
  owners: string[]
  threshold: number
  safeVersion?: string
  fallbackHandler?: string
}

// Интерфейс для создания нового Safe
export interface SafeCreationForm {
  owners: string[]
  threshold: number
  safeVersion?: string
  fallbackHandler?: string
}


export interface UniversalFunctionCall {
  contractAddress: string
  functionSignature: string
  functionParams: any[]
  value?: string
}

export class SafeOnChain {
  private network: Network
  private networkConfig = getNetworkConfig()
  private contractNetworks = createContractNetworksConfig(this.networkConfig)
  private safeSdk: Safe | null = null
  private currentSafeAddress: string | null = null

  constructor(network: Network) {
    this.network = network
    console.log('🌐 SafeOnChain: Инициализация с Network:', {
      chainId: network.id.toString(),
      hasProvider: !!network.provider,
      hasSigner: !!network.signer
    })
  }

  async updateNetwork(newNetwork: Network) {
    console.log('🔄 SafeOnChain: Обновляем Network для новой сети/пользователя...')

    try {
      const oldAddress = await this.network?.signer?.getAddress()
      const newAddress = await newNetwork?.signer?.getAddress()
      console.log('📍 Старый адрес:', oldAddress || 'неизвестен')
      console.log('📍 Новый адрес:', newAddress || 'неизвестен')
      console.log('📍 Старая сеть:', this.network?.id?.toString() || 'неизвестна')
      console.log('📍 Новая сеть:', newNetwork?.id?.toString() || 'неизвестна')
    } catch (error) {
      console.log('⚠️ Не удалось получить информацию о Network:', error)
    }

    this.network = newNetwork

    this.safeSdk = null
    this.currentSafeAddress = null

    console.log('✅ SafeOnChain: Network обновлен! Требуется переподключение к Safe.')
  }

  getSafeSdk(): Safe {
    if (!this.safeSdk) {
      throw new Error('Safe не подключен. Сначала создайте или подключитесь к Safe.')
    }
    return this.safeSdk
  }

  getCurrentSafeAddress(): string | null {
    return this.currentSafeAddress
  }

  async getSignerAddress(): Promise<string> {
    return await this.network.signer.getAddress()
  }

  getCurrentNetwork(): Network {
    return this.network
  }

  isConnected(): boolean {
    const hasSafeSdk = this.safeSdk !== null
    const hasCurrentSafeAddress = this.currentSafeAddress !== null
    return hasSafeSdk && hasCurrentSafeAddress
  }

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

    const predictedSafe: PredictedSafeProps = {
      safeAccountConfig,
      safeDeploymentConfig: {
        safeVersion: '1.4.1'
      }
    }

    // Используем исправленную функцию getSafeConfig
    console.log('🔍 Network eip1193Provider:', this.network.eip1193Provider)
    console.log('🔍 EIP-1193 provider methods:', Object.getOwnPropertyNames(this.network.eip1193Provider || {}))

    const safeConfig = await getSafeConfig(this.network, {
      predictedSafe,
      contractNetworks: this.contractNetworks
    }) as SafeConfig

    try {
      console.log('🔧 Инициализируем Safe SDK...', safeConfig)
      const safeSdk = await Safe.init(safeConfig)

      console.log('🔮 Получаем предсказанный адрес...')
      const predictedAddress = await safeSdk.getAddress()
      console.log('📍 Predicted Safe address:', predictedAddress)


      const provider = this.network.provider
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

          const existingSafeConfig = await getSafeConfig(this.network, {
            safeAddress: predictedAddress,
            contractNetworks: this.contractNetworks
          }) as SafeConfig

          console.log('🔄 Пробуем инициализировать как Safe...')
          const existingSafeSdk = await Safe.init(existingSafeConfig)


          console.log('✅ Это действительно Safe! Подключаемся к нему...')
          console.log('🔄 ПЕРЕКЛЮЧЕНИЕ: PREDICT MODE → ADDRESS MODE')
          console.log('👥 Владельцы:', form.owners)
          console.log('🔢 Порог:', form.threshold)


          this.safeSdk = existingSafeSdk
          this.currentSafeAddress = predictedAddress

          console.log('🔗 Подключились к существующему Safe в ADDRESS MODE:', predictedAddress)
          return existingSafeSdk

        } catch (error) {
          console.log('⚠️ Контракт по адресу существует, но это не Safe:', error)
          console.log('🚀 Продолжаем создание нового Safe...')

        }
      }

      console.log('✅ Адрес свободен, создаем Safe...')

      console.log('🛠️ Deploying Safe в PREDICT MODE...')
      const deploymentTransaction = await safeSdk.createSafeDeploymentTransaction()
      const txResponse = await this.network.signer.sendTransaction({
        to: deploymentTransaction.to,
        value: deploymentTransaction.value,
        data: deploymentTransaction.data
      })

      console.log('📝 Safe deployment transaction:', txResponse.hash)

      const receipt = await txResponse.wait?.()
      console.log('✅ Safe deployed in block:', receipt?.blockNumber)

      const deployedSafeAddress = await safeSdk.getAddress()
      this.safeSdk = safeSdk
      this.currentSafeAddress = deployedSafeAddress

      console.log('🎉 Safe создан и подключен в ADDRESS MODE:', deployedSafeAddress)

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


  async connectToSafeWithForm(form: SafeConnectionForm): Promise<Safe> {
    console.log('🔌 Подключение к Safe с формой:')
    console.log('  📍 Адрес:', form.safeAddress)
    console.log('  👥 Владельцы:', form.owners)
    console.log('  🔢 Порог:', form.threshold)
    console.log('  🔖 Версия:', form.safeVersion)

    try {
      const safeConfig = await getSafeConfig(this.network, {
        safeAddress: form.safeAddress,
        contractNetworks: this.contractNetworks,
      }) as SafeConfig

      console.log('🔧 Инициализируем Safe SDK для СУЩЕСТВУЮЩЕГО Safe...')
      const safeSdk = await Safe.init(safeConfig)

      this.safeSdk = safeSdk
      this.currentSafeAddress = form.safeAddress

      console.log('✅ Safe успешно подключен:', form.safeAddress)

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


  disconnect(): void {
    console.log('🔌 Отключение от Safe:', this.currentSafeAddress)
    this.safeSdk = null
    this.currentSafeAddress = null
  }

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

      const safeConfig = await getSafeConfig(this.network, {
        predictedSafe,
        contractNetworks: this.contractNetworks,
      }) as SafeConfig

      const safeSdk = await Safe.init(safeConfig)
      const predictedAddress = await safeSdk.getAddress()

      console.log('📍 Предсказанный адрес Safe:', predictedAddress)
      return predictedAddress

    } catch (error) {
      console.error('❌ Ошибка получения адреса Safe:', error)
      throw error
    }
  }

  async isSafeDeployed(safeAddress: string): Promise<boolean> {
    try {
      const provider = this.network.provider
      const code = await provider.getCode(safeAddress)

      console.log(`🔍 Проверка Safe по адресу ${safeAddress}:`, {
        codeLength: code.length,
        hasCode: code && code !== '0x' && code.length > 2
      })

      if (!code || code === '0x' || code.length <= 2) {
        console.log('❌ Safe не найден - нет кода контракта')
        return false
      }

      console.log('✅ Safe найден - есть код контракта')
      return true
    } catch (error) {
      console.log('❌ Ошибка проверки Safe по адресу:', safeAddress, error)
      return false
    }
  }

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

  encodeFunctionCall(functionCall: UniversalFunctionCall): string {
    try {
      console.log('🔧 Кодируем вызов функции:', functionCall.functionSignature)
      console.log('📝 Параметры:', functionCall.functionParams)

      const functionAbi = [`function ${functionCall.functionSignature}`]
      const contractInterface = new ethers.Interface(functionAbi)

      const functionName = functionCall.functionSignature.split('(')[0]

      const encodedData = contractInterface.encodeFunctionData(functionName, functionCall.functionParams)

      console.log('✅ Закодированные данные:', encodedData)
      return encodedData

    } catch (error) {
      console.error('❌ Ошибка кодирования функции:', error)
      throw new Error(`Не удалось закодировать функцию ${functionCall.functionSignature}: ${error}`)
    }
  }

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
      const encodedData = this.encodeFunctionCall(functionCall)

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

      const safeTransaction = await this.createSafeTransaction(transactionParams)

      const nonce = safeTransaction.data.nonce
      console.log(`   - Nonce (из транзакции): ${nonce}`)

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

  async signTransaction(
    safeTransaction: SafeTransaction
  ): Promise<SafeTransaction> {
    const safeSdk = this.getSafeSdk()
    const signedTransaction = await safeSdk.signTransaction(safeTransaction)
    return signedTransaction
  }

  async getTransactionHash(
    safeTransaction: SafeTransaction
  ): Promise<string> {
    const safeSdk = this.getSafeSdk()
    return await safeSdk.getTransactionHash(safeTransaction)
  }

  getSignatureFromTransaction(
    safeTransaction: SafeTransaction,
    signerAddress: string
  ): string | undefined {
    const signatures = safeTransaction.signatures
    if (!signatures) return undefined

    const signature = signatures.get(signerAddress.toLowerCase())
    return signature ? ((typeof signature === 'object' && signature && 'data' in signature) ? String(signature.data) : String(signature)) : undefined
  }

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

    const actualOwners = await safeSdk.getOwners()

    for (const sig of signatures) {
      const isOwner = actualOwners.map(o => o.toLowerCase()).includes(sig.signer.toLowerCase())
      if (!isOwner) {
        throw new Error(`Адрес ${sig.signer} не является владельцем Safe! Владельцы: ${actualOwners.join(', ')}`)
      }
    }

    const sortedSignatures = [...signatures].sort((a, b) => {
      return a.signer.toLowerCase().localeCompare(b.signer.toLowerCase())
    })

    console.log('🔄 Сортировка подписей:', sortedSignatures.map(s => s.signer))

    for (const sig of sortedSignatures) {
      console.log(`📝 Добавляем подпись от ${sig.signer}:`, sig.signature.slice(0, 10) + '...')

      const safeSignature = {
        signer: sig.signer,
        data: sig.signature,
        isContractSignature: false,
        staticPart: (dynamicOffset?: string) => sig.signature,
        dynamicPart: () => ''
      }

      safeTransaction.addSignature(safeSignature)
    }

    console.log(`✅ Добавлено ${signatures.length} подписей`)
    console.log('📊 Общее количество подписей:', safeTransaction.signatures.size)

    const threshold = await safeSdk.getThreshold()
    console.log(`🎯 Требуется подписей: ${threshold}, имеется: ${safeTransaction.signatures.size}`)

    if (safeTransaction.signatures.size < threshold) {
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, получено: ${safeTransaction.signatures.size}`)
    }

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

  async createAndSignTransaction(transactions: Array<{ to: string, data: string, value?: string }>): Promise<SafeTransaction> {
    const safeSdk = this.getSafeSdk()

    console.log('📝 Создаем транзакцию через Safe SDK...')

    const metaTransactions = transactions.map(tx => ({
      to: tx.to,
      data: tx.data,
      value: tx.value || '0'
    }))

    const safeTransaction = await safeSdk.createTransaction({ transactions: metaTransactions })

    console.log('✅ Транзакция создана, подписываем через EIP-712...')

    await safeSdk.signTransaction(safeTransaction)

    console.log('✅ Транзакция подписана EIP-712!')
    console.log('📊 Подписей в транзакции:', safeTransaction.signatures.size)

    return safeTransaction
  }

  async executeSignedTransaction(safeTransaction: SafeTransaction): Promise<any> {
    const safeSdk = this.getSafeSdk()
    const threshold = await safeSdk.getThreshold()

    console.log(`🎯 Требуется подписей: ${threshold}, есть: ${safeTransaction.signatures.size}`)

    if (safeTransaction.signatures.size < threshold) {
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, есть: ${safeTransaction.signatures.size}`)
    }

    console.log('🚀 Выполняем подписанную транзакцию...')

    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)

    console.log('✅ Транзакция выполнена! Хэш:', executeTxResponse.hash)

    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse,
      signaturesUsed: safeTransaction.signatures.size,
      threshold: threshold
    }
  }

  async createSignAndExecute(transactions: Array<{ to: string, data: string, value?: string }>): Promise<any> {
    console.log('🔄 Полный цикл: создать -> подписать -> выполнить')

    const signedTransaction = await this.createAndSignTransaction(transactions)

    return await this.executeSignedTransaction(signedTransaction)
  }

  async approveTransactionHash(safeTransaction: SafeTransaction): Promise<string> {
    const currentAddress = this.getCurrentSafeAddress()
    if (!currentAddress) {
      throw new Error('Safe адрес не определен')
    }

    const lazyConfig = await getSafeConfig(this.network, {
      safeAddress: currentAddress,
      contractNetworks: this.contractNetworks
    }) as SafeConfig

    const safeSdk = await Safe.init(lazyConfig)

    const isDeployed = await safeSdk.isSafeDeployed()
    if (!isDeployed) {
      throw new Error(`Safe не развернут! Сначала создайте Safe по адресу: ${currentAddress}`)
    }

    const txHash = await safeSdk.getTransactionHash(safeTransaction)

    console.log('📝 Одобряем хэш транзакции:', txHash)

    const approveTxResponse = await safeSdk.approveTransactionHash(txHash)

    console.log('✅ Хэш одобрен! Tx:', approveTxResponse.hash)
    return txHash
  }

  async checkApprovedOwners(transactionHash: string): Promise<string[]> {
    const safeSdk = this.getSafeSdk()

    console.log('🔍 Проверяем кто одобрил хэш:', transactionHash)

    const approvedOwners = await safeSdk.getOwnersWhoApprovedTx(transactionHash)

    console.log('👥 Владельцы одобрившие хэш:', approvedOwners)
    return approvedOwners
  }

  async executeWithMixedSignatures(safeTransaction: SafeTransaction): Promise<any> {
    const safeSdk = this.getSafeSdk()
    const threshold = await safeSdk.getThreshold()

    const txHash = await safeSdk.getTransactionHash(safeTransaction)
    const approvedOwners = await this.checkApprovedOwners(txHash)

    const existingSignatures = safeTransaction.signatures.size
    const totalSignatures = existingSignatures + approvedOwners.length

    console.log(`🎯 Требуется: ${threshold}`)
    console.log(`📝 EIP-712 подписей: ${existingSignatures}`)
    console.log(`✅ Approved hash: ${approvedOwners.length}`)
    console.log(`🔢 Всего подписей: ${totalSignatures}`)

    if (totalSignatures < threshold) {
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, есть: ${totalSignatures} (EIP-712: ${existingSignatures}, approved: ${approvedOwners.length})`)
    }

    if (approvedOwners.length > 0) {
      const sortedOwners = approvedOwners.sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      )

      sortedOwners.forEach(owner => {
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

  async proposeTransaction(params: TransactionParams): Promise<string> {
    console.log('📝 SafeOnChain: Предложение транзакции...')

    if (!this.isConnected()) {
      throw new Error('Safe не подключен')
    }

    try {
      const safeTransaction = await this.createSafeTransaction(params)

      const signedTransaction = await this.signTransaction(safeTransaction)

      const safeTxHash = await this.getTransactionHash(signedTransaction)

      await this.approveTransactionHash(signedTransaction)

      console.log('✅ SafeOnChain: Транзакция предложена и одобрена:', safeTxHash)
      return safeTxHash

    } catch (error) {
      console.error('❌ SafeOnChain: Ошибка предложения транзакции:', error)
      throw error
    }
  }


  async executeTransactionByHash(safeTxHash: string, safeOffChain?: any): Promise<string> {
    console.log('🚀 SafeOnChain: Выполнение транзакции по хешу:', safeTxHash)

    if (!this.isConnected()) {
      throw new Error('Safe не подключен')
    }

    try {
      let safeTransaction: SafeTransaction

      if (safeOffChain) {

        console.log('📡 Восстанавливаем транзакцию из STS...')
        const txFromSTS = await safeOffChain.getTransaction(safeTxHash)


        safeTransaction = await this.createSafeTransaction({
          to: txFromSTS.to,
          value: txFromSTS.value || '0',
          data: txFromSTS.data || '0x'
        })


        if (txFromSTS.nonce !== undefined) {
          safeTransaction.data.nonce = parseInt(txFromSTS.nonce.toString())
        }

        // Восстанавливаем подписи из confirmations STS
        if (txFromSTS.confirmations && txFromSTS.confirmations.length > 0) {
          console.log(`🔄 Восстанавливаем ${txFromSTS.confirmations.length} подписей из STS...`)
          
          for (const confirmation of txFromSTS.confirmations) {
            if (confirmation.signature && confirmation.signature !== '0x' && confirmation.signatureType === 'EOA') {
              console.log(`📝 Добавляем EIP-712 подпись от ${confirmation.owner}`)
              
              // Создаем подпись для SafeSDK
              const signature = {
                signer: confirmation.owner.toLowerCase(),
                data: confirmation.signature,
                isContractSignature: false,
                staticPart: () => confirmation.signature,
                dynamicPart: () => ''
              }
              
              safeTransaction.addSignature(signature)
            }
          }
          
          console.log(`✅ Восстановлено ${safeTransaction.signatures.size} EIP-712 подписей из STS`)
        }

        console.log('✅ Транзакция восстановлена из STS')
      } else {
        throw new Error('Для выполнения транзакции по хешу требуется SafeOffChain для восстановления данных')
      }

      const result = await this.executeWithPreApprovals(safeTransaction)

      console.log('✅ SafeOnChain: Транзакция выполнена по хешу:', result.hash)
      return result.hash

    } catch (error) {
      console.error('❌ SafeOnChain: Ошибка выполнения по хешу:', error)
      throw error
    }
  }

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

  async executeWithPreApprovals(safeTransaction: SafeTransaction): Promise<any> {
    const currentAddress = this.getCurrentSafeAddress()
    if (!currentAddress) {
      throw new Error('Safe адрес не определен')
    }

    const lazyConfig = await getSafeConfig(this.network, {
      safeAddress: currentAddress,
      contractNetworks: this.contractNetworks
    }) as SafeConfig

    const safeSdk = await Safe.init(lazyConfig)

    const isDeployed = await safeSdk.isSafeDeployed()
    if (!isDeployed) {
      throw new Error(`Safe не развернут! Сначала создайте Safe по адресу: ${currentAddress}`)
    }

    const threshold = await safeSdk.getThreshold()
    const txHash = await safeSdk.getTransactionHash(safeTransaction)

    console.log('🔄 Универсальная проверка подписей для выполнения...')
    console.log('📋 Хэш транзакции:', txHash)

    // Получаем EIP-712 подписи из транзакции
    const existingSignatures = safeTransaction.signatures.size
    const eip712Signers = Array.from(safeTransaction.signatures.values()).map(sig => sig.signer)
    
    // Получаем approved hash'ы из блокчейна
    const approvedOwners = await this.checkApprovedOwners(txHash)
    
    // Считаем общее количество
    const totalSignatures = existingSignatures + approvedOwners.length

    console.log(`🎯 Требуется: ${threshold}`)
    console.log(`📝 EIP-712 подписей: ${existingSignatures}`)
    console.log(`👥 EIP-712 подписанты: [${eip712Signers.join(', ')}]`)
    console.log(`✅ Approved hash: ${approvedOwners.length}`)
    console.log(`👥 Approved владельцы: [${approvedOwners.join(', ')}]`)
    console.log(`🔢 Всего подписей: ${totalSignatures}`)

    if (totalSignatures < threshold) {
      const missing = threshold - totalSignatures
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, есть: ${totalSignatures} (EIP-712: ${existingSignatures}, approved: ${approvedOwners.length}). Нужно еще ${missing} подписей.`)
    }

    // Используем оригинальную safeTransaction (с EIP-712 подписями, если есть)
    // Добавляем approved подписи только если они есть
    if (approvedOwners.length > 0) {
      const sortedOwners = approvedOwners.sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      )

      console.log('🔄 Добавляем approved hash подписи к транзакции:', sortedOwners)

      sortedOwners.forEach(owner => {
        const approvedSignature = {
          signer: owner.toLowerCase(),
          data: `0x${owner.slice(2).padStart(64, '0')}${'0'.repeat(64)}01`,
          isContractSignature: false,
          staticPart: () => `0x${owner.slice(2).padStart(64, '0')}${'0'.repeat(64)}01`,
          dynamicPart: () => ''
        }

        safeTransaction.addSignature(approvedSignature)
        console.log(`📝 Добавлена approved подпись для: ${owner}`)
      })
    }

    console.log('🚀 Выполняем транзакцию с комбинированными подписями...')
    console.log(`📊 EIP-712: ${existingSignatures}, Approved: ${approvedOwners.length}, Всего: ${safeTransaction.signatures.size}`)

    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)

    console.log('✅ Транзакция выполнена через pre-approval механизм!')
    console.log('🔗 Хэш выполнения:', executeTxResponse.hash)

    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse,
      eip712Signatures: existingSignatures,
      approvedHashSignatures: approvedOwners.length,
      totalSignatures: safeTransaction.signatures.size,
      threshold: threshold,
      executedBy: await this.network.signer.getAddress(),
      // Для обратной совместимости
      preApprovedOwners: approvedOwners,
      usedSignatures: safeTransaction.signatures.size
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
