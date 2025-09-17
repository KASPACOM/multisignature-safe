import { ethers } from 'ethers'
import { getSafeConfig } from './network-types'
import Safe from '@safe-global/protocol-kit'
import {
  SafeTransaction,
  MetaTransactionData,
  TransactionResult,
} from '@safe-global/types-kit'
import {
  SafeAccountConfig,
  PredictedSafeProps,
  SafeConfig,
} from '@safe-global/protocol-kit'

import {
  getNetworkConfig,
  createContractNetworksConfig
} from './safe-common'
import { SafeOffChain, UniversalOperationResult } from './offchain'
import { Network } from './network-types'

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

interface ExecuteTransactionResponse {
  hash: string
  response: TransactionResult
  totalSignatures: number
  threshold: number
  executedBy: string
  usedSignatures: number
}

export class SafeOnChain {
  private network: Network
  private networkConfig = getNetworkConfig()
  private contractNetworks = createContractNetworksConfig(this.networkConfig)
  private safeSdk: Safe | null = null
  currentSafeAddress: string | null = null

  constructor(network: Network) {
    this.network = network
    console.log('🌐 SafeOnChain: Инициализация с Network:', {
      chainId: network.id.toString(),
      hasProvider: !!network.provider,
      hasSigner: !!network.signer
    })
  }

