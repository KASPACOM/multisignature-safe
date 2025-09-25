import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'

import SafeOnChain, {
  UniversalFunctionCall,
  SafeCreationForm,
  SafeConnectionForm as SafeConnectionFormData
} from '../lib/onchain'
import { SafeManagement, ProposalsPage } from '../components'
import { ParameterForm } from '../components/ParameterForm'
import { ContractDropdown } from '../components/ContractDropdown'
import { FunctionDropdown } from '../components/FunctionDropdown'
import { ContractInfo } from '../components/TokenInfo'
import SafeOffChain, { UniversalOperationResult } from '../lib/offchain'
import {
  formatAddress,
  DEFAULT_SAFE_VERSION
} from '../lib/safe-common'
import { NETWORK_COLORS, getSupportedNetworks } from '../lib/constants'
import { Network, WalletState, ConnectionStatus } from '../lib/network-types'
import { networkProvider } from '../lib/network-provider'
import { ContractABI, ParsedFunction, FunctionFormData } from '../lib/contract-types'
import { contractRegistry } from '../lib/contract-registry'

interface SafeInfo {
  address: string
  owners: string[]
  threshold: number
  balance: string
  nonce: number
}

interface SignatureResult {
  signature: string
  r: string
  s: string
  v: number
  recoveryId: number
  encodedPacked: string
}

interface UniversalTransactionForm {
  contractAddress: string
  functionSignature: string
  functionParams: string[]
  ethValue: string
}

// Enum for application sections
enum AppSection {
  PROPOSALS = 'proposals',
  CREATE_PROPOSAL = 'main'
}

