/**
 * Universal component for displaying contract information using TypeChain
 */

import React, { useState, useEffect } from 'react'
import SafeOnChain from '../lib/onchain'
import { ParsedFunction } from '../lib/contract-types'

interface ContractInfoProps {
  contractAddress: string
  safeOnChain: SafeOnChain | null
}

interface ContractData {
  address: string
  functions: ParsedFunction[]
}

export const ContractInfo: React.FC<ContractInfoProps> = ({ contractAddress, safeOnChain }) => {
  const [contractData, setContractData] = useState<ContractData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (contractAddress && safeOnChain) {
      loadContractInfo()
    }
  }, [contractAddress, safeOnChain])

  const loadContractInfo = async () => {
    if (!safeOnChain) return

    setLoading(true)
    setError('')

    try {
      console.log('🔍 Loading contract information:', contractAddress)
      
      const info = safeOnChain.getContractInfo(contractAddress)
      if (info) {
        setContractData(info)
        console.log('✅ Contract information loaded:', info)
      } else {
        setError('Contract not found in registry')
      }
    } catch (err: any) {
      console.error('❌ Contract information loading error:', err)
      setError(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center space-x-2">
          <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-blue-800 text-sm">Loading contract information...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center space-x-2">
          <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-red-800 text-sm">{error}</span>
        </div>
        <button
          onClick={loadContractInfo}
          className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!contractData) {
    return null
  }

  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-center space-x-2 mb-3">
        <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h4 className="text-gray-800 font-medium">📋 Contract Connected</h4>
      </div>
      
      <div className="text-sm text-gray-600">
        <span className="font-mono bg-white px-2 py-1 rounded border text-xs">
          {contractData.address}
        </span>
      </div>

      <div className="mt-3 text-sm text-gray-600">
        Functions available for Safe proposals: 
        <span className="font-medium text-gray-900 ml-1">
          {contractData.functions.filter(f => f.stateMutability !== 'view' && f.stateMutability !== 'pure').length}
        </span>
      </div>
    </div>
  )
}
