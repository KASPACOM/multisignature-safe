import { ethers } from 'ethers'
import { NetworkContracts } from './constants'
import { Eip1193Provider } from 'ethers'
import { ContractNetworksConfig, PredictedSafeProps } from '@safe-global/protocol-kit'

export type Network = {
  id: bigint
  provider: ethers.BrowserProvider
  signer: ethers.Signer
  eip1193Provider: any  // Сырой window.ethereum для Safe SDK
}

// Утилитарные функции для работы с Network
export const getEip1193Provider = (network: Network): any => {
  // Используем сохраненный оригинальный EIP-1193 провайдер
  return network.eip1193Provider
}

export const getSignerAddress = async (network: Network): Promise<string> => {
  return await network.signer.getAddress()
}

export const getSafeConfig = async (network: Network, options: {
  safeAddress?: string
  predictedSafe?: PredictedSafeProps
  contractNetworks?: ContractNetworksConfig
}) => {
  const eth = getEip1193Provider(network)
  const signerAddress = await getSignerAddress(network)
  
  // Создаем базовую конфигурацию
  const config: any = {
    provider: eth,
    signer: signerAddress
  }
  
  // Добавляем опциональные поля только если они определены
  if (options.safeAddress) {
    config.safeAddress = options.safeAddress
  }
  if (options.predictedSafe) {
    config.predictedSafe = options.predictedSafe
  }
  if (options.contractNetworks) {
    config.contractNetworks = options.contractNetworks
  }
  
  return config
}

export enum WalletState {
  Disconnected = 'Disconnected',  // Не подключен (включает: нет провайдера, отклонен, ошибка)
  Connecting = 'Connecting',       // Подключается (любой loading процесс)
  Connected = 'Connected'          // Подключен и готов к работе
}

export type ConnectionStatus = {
  state: WalletState
  network?: Network
  account?: string
  error?: string
  isLoading?: boolean
}

export type NetworkConfig = {
  chainId: bigint
  name: string
  rpcUrl: string
  contracts?: NetworkContracts
}

export type WalletEvent = 
  | { type: 'CONNECT_REQUESTED' }
  | { type: 'PROVIDER_DETECTED'; provider: ethers.BrowserProvider }
  | { type: 'ACCOUNT_CHANGED'; account: string }
  | { type: 'NETWORK_CHANGED'; chainId: bigint }
  | { type: 'CONNECTION_SUCCESS'; network: Network; account: string }
  | { type: 'CONNECTION_ERROR'; error: string }
  | { type: 'DISCONNECT_REQUESTED' }
  | { type: 'DISCONNECTED' }

export type StateTransition = {
  from: WalletState
  to: WalletState
  trigger: WalletEvent['type']
  condition?: (status: ConnectionStatus, event: WalletEvent) => boolean
}

export const WALLET_TRANSITIONS: StateTransition[] = [
  // Универсальные переходы (работают из любого состояния)
  { from: WalletState.Disconnected, to: WalletState.Connecting, trigger: 'PROVIDER_DETECTED' },
  { from: WalletState.Disconnected, to: WalletState.Connecting, trigger: 'CONNECT_REQUESTED' },
  
  // Переходы из состояния подключения
  { from: WalletState.Connecting, to: WalletState.Connected, trigger: 'CONNECTION_SUCCESS' },
  { from: WalletState.Connecting, to: WalletState.Disconnected, trigger: 'CONNECTION_ERROR' },
  { from: WalletState.Connecting, to: WalletState.Disconnected, trigger: 'DISCONNECTED' },
  
  // Переходы из подключенного состояния
  { from: WalletState.Connected, to: WalletState.Connecting, trigger: 'NETWORK_CHANGED' },
  { from: WalletState.Connected, to: WalletState.Connecting, trigger: 'ACCOUNT_CHANGED' },
  { from: WalletState.Connected, to: WalletState.Disconnected, trigger: 'DISCONNECTED' }
]
