import { ethers } from 'ethers'
import { 
  ContractNetworksConfig,
  SafeAccountConfig,
  SafeDeploymentConfig,
  PredictedSafeProps
} from '@safe-global/protocol-kit'
import { getNetworkConfig as getNetworkConfigFromConstants, NetworkConfig as ConstantsNetworkConfig } from './constants'

// Переэкспортируем NetworkConfig из constants
export type NetworkConfig = ConstantsNetworkConfig

// Получение конфигурации сети из констант
export function getNetworkConfig(): NetworkConfig {
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '31337')
  const config = getNetworkConfigFromConstants(chainId)
  return config
}

export function createContractNetworksConfig(config: ConstantsNetworkConfig): ContractNetworksConfig {
  const contractNetworksConfig = {
    [config.chainId]: {
      safeSingletonAddress: config.contracts.safeL2Singleton,
      safeProxyFactoryAddress: config.contracts.safeProxyFactory,
      multiSendAddress: config.contracts.multiSend,
      multiSendCallOnlyAddress: config.contracts.multiSendCallOnly,
      fallbackHandlerAddress: config.contracts.compatibilityFallbackHandler,
      signMessageLibAddress: config.contracts.signMessageLib,
      createCallAddress: config.contracts.createCall,
      simulateTxAccessorAddress: config.contracts.simulateTxAccessor
    }
  }
  
  console.log('🛠️ createContractNetworksConfig создал:', contractNetworksConfig)
  
  return contractNetworksConfig
}


// Получение провайдера для чтения данных
export function getProvider(): ethers.JsonRpcProvider {
  const config = getNetworkConfig()
  return new ethers.JsonRpcProvider(config.rpcUrl)
}

// Проверка подключения кошелька
export async function checkWalletConnection(): Promise<ethers.Signer | null> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum)
    const accounts = await provider.listAccounts()
    
    if (accounts.length === 0) {
      return null
    }

    return await provider.getSigner()
  } catch (error) {
    console.error('Ошибка при проверке подключения кошелька:', error)
    return null
  }
}

// Подключение к кошельку
export async function connectWallet(): Promise<ethers.Signer> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask не установлен')
  }

  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' })
    const provider = new ethers.BrowserProvider(window.ethereum)
    
    // Проверяем chain ID от MetaMask
    const network = await provider.getNetwork()
    console.log('🌍 MetaMask Chain ID:', network.chainId.toString())
    console.log('🌍 MetaMask Network:', network)
    
    return await provider.getSigner()
  } catch (error) {
    console.error('Ошибка при подключении к кошельку:', error)
    throw new Error('Не удалось подключиться к кошельку')
  }
}

// Утилита для проверки корректности адреса Ethereum
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address)
}

// Утилита для форматирования адреса (сокращение)
export function formatAddress(address: string): string {
  if (!isValidAddress(address)) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Утилита для форматирования суммы в ETH
export function formatEthValue(value: string | bigint): string {
  return ethers.formatEther(value)
}

// Утилита для преобразования ETH в Wei
export function parseEthValue(value: string): bigint {
  return ethers.parseEther(value)
}

// Получение баланса адреса
export async function getBalance(address: string): Promise<string> {
  const provider = getProvider()
  const balance = await provider.getBalance(address)
  return formatEthValue(balance)
}

// Типы для расширения window с ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>
      on: (eventName: string, handler: (...args: any[]) => void) => void
      removeListener: (eventName: string, handler: (...args: any[]) => void) => void
    }
  }
}

// Обработчик событий смены аккаунта
export function onAccountsChanged(handler: (accounts: string[]) => void) {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on('accountsChanged', handler)
  }
}

// Обработчик событий смены сети
export function onChainChanged(handler: (chainId: string) => void) {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on('chainChanged', handler)
  }
}

// Очистка обработчиков событий
export function removeEventListeners() {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.removeListener('accountsChanged', () => {})
    window.ethereum.removeListener('chainChanged', () => {})
  }
}