  private sortOwners(owners: string[]): string[] {
    return [...owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  }

  getSafeSdk(): Safe {
    if (!this.safeSdk) {
      throw new Error('Safe не подключен. Сначала создайте или подключитесь к Safe.')
    }
    return this.safeSdk
  }

  isConnected(): boolean {
    const hasSafeSdk = this.safeSdk !== null
    const hasCurrentSafeAddress = this.currentSafeAddress !== null
    return hasSafeSdk && hasCurrentSafeAddress
  }

  async createSafeWithForm(form: SafeCreationForm): Promise<Safe> {
    const { owners, threshold } = form

    // Сортируем владельцев для консистентности адреса Safe
    const sortedOwners = this.sortOwners(owners)

    console.log('🚀 Создание Safe с формой:', {
      originalOwners: owners,
      sortedOwners,
      threshold
    })

    const safeAccountConfig: SafeAccountConfig = {
      owners: sortedOwners,
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

    const safeConfig = await getSafeConfig(this.network, {
      predictedSafe,
      contractNetworks: this.contractNetworks
    })

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
          })

          console.log('🔄 Пробуем инициализировать как Safe...')
          const existingSafeSdk = await Safe.init(existingSafeConfig)


          console.log('✅ Это действительно Safe! Подключаемся к нему...')
          console.log('🔄 ПЕРЕКЛЮЧЕНИЕ: PREDICT MODE → ADDRESS MODE')
          console.log('👥 Исходные владельцы:', form.owners)
          console.log('👥 Отсортированные владельцы:', sortedOwners)
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
      })

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
    // Сортируем владельцев для консистентности адреса Safe
    const sortedOwners = this.sortOwners(form.owners)

    console.log('🔮 Получаем предсказанный адрес Safe по форме...')
    console.log('👥 Исходные владельцы:', form.owners)
    console.log('👥 Отсортированные владельцы:', sortedOwners)
    console.log('🔢 Порог:', form.threshold)

    try {
      const predictedSafe: PredictedSafeProps = {
        safeAccountConfig: {
          owners: sortedOwners,
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
      })

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

    if (!this.currentSafeAddress) {
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
      address: this.currentSafeAddress,
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

    if (!this.currentSafeAddress) {
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
      console.log(`   - Safe: ${this.currentSafeAddress}`)
      console.log(`   - To: ${transactionParams.to}`)
      console.log(`   - Value: ${transactionParams.value} ETH`)
      console.log(`   - Data: ${transactionParams.data}`)

      const safeTransaction = await this.createSafeTransaction(transactionParams)

      const nonce = safeTransaction.data.nonce
      console.log(`   - Nonce (из транзакции): ${nonce}`)

      // Валидация транзакции перед созданием хеша
      console.log('🔍 Проверяем валидность транзакции...')
      try {
        const isValid = await safeSdk.isValidTransaction(safeTransaction)
        
        if (!isValid) {
          console.error('❌ Транзакция не прошла валидацию!')
          throw new Error('Транзакция не может быть выполнена: не прошла валидацию Safe SDK')
        }
        
        console.log('✅ Транзакция прошла валидацию успешно')
      } catch (validationError) {
        console.error('❌ Ошибка валидации транзакции:', validationError)
        throw new Error(`Транзакция не может быть выполнена: ${validationError}`)
      }

      const transactionHash = await safeSdk.getTransactionHash(safeTransaction)

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

  async executeTransactionByHash(safeTxHash: string, safeOffChain?: SafeOffChain): Promise<string> {
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

        // Восстанавливаем ВСЕ подписи из confirmations STS (не фильтруем по типу)
        if (txFromSTS.confirmations && txFromSTS.confirmations.length > 0) {
          console.log(`🔄 Восстанавливаем ${txFromSTS.confirmations.length} подтверждений из STS...`)

          for (const confirmation of txFromSTS.confirmations) {
            if (confirmation.signature && confirmation.signature !== '0x') {
              console.log(`📝 Добавляем подпись от ${confirmation.owner} (тип: ${confirmation.signatureType})`)

              // Создаем подпись для SafeSDK
              const signature = {
                signer: confirmation.owner.toLowerCase(),
                data: confirmation.signature,
                isContractSignature: false,
                staticPart: () => confirmation.signature,
                dynamicPart: () => ''
              }

              safeTransaction.addSignature(signature)
            } else if (confirmation.signatureType !== 'EOA') {
              // Для non-EOA подтверждений (approve hash) создаем специальную подпись
              console.log(`📝 Добавляем approve hash подтверждение от ${confirmation.owner}`)

              const approveSignature = {
                signer: confirmation.owner.toLowerCase(),
                data: `0x${confirmation.owner.slice(2).padStart(64, '0')}${'0'.repeat(64)}01`,
                isContractSignature: false,
                staticPart: () => `0x${confirmation.owner.slice(2).padStart(64, '0')}${'0'.repeat(64)}01`,
                dynamicPart: () => ''
              }

              safeTransaction.addSignature(approveSignature)
            }
          }

          console.log(`✅ Восстановлено ${safeTransaction.signatures.size} подтверждений из STS`)
        }

        console.log('✅ Транзакция восстановлена из STS')
      } else {
        throw new Error('Для выполнения транзакции по хешу требуется SafeOffChain для восстановления данных')
      }

      const result = await this.executeTransaction(safeTransaction)

      console.log('✅ SafeOnChain: Транзакция выполнена по хешу:', result.hash)
      return result.hash

    } catch (error) {
      console.error('❌ SafeOnChain: Ошибка выполнения по хешу:', error)
      throw error
    }
  }

  async executeTransaction(safeTransaction: SafeTransaction): Promise<ExecuteTransactionResponse> {
    if (!this.currentSafeAddress) {
      throw new Error('Safe адрес не определен')
    }

    const lazyConfig = await getSafeConfig(this.network, {
      safeAddress: this.currentSafeAddress,
      contractNetworks: this.contractNetworks
    })

    const safeSdk = await Safe.init(lazyConfig)

    const isDeployed = await safeSdk.isSafeDeployed()
    if (!isDeployed) {
      throw new Error(`Safe не развернут! Сначала создайте Safe по адресу: ${this.currentSafeAddress}`)
    }

    const threshold = await safeSdk.getThreshold()
    const txHash = await safeSdk.getTransactionHash(safeTransaction)

    console.log('🚀 Выполняем транзакцию с подписями из STS...')
    console.log('📋 Хэш транзакции:', txHash)

    // Получаем подписи из транзакции (все приходят из STS)
    const signatures = safeTransaction.signatures.size
    const signers = Array.from(safeTransaction.signatures.values()).map(sig => sig.signer)

    console.log(`🎯 Требуется: ${threshold}`)
    console.log(`📝 Подписей в транзакции: ${signatures}`)
    console.log(`👥 Подписанты: [${signers.join(', ')}]`)

    if (signatures < threshold) {
      const missing = threshold - signatures
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, есть: ${signatures}. Нужно еще ${missing} подписей.`)
    }

    // Финальная валидация транзакции перед выполнением
    console.log('🔍 Финальная проверка валидности транзакции перед выполнением...')
    try {
      const isValid = await safeSdk.isValidTransaction(safeTransaction)
      
      if (!isValid) {
        console.error('❌ Транзакция не прошла финальную валидацию!')
        throw new Error('Транзакция не может быть выполнена: не прошла финальную валидацию Safe SDK')
      }
      
      console.log('✅ Транзакция прошла финальную валидацию успешно')
    } catch (validationError) {
      console.error('❌ Ошибка финальной валидации транзакции:', validationError)
      throw new Error(`Транзакция не может быть выполнена: ${validationError}`)
    }

    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)

    console.log('✅ Транзакция выполнена!')
    console.log('🔗 Хэш выполнения:', executeTxResponse.hash)

    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse,
      totalSignatures: signatures,
      threshold: threshold,
      executedBy: await this.network.signer.getAddress(),
      usedSignatures: signatures
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
