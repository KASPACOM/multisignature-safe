export interface NetworkContracts {
  safeL2Singleton: string
  safeProxyFactory: string
  compatibilityFallbackHandler: string
  multiSend: string
  multiSendCallOnly: string
  simulateTxAccessor: string
  signMessageLib: string
  createCall: string
}

export interface NetworkConfig {
  chainId: number
  name: string
  rpcUrl: string
  stsUrl?: string
  contracts: NetworkContracts
}
// Configurations for different networks
export const NETWORK_CONFIGS: Record<number, NetworkConfig> = {
  // Anvil Local
  31337: {
    chainId: 31337,
    name: 'Anvil Local',
    rpcUrl: 'http://127.0.0.1:8545',
    stsUrl: 'http://127.0.0.1:8000/api',
    // ✅ Real contract addresses, deployed in Anvil
    contracts: {
      safeL2Singleton: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      safeProxyFactory: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      compatibilityFallbackHandler: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
      multiSend: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      multiSendCallOnly: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
      simulateTxAccessor: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      signMessageLib: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
      createCall: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707'
    }
  }
}

// Function for getting network configuration
export function getNetworkConfig(chainId?: number): NetworkConfig {
  // First try from environment variables
  const envChainId = chainId || 31337

  // Use predefined configuration
  const config = NETWORK_CONFIGS[envChainId]
  if (!config) {
    console.warn(`Network with chainId ${envChainId} not found, using Anvil by default`)
    return NETWORK_CONFIGS[31337]
  }

  return config
}

// Function for getting list of supported networks
export function getSupportedNetworks(): NetworkConfig[] {
  return Object.values(NETWORK_CONFIGS)
}

// Function for checking if network is supported
export function isNetworkSupported(chainId: number): boolean {
  return chainId in NETWORK_CONFIGS
}

// Constants for UI
export const NETWORK_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base', 
  42161: 'Arbitrum',
  11155111: 'Sepolia',
  31337: 'Anvil Local'
}

// Цвета сетей для UI
export const NETWORK_COLORS: Record<number, string> = {
  1: '#627EEA',      // Ethereum blue
  10: '#FF0420',     // Optimism red
  137: '#8247E5',    // Polygon purple
  8453: '#0052FF',   // Base blue
  42161: '#28A0F0',  // Arbitrum blue
  11155111: '#FFDDA7', // Sepolia yellow
  31337: '#4B5563'   // Anvil gray
}

export default NETWORK_CONFIGS
