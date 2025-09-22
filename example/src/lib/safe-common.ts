import { ethers } from 'ethers'
import { 
  ContractNetworksConfig
} from '@safe-global/protocol-kit'
import { getNetworkConfig as getNetworkConfigFromConstants, NetworkConfig as ConstantsNetworkConfig } from './constants'

// Re-export NetworkConfig from constants
export type NetworkConfig = ConstantsNetworkConfig

// Default Safe version configuration
export const DEFAULT_SAFE_VERSION = '1.4.1'

// Get network configuration from constants
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
  
  console.log('🛠️ createContractNetworksConfig created:', contractNetworksConfig)
  
  return contractNetworksConfig
}


// Get provider for reading data
export function getProvider(): ethers.JsonRpcProvider {
  const config = getNetworkConfig()
  return new ethers.JsonRpcProvider(config.rpcUrl)
}

// Check wallet connection
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
    console.error('Wallet connection check error:', error)
    return null
  }
}

// Connect to wallet
export async function connectWallet(): Promise<ethers.Signer> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask not installed')
  }

  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' })
    const provider = new ethers.BrowserProvider(window.ethereum)
    
    // Check chain ID from MetaMask
    const network = await provider.getNetwork()
    console.log('🌍 MetaMask Chain ID:', network.chainId.toString())
    console.log('🌍 MetaMask Network:', network)
    
    return await provider.getSigner()
  } catch (error) {
    console.error('Wallet connection error:', error)
    throw new Error('Failed to connect to wallet')
  }
}

// Utility for Ethereum address validation
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address)
}

// Utility for address formatting (abbreviation)
export function formatAddress(address: string): string {
  if (!isValidAddress(address)) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Utility for ETH amount formatting
export function formatEthValue(value: string | bigint): string {
  return ethers.formatEther(value)
}

// Utility for converting ETH to Wei
export function parseEthValue(value: string): bigint {
  return ethers.parseEther(value)
}

// Get address balance
export async function getBalance(address: string): Promise<string> {
  const provider = getProvider()
  const balance = await provider.getBalance(address)
  return formatEthValue(balance)
}

// Types for extending window with ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>
      on: (eventName: string, handler: (...args: any[]) => void) => void
      removeListener: (eventName: string, handler: (...args: any[]) => void) => void
    }
  }
}

// Account change event handler
export function onAccountsChanged(handler: (accounts: string[]) => void) {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on('accountsChanged', handler)
  }
}

// Network change event handler
export function onChainChanged(handler: (chainId: string) => void) {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on('chainChanged', handler)
  }
}

// Clear event listeners
export function removeEventListeners() {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.removeListener('accountsChanged', () => {})
    window.ethereum.removeListener('chainChanged', () => {})
  }
}

