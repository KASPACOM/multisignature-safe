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
import { ParsedFunction, FunctionFormData } from './contract-types'
import { contractRegistry } from './contract-registry'

export interface TransactionParams {
  to: string
  value: bigint // Теперь всегда в wei как BigInt
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
  value?: bigint // Теперь в wei как BigInt
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
    const sortedOwners = this.sortOwners(owners)

    console.log('🚀 Создание Safe:', { owners: owners.length, threshold })

    const safeAccountConfig: SafeAccountConfig = {
      owners: sortedOwners,
      threshold,
      fallbackHandler: form.fallbackHandler || this.networkConfig.contracts.compatibilityFallbackHandler
    }

    const predictedSafe: PredictedSafeProps = {
      safeAccountConfig,
      safeDeploymentConfig: {
        safeVersion: '1.4.1'
      }
    }

    const safeConfig = await getSafeConfig(this.network, {
      predictedSafe,
      contractNetworks: this.contractNetworks
    })

    try {
      const safeSdk = await Safe.init(safeConfig)
      const predictedAddress = await safeSdk.getAddress()
      console.log('📍 Предсказанный адрес Safe:', predictedAddress)

      const existingCode = await this.network.provider.getCode(predictedAddress)

      if (existingCode && existingCode !== '0x' && existingCode.length > 2) {
        console.log('🔍 Safe уже существует, подключаемся...')
        try {
          const existingSafeConfig = await getSafeConfig(this.network, {
            safeAddress: predictedAddress,
            contractNetworks: this.contractNetworks
          })

          const existingSafeSdk = await Safe.init(existingSafeConfig)
          this.safeSdk = existingSafeSdk
          this.currentSafeAddress = predictedAddress
          console.log('✅ Подключились к существующему Safe')
          return existingSafeSdk
        } catch (error) {
          console.log('⚠️ Контракт существует, но это не Safe - создаем новый')
        }
      }

      // Деплоим новый Safe
      console.log('🛠️ Деплоим новый Safe...')
      const deploymentTransaction = await safeSdk.createSafeDeploymentTransaction()
      const txResponse = await this.network.signer.sendTransaction({
        to: deploymentTransaction.to,
        value: deploymentTransaction.value,
        data: deploymentTransaction.data
      })

      await txResponse.wait?.()

      const deployedSafeAddress = await safeSdk.getAddress()
      this.safeSdk = safeSdk
      this.currentSafeAddress = deployedSafeAddress

      console.log('✅ Safe создан:', deployedSafeAddress)
      return safeSdk

    } catch (error: any) {
      console.error('❌ Ошибка создания Safe:', error.message)
      throw error
    }
  }

  async connectToSafeWithForm(form: SafeConnectionForm): Promise<Safe> {
    console.log('🔌 Подключение к Safe:', form.safeAddress)

    try {
      const safeConfig = await getSafeConfig(this.network, {
        safeAddress: form.safeAddress,
        contractNetworks: this.contractNetworks,
      })

      const safeSdk = await Safe.init(safeConfig)
      this.safeSdk = safeSdk
      this.currentSafeAddress = form.safeAddress

      console.log('✅ Safe подключен:', form.safeAddress)
      return safeSdk
    } catch (error) {
      console.error('❌ Ошибка подключения к Safe:', error)
      this.safeSdk = null
      this.currentSafeAddress = null
      throw error
    }
  }


  disconnect(): void {
    this.safeSdk = null
    this.currentSafeAddress = null
  }

  async getSafeAddressByForm(form: SafeCreationForm): Promise<string> {
    const sortedOwners = this.sortOwners(form.owners)

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
    return await safeSdk.getAddress()
  }

  async isSafeDeployed(safeAddress: string): Promise<boolean> {
    try {
      const code = await this.network.provider.getCode(safeAddress)
      return !!(code && code !== '0x' && code.length > 2)
    } catch (error) {
      return false
    }
  }

  async getCurrentSafeInfo() {
    const safeSdk = this.getSafeSdk()

    if (!this.currentSafeAddress) {
      throw new Error('Адрес Safe не определен')
    }

    const [owners, threshold, balance, nonce, version, isDeployed] = await Promise.all([
      safeSdk.getOwners(),
      safeSdk.getThreshold(),
      safeSdk.getBalance(),
      safeSdk.getNonce(),
      safeSdk.getContractVersion(),
      safeSdk.isSafeDeployed()
    ])

    return {
      address: this.currentSafeAddress,
      owners,
      threshold,
      balance: ethers.formatEther(balance),
      nonce,
      version,
      isDeployed
    }
  }

  encodeFunctionCall(functionCall: UniversalFunctionCall): string {
    try {
      const functionAbi = [`function ${functionCall.functionSignature}`]
      const contractInterface = new ethers.Interface(functionAbi)
      const functionName = functionCall.functionSignature.split('(')[0]

      return contractInterface.encodeFunctionData(functionName, functionCall.functionParams)
    } catch (error) {
      throw new Error(`Не удалось закодировать функцию ${functionCall.functionSignature}: ${error}`)
    }
  }



  getContractInfo(contractAddress: string): {
    address: string
    functions: ParsedFunction[]
  } | null {
    const contract = contractRegistry.getContract(contractAddress)
    if (!contract) {
      return null
    }

    const functions = contractRegistry.getContractFunctions(contractAddress)

    return {
      address: contractAddress,
      functions
    }
  }

  async createStructuredTransactionHash(
    contractAddress: string,
    selectedFunction: ParsedFunction,
    formData: FunctionFormData
  ): Promise<UniversalOperationResult> {
    if (!this.currentSafeAddress) {
      throw new Error('Safe адрес не определен')
    }

    // Конвертируем ETH в wei (BigInt)
    let valueInWei: bigint = 0n
    if (formData.ethValue && formData.ethValue !== '0' && formData.ethValue !== '') {
      valueInWei = ethers.parseEther(formData.ethValue.toString())
    }

    // Конвертируем структурированные данные в формат UniversalFunctionCall
    const functionCall: UniversalFunctionCall = {
      contractAddress,
      functionSignature: selectedFunction.signature,
      functionParams: this.convertFormDataToParams(selectedFunction, formData.parameters),
      value: valueInWei
    }

    return await this.createUniversalTransactionHash(functionCall)
  }

  private convertFormDataToParams(
    selectedFunction: ParsedFunction,
    parameters: { [key: string]: any }
  ): any[] {
    return selectedFunction.inputs.map((input, index) => {
      const paramName = input.name || `param${index}`
      const value = parameters[paramName]
      return this.convertParameterValue(value, input.type)
    })
  }

  /**
   * Конвертирует значение параметра в соответствии с типом Solidity
   */
  private convertParameterValue(value: any, type: string): any {
    if (!value || value === '') {
      throw new Error(`Параметр типа ${type} не может быть пустым`)
    }

    switch (type) {
      case 'bool':
        return value === 'true' || value === true

      case 'address':
        if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
          throw new Error(`Неверный формат адреса: ${value}`)
        }
        return value

      case 'string':
        return value.toString()

      case 'uint256':
      case 'uint':
        return ethers.parseUnits(value.toString(), 0).toString()

      default:
        if (type.startsWith('uint')) {
          return ethers.parseUnits(value.toString(), 0).toString()
        }
        if (type.startsWith('bytes')) {
          if (!/^0x[a-fA-F0-9]*$/.test(value)) {
            throw new Error(`Неверный формат bytes для ${type}: ${value}`)
          }
          return value
        }

        // Для других типов возвращаем как есть
        return value
    }
  }

  async createUniversalTransactionHash(
    functionCall: UniversalFunctionCall
  ): Promise<UniversalOperationResult> {
    if (!this.currentSafeAddress) {
      throw new Error('Safe адрес не определен')
    }

    console.log('🏗️ Создание транзакции:', {
      contract: functionCall.contractAddress,
      function: functionCall.functionSignature,
      value: ethers.formatEther(functionCall.value || 0n) + ' ETH'
    })

    const encodedData = this.encodeFunctionCall(functionCall)

    const transactionParams: TransactionParams = {
      to: functionCall.contractAddress,
      value: functionCall.value || 0n,
      data: encodedData
    }

    const safeTransaction = await this.createSafeTransaction(transactionParams)
    const transactionHash = await this.getSafeSdk().getTransactionHash(safeTransaction)

    console.log('✅ Хеш транзакции создан:', transactionHash)

    return {
      transactionHash,
      safeTransaction,
      encodedData,
      transactionDetails: {
        to: transactionParams.to,
        value: ethers.formatEther(transactionParams.value),
        data: transactionParams.data,
        nonce: safeTransaction.data.nonce
      }
    }
  }

  async createSafeTransaction(
    transactionParams: TransactionParams
  ): Promise<SafeTransaction> {
    const safeSdk = this.getSafeSdk()
    const valueInWei = transactionParams.value.toString()

    const metaTransactionData: MetaTransactionData = {
      to: transactionParams.to,
      value: valueInWei,
      data: transactionParams.data
    }

    // Для ETH транзакций оцениваем газ
    let safeTxGas = '0'
    if (transactionParams.value > 0n) {
      const gasEstimate = await this.network.provider.estimateGas({
        to: transactionParams.to,
        value: transactionParams.value.toString(),
        data: transactionParams.data,
        from: this.currentSafeAddress!
      })
      safeTxGas = gasEstimate.toString()
    }

    const safeTransaction = await safeSdk.createTransaction({
      transactions: [metaTransactionData],
      options: {
        safeTxGas: safeTxGas
      }
    })


    return safeTransaction
  }

  async executeTransactionByHash(safeTxHash: string, safeOffChain?: SafeOffChain): Promise<string> {
    if (!this.isConnected()) {
      throw new Error('Safe не подключен')
    }

    if (!safeOffChain) {
      throw new Error('Для выполнения транзакции по хешу требуется SafeOffChain для восстановления данных')
    }

    const txFromSTS = await safeOffChain.getTransaction(safeTxHash)

    // Конвертируем value из STS в BigInt
    const valueFromSTS = txFromSTS.value && txFromSTS.value !== '0'
      ? BigInt(txFromSTS.value)
      : 0n

    console.log('💰 Value из STS:', txFromSTS.value, 'wei')
    console.log('💰 Value как BigInt:', valueFromSTS.toString(), 'wei')

    const safeTransaction = await this.createSafeTransaction({
      to: txFromSTS.to,
      value: valueFromSTS,
      data: txFromSTS.data || '0x'
    })

    // Восстанавливаем параметры из STS
    if (txFromSTS.nonce !== undefined) {
      safeTransaction.data.nonce = parseInt(txFromSTS.nonce.toString())
    }
    
    if (txFromSTS.safeTxGas) {
      safeTransaction.data.safeTxGas = txFromSTS.safeTxGas
    }

    if (txFromSTS.baseGas) {
      safeTransaction.data.baseGas = txFromSTS.baseGas
    }

    if (txFromSTS.gasPrice) {
      safeTransaction.data.gasPrice = txFromSTS.gasPrice
    }

    if (txFromSTS.gasToken) {
      safeTransaction.data.gasToken = txFromSTS.gasToken
    }

    if (txFromSTS.refundReceiver) {
      safeTransaction.data.refundReceiver = txFromSTS.refundReceiver
    }

    // Проверяем хеш
    const restoredTxHash = await this.getSafeSdk().getTransactionHash(safeTransaction)
    if (restoredTxHash !== safeTxHash) {
      throw new Error('Не удалось восстановить транзакцию с правильным хешем')
    }

    // Восстанавливаем подписи
    if (txFromSTS.confirmations?.length) {
      const sortedConfirmations = [...txFromSTS.confirmations].sort((a, b) =>
        a.owner.toLowerCase().localeCompare(b.owner.toLowerCase())
      )

      for (const confirmation of sortedConfirmations) {
        if (confirmation.signature && confirmation.signature !== '0x') {
          const signature = {
            signer: confirmation.owner.toLowerCase(),
            data: confirmation.signature,
            isContractSignature: false,
            staticPart: () => confirmation.signature,
            dynamicPart: () => ''
          }
          safeTransaction.addSignature(signature)
        } else if (confirmation.signatureType !== 'EOA') {
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
    }

    const result = await this.executeTransaction(safeTransaction)
    return result.hash
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
    const signatures = safeTransaction.signatures.size

    if (signatures < threshold) {
      const missing = threshold - signatures
      throw new Error(`Недостаточно подписей! Требуется: ${threshold}, есть: ${signatures}. Нужно еще ${missing} подписей.`)
    }

    // Диагностика перед выполнением
    const txValue = BigInt(safeTransaction.data.value)
    const safeAddress = await safeSdk.getAddress()
    const providerBalance = await this.network.provider.getBalance(safeAddress)

    console.log('🏦 Safe адрес:', safeAddress)
    console.log('🏦 Баланс Safe контракта:', providerBalance.toString(), 'wei')
    console.log('💸 Значение транзакции:', txValue.toString(), 'wei')
    console.log('🔍 Safe transaction data:', JSON.stringify(safeTransaction.data, null, 2))

    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)

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