const SafeMultisigApp: React.FC = () => {
  // Network connection state
  const [network, setNetwork] = useState<Network | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    state: WalletState.Disconnected,
    isLoading: false
  })
  const [userAddress, setUserAddress] = useState<string>('')

  // Section management state
  const [currentSection, setCurrentSection] = useState<AppSection>(AppSection.PROPOSALS)

  // Safe state
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null)

  // Safe connection state
  const [showSafeManagement, setShowSafeManagement] = useState(false)
  const [predictedSafeAddress, setPredictedSafeAddress] = useState<string>('')

  // Universal transaction form state
  const [universalForm, setUniversalForm] = useState<UniversalTransactionForm>({
    contractAddress: '',
    functionSignature: '',
    functionParams: [''],
    ethValue: '0'
  })

  // State for new UI with ABI
  const [selectedContract, setSelectedContract] = useState<ContractABI | null>(null)
  const [selectedFunction, setSelectedFunction] = useState<ParsedFunction | null>(null)
  const [structuredFormData, setStructuredFormData] = useState<FunctionFormData>({
    parameters: {},
    ethValue: '0'
  })
  const [useStructuredMode, setUseStructuredMode] = useState<boolean>(true)

  // Universal transaction creation result
  const [universalResult, setUniversalResult] = useState<UniversalOperationResult | null>(null)

  // Hash signature result
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null)

  // Contract loading state
  const [contractsLoading, setContractsLoading] = useState<boolean>(false)
  const [contractsError, setContractsError] = useState<string | null>(null)

  // Loading state
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({})
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  // Class instances  
  const [safeOnChain, setSafeOnChain] = useState<SafeOnChain | null>(null)
  const [safeOffChain] = useState(() => new SafeOffChain())

  // Initialization on load
  useEffect(() => {
    // Subscribe to NetworkProvider status changes
    const unsubscribe = networkProvider.onStatusChange((status: ConnectionStatus) => {
      console.log('🔄 React: Status update:', status)

      setConnectionStatus(status)

      if (status.network) {
        setNetwork(status.network)
      } else {
        setNetwork(null)
      }

      if (status.account) {
        setUserAddress(status.account)
      } else {
        setUserAddress('')
        // Return to main section on disconnect
        setCurrentSection(AppSection.CREATE_PROPOSAL)
      }
    })

    // Check current state on load
    initializeApp()

    return () => {
      unsubscribe()
    }
  }, [])

  // Update safeOnChain on Network change
  useEffect(() => {
    if (network) {
      console.log('🔄 Creating new SafeOnChain due to Network change')

      // Initialize ContractRegistry for new network
      console.log('🔗 Initializing ContractRegistry for chainId:', network.id)
      contractRegistry.initializeForChain(network.id)
      
      // Load contracts asynchronously
      loadContractsForNetwork()

      // If Safe was connected, need to reconnect with new Network
      const currentSafeAddress = safeInfo?.address
      const currentOwners = safeInfo?.owners
      const currentThreshold = safeInfo?.threshold

      const newSafeOnChain = new SafeOnChain(network)
      setSafeOnChain(newSafeOnChain)

      // If Safe was connected, automatically reconnect
      if (currentSafeAddress && currentOwners && currentThreshold) {
        console.log('🔄 Reconnecting to Safe:', currentSafeAddress)

        // Reconnecting asynchronously
        setTimeout(async () => {
          try {
            await newSafeOnChain.connectToSafeWithForm({
              safeAddress: currentSafeAddress,
              owners: currentOwners,
              threshold: currentThreshold
            })
            
            // Update Safe info with highest nonce after reconnection
            const updatedSafeData = await newSafeOnChain.getCurrentSafeInfo()
            const finalNonce = await getHighestNonce(newSafeOnChain) // Use the unified function
            console.log('📊 Auto-reconnect using unified nonce function')
            
            setSafeInfo({
              address: updatedSafeData.address,
              owners: updatedSafeData.owners,
              threshold: updatedSafeData.threshold,
              balance: updatedSafeData.balance,
              nonce: finalNonce
            })
            
            console.log('✅ Safe automatically reconnected')
          } catch (error) {
            console.error('❌ Safe automatic reconnection error:', error)
            // Clear Safe state on error
            setSafeInfo(null)
            if (currentSection === AppSection.CREATE_PROPOSAL) {
            setShowSafeManagement(true)
            }
            showError('Safe disconnected due to connection change. Please reconnect.')
          }
        }, 100)
      }
    } else {
      setSafeOnChain(null)
      // Clear all Safe state when Network is absent
      setSafeInfo(null)
      if (currentSection === AppSection.CREATE_PROPOSAL) {
      setShowSafeManagement(true)
      }
    }
  }, [network])

  // Automatically show Safe Management when switching to "Create Proposal" page
  useEffect(() => {
    if (currentSection === AppSection.CREATE_PROPOSAL && !safeInfo) {
      setShowSafeManagement(true)
    }
  }, [currentSection, safeInfo])

  // Clear form state when switching to "Create Proposal" page
  useEffect(() => {
    if (currentSection === AppSection.CREATE_PROPOSAL) {
      // Clear only if no active Safe
      if (!safeInfo) {
        setUniversalForm({
          contractAddress: '',
          functionSignature: '',
          functionParams: [''],
          ethValue: '0'
        })
        setUniversalResult(null)
        setSignatureResult(null)
        
        // Clear new states
        setSelectedContract(null)
        setSelectedFunction(null)
        setStructuredFormData({
          parameters: {},
          ethValue: '0'
        })
      }
    }
  }, [currentSection, safeInfo])

  // Get highest nonce between onchain and offchain sources
  const getHighestNonce = async (safeOnChainInstance?: SafeOnChain): Promise<number> => {
    const safeInstance = safeOnChainInstance || safeOnChain
    
    if (!safeInstance || !safeInstance.currentSafeAddress) {
      throw new Error('SafeOnChain not connected')
    }

    // Get onchain nonce
    const onchainSafeData = await safeInstance.getCurrentSafeInfo()
    console.log('📊 Onchain nonce:', onchainSafeData.nonce)

    let highestNonce = onchainSafeData.nonce

    // Try to get offchain current nonce from STS
    if (safeOffChain?.isSTSAvailable()) {
      try {
        const stsNextNonce = await safeOffChain.getNextNonce(safeInstance.currentSafeAddress)
        // Use the highest nonce
        highestNonce = Math.max(onchainSafeData.nonce, stsNextNonce)
        console.log(`📊 Highest nonce: ${highestNonce} (onchain: ${onchainSafeData.nonce}, offchain current: ${stsNextNonce})`)
      } catch (error) {
        console.warn('⚠️ Could not get nonce from STS, using onchain nonce:', error)
      }
    } else {
      console.log('📊 STS not available, using onchain nonce only:', highestNonce)
    }

    return highestNonce
  }

  // Get Safe info with highest nonce for UI display
  const getSafeInfoWithHighestNonce = async () => {
    const onchainSafeData = await safeOnChain!.getCurrentSafeInfo()
    const highestNonce = await getHighestNonce()
    
    return {
      ...onchainSafeData,
      nonce: highestNonce
    }
  }

  // Application initialization
  const initializeApp = async () => {
    console.log('🚀 React: Application initialization...')

    try {
      // Check current state and try to reconnect
      const currentNetwork = await networkProvider.refresh()
      console.log('✅ React: Initialization completed:', {
        hasNetwork: !!currentNetwork,
        networkId: currentNetwork?.id?.toString()
      })
    } catch (error) {
      console.error('❌ React: Initialization error:', error)
    }
  }

  // Wallet event handlers (now through NetworkProvider)
  // Not needed - NetworkProvider handles this automatically

  // State management functions
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

  // Load contracts for current network
  const loadContractsForNetwork = async () => {
    setContractsLoading(true)
    setContractsError(null)

    try {
      console.log('📦 Starting contract loading from API...')
      await contractRegistry.loadContracts({
        limit: 100, // Load first 100 contracts
        trusted: true // Only trusted contracts
      })
      console.log('✅ Contracts loaded successfully')
    } catch (error: any) {
      console.error('❌ Contract loading error:', error)
      setContractsError(error.message)
      showError(`Failed to load contracts: ${error.message}`)
    } finally {
      setContractsLoading(false)
    }
  }

  // 1. Wallet connection through NetworkProvider
  const handleConnectWallet = async () => {
    console.log('🚀 React: Attempting wallet connection...')

    try {
      const connectedNetwork = await networkProvider.connect()
      showSuccess(`Wallet connected successfully! Network: ${connectedNetwork.id.toString()}`)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Connection error')
    }
  }

  // Navigation function to Safe creation with prefilled data
  const handleNavigateToSafeCreation = async (safeAddress: string, owners: string[], threshold: number) => {
    console.log('🔄 Navigation to Safe creation with data:', { safeAddress, owners, threshold })
    
    // Switch to "Create Proposal" page
    setCurrentSection(AppSection.CREATE_PROPOSAL)
    
    // Immediately connect to Safe
    const connectionFormData: SafeConnectionFormData = {
      safeAddress,
      owners,
      threshold,
      safeVersion: DEFAULT_SAFE_VERSION,
      fallbackHandler: ''
    }
    
    showSuccess(`Connecting to Safe ${formatAddress(safeAddress)}...`)
    await handleConnectToSafe(connectionFormData)
  }

  // Safe connection function
  const handleConnectToSafe = async (formData: SafeConnectionFormData) => {
    if (!safeOnChain || !network) {
      showError('Please connect wallet')
      return
    }

    setLoadingState('createSafe', true)
    try {
      console.log('🔌 Connecting to Safe with form:', formData)

      await safeOnChain.connectToSafeWithForm(formData)

      // Get Safe information with highest nonce
      const safeData = await getSafeInfoWithHighestNonce()
      setSafeInfo({
        address: safeData.address,
        owners: safeData.owners,
        threshold: safeData.threshold,
        balance: safeData.balance,
        nonce: safeData.nonce
      })

      // Hide management form
      setShowSafeManagement(false)

      showSuccess(`✅ Connected to Safe ${formatAddress(safeData.address)}`)
      
    } catch (error) {
      console.error('❌ Safe connection error:', error)
      showError(error instanceof Error ? error.message : 'Safe connection error')
    } finally {
      setLoadingState('createSafe', false)
    }
  }

  // 2. Safe creation with form
  const handleCreateSafeWithForm = async (formData: SafeCreationForm) => {
    if (!safeOnChain || !network) {
      showError('Please connect wallet')
      return
    }

    setLoadingState('createSafe', true)
    try {
      console.log('🚀 Creating Safe with form:', formData)

      await safeOnChain.createSafeWithForm(formData)

      const safeAddress = safeOnChain.currentSafeAddress
      if (!safeAddress) {
        throw new Error('Failed to get created Safe address')
      }

      // Get Safe information with highest nonce
      const safeData = await getSafeInfoWithHighestNonce()
      setSafeInfo({
        address: safeData.address,
        owners: safeData.owners,
        threshold: safeData.threshold,
        balance: safeData.balance,
        nonce: safeData.nonce
      })

      // Hide management form
      setShowSafeManagement(false)

      showSuccess(`Safe created and connected: ${formatAddress(safeAddress)}`)
    } catch (error) {
      console.error('❌ Safe creation error:', error)
      showError(error instanceof Error ? error.message : 'Safe creation error')
    }
    setLoadingState('createSafe', false)
  }

  // Safe address prediction
  const handlePredictSafeAddress = async (formData: SafeCreationForm) => {
    if (!safeOnChain) {
      showError('Please connect wallet')
      return
    }

    setLoadingState('predictAddress', true)
    try {
      console.log('🔮 Predicting Safe address by form:', formData)

      const predictedAddress = await safeOnChain.getSafeAddressByForm(formData)
      setPredictedSafeAddress(predictedAddress)

      showSuccess(`Safe address predicted: ${formatAddress(predictedAddress)}`)
    } catch (error) {
      console.error('❌ Address prediction error:', error)
      showError(error instanceof Error ? error.message : 'Address prediction error')
    }
    setLoadingState('predictAddress', false)
  }

  // Creating structured transaction hash (new ABI approach)
  const handleCreateStructuredHash = async () => {
    if (!safeOnChain || !safeInfo) {
      showError('Safe not connected')
      return
    }

    if (!selectedContract || !selectedFunction) {
      showError('Please select contract and function')
      return
    }

    setLoadingState('universalHash', true)
    setUniversalResult(null)

    try {
      console.log('🚀 Creating structured transaction...')
      
      const nextNonce = await getHighestNonce()
      console.log('📍 Using next nonce for transaction:', nextNonce)
      
      const result = await safeOnChain.createStructuredTransactionHash(
        selectedContract.address,
        selectedFunction,
        structuredFormData,
        nextNonce
      )

      setUniversalResult(result)
      showSuccess('Transaction hash created successfully!')
      
    } catch (error: any) {
      console.error('❌ Structured transaction creation error:', error)
      showError(`Transaction creation error: ${error.message}`)
    } finally {
      setLoadingState('universalHash', false)
    }
  }

  // Creating universal transaction hash
  const handleCreateUniversalHash = async () => {
    if (!safeOnChain || !safeInfo) {
      showError('Safe not connected')
      return
    }

    setLoadingState('universalHash', true)
    setUniversalResult(null)

    try {
      if (!universalForm.contractAddress || !universalForm.functionSignature) {
        throw new Error('Please fill contract address and function signature')
      }

      // Parse function parameters from signature
      const paramTypes = universalForm.functionSignature
        .split('(')[1]
        ?.split(')')[0]
        ?.split(',')
        ?.map(p => p.trim())
        ?.filter(p => p.length > 0) || []

      const paramValues = universalForm.functionParams.slice(0, paramTypes.length)

      // Convert parameters to correct types
      const convertedParams = paramValues.map((value, index) => {
        const paramType = paramTypes[index]
        if (!paramType) return value

        // Clean value from spaces
        const cleanValue = value.trim()
        if (!cleanValue) return value

        try {
          if (paramType.includes('uint') || paramType.includes('int')) {
            // For numbers - parse as BigInt
            if (cleanValue.includes('.')) {
              // If has decimals, use parseUnits
              return ethers.parseUnits(cleanValue, 18)
            } else {
              // Whole number
              return ethers.parseUnits(cleanValue, 0)
            }
          }
          if (paramType === 'address') {
            return ethers.getAddress(cleanValue) // Validate and format address
          }
          if (paramType === 'bool') {
            return cleanValue.toLowerCase() === 'true'
          }
          // For string, bytes and others leave as is
          return cleanValue
        } catch (error) {
          console.warn(`Parameter ${index} conversion error: ${error}`)
          return cleanValue
        }
      })

      // Convert ETH to wei (BigInt)
      let valueInWei: bigint = 0n
      if (universalForm.ethValue && universalForm.ethValue !== '0' && universalForm.ethValue !== '') {
        try {
          valueInWei = ethers.parseEther(universalForm.ethValue.toString())
          console.log('💰 Converting user ETH input to wei (manual mode):', universalForm.ethValue, '→', valueInWei.toString())
        } catch (parseError) {
          console.error('❌ ETH value parsing error (manual mode):', universalForm.ethValue, parseError)
          throw new Error(`Invalid ETH value format: ${universalForm.ethValue}`)
        }
      }

      const functionCall: UniversalFunctionCall = {
        contractAddress: universalForm.contractAddress,
        functionSignature: universalForm.functionSignature,
        functionParams: convertedParams,
        value: valueInWei
      }

      console.log('🎯 Creating universal transaction hash for:', functionCall)

      const nextNonce = await getHighestNonce()
      console.log('📍 Using next nonce for transaction:', nextNonce)

      // Create transaction hash through SafeOnChain 
      const result = await safeOnChain.createUniversalTransactionHash(
        functionCall,
        nextNonce
      )

      setUniversalResult({
        transactionHash: result.transactionHash,
        safeTransaction: result.safeTransaction,
        encodedData: result.encodedData,
        transactionDetails: result.transactionDetails
      })

      showSuccess(`✅ Transaction hash created! 
        Hash for signing: ${result.transactionHash}
        Nonce: ${result.transactionDetails.nonce}
        
        ✍️ Next step: Click "Sign EIP-712 Hash" to create signature and send to STS.`)

    } catch (error: any) {
      console.error('❌ Universal hash creation error:', error)
      showError(`Error: ${error.message}`)
    }

    setLoadingState('universalHash', false)
  }

  // Helper function for sending signature to STS
  const sendSignatureToSTS = async (transactionHash: string, userAddress: string) => {
    if (!safeOffChain || !safeInfo) {
      console.log('⚠️ SafeOffChain or SafeInfo unavailable')
      return
    }

    console.log('📤 Sending signed transaction to STS...')

    // Check if transaction exists in STS
    try {
      await safeOffChain.getTransaction(transactionHash)
      console.log('✅ Transaction already exists in STS. Redirecting to "My Proposals" section')

      setTimeout(() => {
        console.log('📋 Switching to "My Proposals" section - transaction already exists')
        setCurrentSection(AppSection.PROPOSALS)
      }, 1500)
    } catch (error: any) {
      // If transaction not found (404 or error text), create new proposal
      if (error?.response?.status === 404 ||
        error?.status === 404 ||
        error?.message?.includes('No MultisigTransaction matches') ||
        error?.message?.includes('Transaction not found') ||
        error?.message?.includes('404') ||
        error?.message?.includes('Not Found')) {
        console.log('📝 Transaction not yet in STS, creating proposal...')
        await proposeUniversalResult(userAddress)
        return
      }
      // If other error, throw it further
      throw error
    }
  }

  const proposeUniversalResult = async (userAddress: string) => {
    if (!safeOffChain || !safeInfo) {
      console.log('⚠️ SafeOffChain or SafeInfo unavailable')
      return
    }

    try {
      await safeOffChain.proposeUniversalResult(
        safeInfo.address,
        universalResult!,
        userAddress,
        'Universal Function Call'
      )

      showSuccess('✅ Proposal created successfully!')

      // Clear form state after successful proposal creation
      setUniversalForm({
        contractAddress: '',
        functionSignature: '',
        functionParams: [''],
        ethValue: '0'
      })
      setUniversalResult(null)
      setSignatureResult(null)
      
      // Clear new states
      setSelectedContract(null)
      setSelectedFunction(null)
      setStructuredFormData({
        parameters: {},
        ethValue: '0'
      })

      setTimeout(() => {
        console.log('📋 Switching to "My Proposals" section - proposal created')
        setCurrentSection(AppSection.PROPOSALS)
      }, 1500)
    } catch (error: any) {
        console.error('❌ Proposal creation error:', error)
        showError(`Proposal creation error: ${error.message}`)
    }
  }

  // Transaction hash signing
  const handleSignTransactionHash = async () => {
      if (!universalResult || !network || !safeOnChain || !safeInfo) {
        showError('No hash to sign, wallet not connected or Safe Manager unavailable')
        return
      }

      setLoadingState('signHash', true)
      setSignatureResult(null)

      try {
        console.log('🖋️ Signing transaction through Protocol Kit (EIP-712):', universalResult.transactionHash)

        // 1. Get user data
        const userAddress = await network.signer.getAddress()
        console.log('🔍 User address:', userAddress)
        console.log('🔍 Transaction hash:', universalResult.transactionHash)

        // 2. Sign transaction through Safe SDK
        const safeSdk = safeOnChain.getSafeSdk()
        const safeTransaction = universalResult.safeTransaction

        if (!safeTransaction) {
          throw new Error('SafeTransaction not found in universal result')
        }

        console.log('📝 Signing transaction through Safe SDK (EIP-712)...')
        const signedSafeTransaction = await safeSdk.signTransaction(safeTransaction)
        console.log('📊 Signatures in signed transaction:', signedSafeTransaction.signatures.size)

        // 3. Extract user signature
        const userSignature = signedSafeTransaction.signatures.get(userAddress) ||
          signedSafeTransaction.signatures.get(userAddress.toLowerCase()) ||
          signedSafeTransaction.signatures.get(ethers.getAddress(userAddress))

        if (!userSignature) {
          const availableKeys = Array.from(signedSafeTransaction.signatures.keys())
          console.log('🔍 Available signature keys:', availableKeys)
          throw new Error(`Signature not found for address ${userAddress}. Available: ${availableKeys.join(', ')}`)
        }

        console.log('✅ Found user signature!')

        // 4. Update state with signature results
        universalResult.safeTransaction = signedSafeTransaction

        const sig = ethers.Signature.from(userSignature.data)
        const newSignatureResult: SignatureResult = {
          signature: userSignature.data,
          r: sig.r,
          s: sig.s,
          v: sig.v,
          recoveryId: sig.v,
          encodedPacked: ethers.solidityPacked(
            ['bytes', 'bytes32', 'bytes32', 'uint8'],
            [userSignature.data, sig.r, sig.s, sig.v]
          )
        }

        setSignatureResult(newSignatureResult)
        console.log('📦 EIP-712 signature created:', newSignatureResult)

        // 5. Send signature to STS (handles everything internally)
        try {
          await sendSignatureToSTS(universalResult.transactionHash, userAddress)
        } catch (stsError: any) {
          console.warn('⚠️ Failed to send EIP-712 signature to STS:', stsError)
          showError(`STS sending error: ${stsError.message}`)
        }

      } catch (error: any) {
        console.error('❌ EIP-712 signature error:', error)
        showError(`Signature error: ${error.message}`)
      } finally {
        setLoadingState('signHash', false)
      }
    }

    // Copy to clipboard
    const copyToClipboard = async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text)
        showSuccess(`✅ ${label} copied to clipboard`)
      } catch (error) {
        console.error('Copy error:', error)
        showError('Failed to copy')
      }
    }

    // Reset universal transaction form
    const resetUniversalForm = () => {
      setUniversalForm({
        contractAddress: '',
        functionSignature: '',
        functionParams: [''],
        ethValue: '0'
      })
      setUniversalResult(null)
      setSignatureResult(null)
    }

    // Add parameter to form
    const addFunctionParam = () => {
      setUniversalForm(prev => ({
        ...prev,
        functionParams: [...prev.functionParams, '']
      }))
    }

    // Remove parameter from form
    const removeFunctionParam = (index: number) => {
      setUniversalForm(prev => ({
        ...prev,
        functionParams: prev.functionParams.filter((_, i) => i !== index)
      }))
    }

    // Update function parameter
    const updateFunctionParam = (index: number, value: string) => {
      setUniversalForm(prev => ({
        ...prev,
        functionParams: prev.functionParams.map((param, i) => i === index ? value : param)
      }))
    }

    // Disconnect from Safe
    const handleDisconnectFromSafe = () => {
      if (safeOnChain) {
        safeOnChain.disconnect()
      }
      setSafeInfo(null)
      setUniversalResult(null)
      setSignatureResult(null)
      setPredictedSafeAddress('')
      // Clear form on Safe disconnect
      setUniversalForm({
        contractAddress: '',
        functionSignature: '',
        functionParams: [''],
        ethValue: '0'
      })
      
      // Clear new states
      setSelectedContract(null)
      setSelectedFunction(null)
      setStructuredFormData({
        parameters: {},
        ethValue: '0'
      })
      if (currentSection === AppSection.CREATE_PROPOSAL) {
      setShowSafeManagement(true)
      }
      showSuccess('Disconnected from Safe')
    }

    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🧩 Safe Multisig Manager
            </h1>
            <p className="text-gray-600">
              Safe multisig wallet creation and management
            </p>
          </div>

          {/* Section navigation */}
          {network && userAddress && (
            <div className="mb-8 flex justify-center">
              <div className="bg-white rounded-lg shadow p-1 flex">
                <button
                  onClick={() => setCurrentSection(AppSection.PROPOSALS)}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${currentSection === AppSection.PROPOSALS
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  📋 My Proposals
                </button>
                <button
                  onClick={() => setCurrentSection(AppSection.CREATE_PROPOSAL)}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${currentSection === AppSection.CREATE_PROPOSAL
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  🚀 Create Proposal
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
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

          {/* MAIN SECTION */}
          {currentSection === AppSection.CREATE_PROPOSAL && (
            <>
              {/* Connection status */}
              <div className="mb-8 p-6 bg-white rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4">Connection</h2>

                {connectionStatus.state !== WalletState.Connected ? (
                  <div className="space-y-4">
                    <button
                      onClick={handleConnectWallet}
                      disabled={connectionStatus.isLoading}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {connectionStatus.isLoading ? 'Connecting...' : 'Connect Wallet'}
                    </button>

                    {/* Show connection status */}
                    {connectionStatus.state !== WalletState.Disconnected && (
                      <div className="text-sm text-gray-600">
                        Status: {connectionStatus.state}
                        {connectionStatus.error && (
                          <div className="text-red-600 mt-1">{connectionStatus.error}</div>
                        )}
                      </div>
                    )}

                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Supported Networks:</h3>
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
                ) : (
                  <div className="space-y-4">
                    <p>Connected wallet: {formatAddress(userAddress)}</p>

                  </div>
                )}
              </div>


              {/* Safe Information */}
              {network && safeInfo && (
                <div className="mb-8 p-6 bg-white rounded-lg shadow">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Safe Information</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setCurrentSection(AppSection.CREATE_PROPOSAL)
                          setShowSafeManagement(true)
                        }}
                        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                      >
                        🔄 Reconnect
                      </button>
                      <button
                        onClick={handleDisconnectFromSafe}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                      >
                        🔄 Disconnect Safe
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p><strong>Address:</strong> <span className="font-mono text-sm">{safeInfo.address}</span></p>
                      <p><strong>Threshold:</strong> {safeInfo.threshold} of {safeInfo.owners.length}</p>
                    </div>
                    <div>
                      <p><strong>Balance:</strong> {safeInfo.balance} ETH</p>
                      <p><strong>Nonce:</strong> {safeInfo.nonce}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <strong>Owners:</strong>
                    <ul className="mt-2 space-y-1">
                      {safeInfo.owners.map((owner, index) => (
                        <li key={index} className="text-sm font-mono">
                          {formatAddress(owner)}
                          {owner.toLowerCase() === userAddress.toLowerCase() && (
                            <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                              You
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>
              )}

              {/* Safe Management */}
              {network && currentSection === AppSection.CREATE_PROPOSAL && (!safeInfo || showSafeManagement) && (
                <SafeManagement
                  onCreate={handleCreateSafeWithForm}
                  onPredict={handlePredictSafeAddress}
                  loading={loading.createSafe}
                  predicting={loading.predictAddress}
                  predictedAddress={predictedSafeAddress}
                  userAddress={userAddress}
                  className="mb-8"
                />
              )}

              {network && currentSection === AppSection.CREATE_PROPOSAL && safeInfo && (
                <div className="space-y-8">
                  {/* Universal transactions */}
                  <div className="p-6 bg-white rounded-lg shadow">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">🎯 Universal Function Calls</h2>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setUseStructuredMode(true)}
                          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            useStructuredMode
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          📋 ABI Mode
                        </button>
                        <button
                          onClick={() => setUseStructuredMode(false)}
                          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            !useStructuredMode
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          ✏️ Manual Input
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 mb-6">
                      {useStructuredMode 
                        ? 'Select contract from list and function from ABI for safe transaction creation.'
                        : 'Create hash for any smart contract function call. Specify contract address, function signature and parameters.'
                      }
                    </p>

                    {useStructuredMode ? (
                      /* New UI with Dropdown */
                      <div className="space-y-6">
                        {/* Dropdown for contract selection */}
                        <ContractDropdown
                          onContractSelect={setSelectedContract}
                          selectedContract={selectedContract}
                          isLoading={contractsLoading}
                          error={contractsError}
                        />

                        {/* Dropdown for function selection */}
                        <FunctionDropdown
                          contractAddress={selectedContract?.address || null}
                          onFunctionSelect={setSelectedFunction}
                          selectedFunction={selectedFunction}
                        />

                        {/* Contract information */}
                        {selectedContract && safeOnChain && (
                          <ContractInfo 
                            contractAddress={selectedContract.address}
                            safeOnChain={safeOnChain}
                          />
                        )}

                        {/* Function parameters */}
                        {selectedFunction && (
                          <ParameterForm
                            selectedFunction={selectedFunction}
                            onFormChange={setStructuredFormData}
                            formData={structuredFormData}
                          />
                        )}

                        {/* Hash creation button */}
                        {selectedContract && selectedFunction && (
                          <div className="pt-6 border-t border-gray-200">
                            <button
                              onClick={handleCreateStructuredHash}
                              disabled={loading.universalHash}
                              className={`w-full px-6 py-3 rounded-lg font-medium transition-colors ${
                                loading.universalHash
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                            >
                              {loading.universalHash ? (
                                <span className="flex items-center justify-center">
                                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Creating hash...
                                </span>
                              ) : (
                                '🔐 Create Transaction Hash'
                              )}
                            </button>
                          </div>
                        )}

                        {/* Result for ABI mode */}
                        {universalResult && (
                          <div className="mt-6 p-4 bg-green-50 rounded-lg">
                            <h3 className="font-semibold text-green-900 mb-4">✅ Transaction hash created!</h3>

                            <div className="space-y-3 text-sm">
                              <div>
                                <label className="font-medium text-gray-700">Hash for signing:</label>
                                <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                                  {universalResult.transactionHash}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="font-medium text-gray-700">Contract:</label>
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

                              <div className="flex gap-3 pt-4">
                                <button
                                  onClick={handleSignTransactionHash}
                                  disabled={loading.signature}
                                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                                    loading.signature
                                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                      : 'bg-purple-600 text-white hover:bg-purple-700'
                                  }`}
                                >
                                  {loading.signature ? '🔄 Signing...' : '🖋️ Sign Transaction'}
                                </button>

                                <button
                                  onClick={() => copyToClipboard(universalResult.transactionHash, 'Transaction Hash')}
                                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                >
                                  📋 Copy Hash
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <p className="text-blue-800 text-sm">
                                💡 <strong>Next steps:</strong> Click "Sign Transaction" for automatic signing through your wallet, or copy hash for manual signing.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Old manual UI */
                      <div className="space-y-6">
                    {/* Main form */}
                    <div className="space-y-6 mb-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Contract Address *
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
                            ETH Value (optional)
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
                          Function Signature *
                          <span className="text-xs text-gray-500 ml-2">
                            (e.g.: mint(address,uint256) or transfer(address,uint256))
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
                            Function Parameters
                            <span className="text-xs text-gray-500 ml-2">
                              (in the same order as in signature)
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={addFunctionParam}
                            className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-200 transition-colors"
                          >
                            + Add Parameter
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
                                  placeholder={`Parameter ${index + 1} (e.g.: 0x123... or 100)`}
                                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                />
                              </div>
                              {universalForm.functionParams.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeFunctionParam(index)}
                                  className="px-3 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                                  title="Remove parameter"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                          <p className="font-medium mb-2">Parameter examples:</p>
                          <ul className="space-y-1 text-xs">
                            <li><strong>address:</strong> 0x1234567890123456789012345678901234567890</li>
                            <li><strong>uint256:</strong> 1000 (or 100.5 for tokens with decimals)</li>
                            <li><strong>string:</strong> Hello World</li>
                            <li><strong>bool:</strong> true or false</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-4">
                      <button
                        onClick={handleCreateUniversalHash}
                        disabled={loading.universalHash || !safeInfo}
                        className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                      >
                        {loading.universalHash ? 'Creating...' : '🎯 Create Transaction Hash'}
                      </button>

                      <button
                        onClick={resetUniversalForm}
                        className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                      >
                        Reset Form
                      </button>
                    </div>

                    {/* Result */}
                    {universalResult && (
                      <div className="mt-6 p-4 bg-green-50 rounded-lg">
                        <h3 className="font-semibold text-green-900 mb-4">✅ Transaction hash created!</h3>

                        <div className="space-y-3 text-sm">
                          <div>
                            <label className="font-medium text-gray-700">Hash for signing:</label>
                            <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                              {universalResult.transactionHash}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="font-medium text-gray-700">Contract:</label>
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

                          {/* Signing button */}
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              onClick={handleSignTransactionHash}
                              disabled={loading.signHash || signatureResult !== null}
                              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                            >
                              {loading.signHash ? 'Signing...' : '🖋️ Sign Transaction (EIP-712)'}
                            </button>

                            <button
                              onClick={() => copyToClipboard(universalResult.transactionHash, 'Transaction Hash')}
                              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                              📋 Copy Hash
                            </button>
                          </div>

                          <div className="mt-4 p-3 bg-blue-50 border-l-4 border-blue-400">
                            <p className="text-blue-800 text-sm">
                              💡 <strong>Next steps:</strong> Click "Sign Transaction" for automatic signing through your wallet, or copy hash for manual signing.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Signature result */}
                    {signatureResult && (
                      <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                        <h3 className="font-semibold text-purple-900 mb-4">🖋️ Transaction signed!</h3>

                        <div className="space-y-3 text-sm">
                          <div>
                            <label className="font-medium text-gray-700">Signature (EIP-712):</label>
                            <div className="mt-1 p-2 bg-white border rounded font-mono text-xs break-all">
                              {signatureResult.signature}
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => copyToClipboard(signatureResult.signature, 'Signature')}
                                className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200"
                              >
                                📋 Copy Signature
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
                              ✅ <strong>Success!</strong> Transaction signed and sent to STS. Check "User Proposals" section for confirmation.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* PROPOSAL MANAGEMENT SECTION */}
          {currentSection === AppSection.PROPOSALS && (
            <ProposalsPage
              network={network}
              userAddress={userAddress}
              safeOnChain={safeOnChain}
              safeOffChain={safeOffChain}
              safeInfo={safeInfo}
              setSafeInfo={setSafeInfo}
              showError={showError}
              showSuccess={showSuccess}
              onNavigateToSafeCreation={handleNavigateToSafeCreation}
            />
          )}

        </div>
      </div>
    )
  }

  export default SafeMultisigApp
