import { ethers } from 'ethers'
import { NetworkContracts } from './constants'
import { Eip1193Provider } from 'ethers'
import { ContractNetworksConfig, PredictedSafeProps, SafeConfig } from '@safe-global/protocol-kit'

export type Network = {
  id: bigint
  provider: ethers.BrowserProvider
  signer: ethers.Signer
  eip1193Provider: Eip1193Provider  // Сырой window.ethereum для Safe SDK
}

export const getSafeConfig = async (network: Network, options: {
  safeAddress?: string
  predictedSafe?: PredictedSafeProps
  contractNetworks?: ContractNetworksConfig
}): Promise<SafeConfig> => {
  const eth = network.eip1193Provider
  const signerAddress = await network.signer.getAddress()
  
  // Создаем базовую конфигурацию
  const baseConfig = {
    provider: eth,
    signer: signerAddress,
    contractNetworks: options.contractNetworks
  }
  
  // Возвращаем правильную конфигурацию в зависимости от параметров
  if (options.safeAddress) {
    return {
      ...baseConfig,
      safeAddress: options.safeAddress
    } as SafeConfig
  } else if (options.predictedSafe) {
    return {
      ...baseConfig,
      predictedSafe: options.predictedSafe
    } as SafeConfig
  } else {
    throw new Error('Необходимо указать либо safeAddress, либо predictedSafe')
  }
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
