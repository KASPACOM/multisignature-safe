/**
 * Dropdown for selecting function from selected contract
 */

import React, { useState, useEffect } from 'react'
import { ParsedFunction } from '../lib/contract-types'
import { contractRegistry } from '../lib/contract-registry'

interface FunctionDropdownProps {
  contractAddress: string | null
  onFunctionSelect: (func: ParsedFunction | null) => void
  selectedFunction: ParsedFunction | null
  placeholder?: string
  showOnlyPayable?: boolean
}

export const FunctionDropdown: React.FC<FunctionDropdownProps> = ({
  contractAddress,
  onFunctionSelect,
  selectedFunction,
  placeholder = "Select function...",
  showOnlyPayable = false
}) => {
  const [functions, setFunctions] = useState<ParsedFunction[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (contractAddress) {
      let contractFunctions = contractRegistry.getContractFunctions(contractAddress)
      
      // IMPORTANT: For Safe proposals we only need state-changing functions (not view/pure)
      // View/Pure functions do not require multisig signatures
      contractFunctions = contractFunctions.filter(f => 
        f.stateMutability !== 'view' && f.stateMutability !== 'pure'
      )
      
      // Additionally filter only payable functions if needed
      if (showOnlyPayable) {
        contractFunctions = contractFunctions.filter(f => f.payable)
      }
      
      setFunctions(contractFunctions)
      console.log(`📋 State-changing functions loaded for Safe proposal:`, contractFunctions.length)
      console.log(`   - Total functions in ABI: ${contractRegistry.getContractFunctions(contractAddress).length}`)
      console.log(`   - State-changing: ${contractFunctions.length}`)
    } else {
      setFunctions([])
    }
    
    // Reset selected function when contract changes
    onFunctionSelect(null)
  }, [contractAddress, showOnlyPayable, onFunctionSelect])

  const handleFunctionSelect = (func: ParsedFunction) => {
    onFunctionSelect(func)
    setIsOpen(false)
    console.log('✅ Function selected:', func.name)
  }

  const clearSelection = () => {
    onFunctionSelect(null)
    setIsOpen(false)
  }

  if (!contractAddress) {
    return (
      <div className="relative opacity-50">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          ⚙️ Select Function
        </label>
        <div className="relative w-full bg-gray-100 border border-gray-300 rounded-lg shadow-sm pl-3 pr-10 py-3 text-gray-500 cursor-not-allowed">
          <span className="block truncate">First select a contract</span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        ⚙️ Select Function
        {showOnlyPayable && (
          <span className="ml-2 text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
            only payable
          </span>
        )}
      </label>
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={functions.length === 0}
          className={`relative w-full border border-gray-300 rounded-lg shadow-sm pl-3 pr-10 py-3 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 sm:text-sm ${
            functions.length === 0 
              ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
              : 'bg-white hover:bg-gray-50'
          }`}
        >
          <span className="block truncate">
            {selectedFunction ? (
              <div className="flex items-center">
                <span className="font-medium">{selectedFunction.name}</span>
                {selectedFunction.payable && (
                  <span className="ml-2 text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                    💰 payable
                  </span>
                )}
                <span className="ml-2 text-xs text-gray-500">
                  ({selectedFunction.inputs.length} parameters)
                </span>
              </div>
            ) : functions.length === 0 ? (
              <span className="text-gray-500">No available functions</span>
            ) : (
              <span className="text-gray-500">{placeholder}</span>
            )}
          </span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </span>
        </button>

        {isOpen && functions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-80 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
            {selectedFunction && (
              <div
                onClick={clearSelection}
                className="cursor-pointer select-none relative py-2 pl-3 pr-9 text-gray-500 hover:bg-gray-50 border-b border-gray-100"
              >
                <span className="block truncate text-sm">Clear selection</span>
              </div>
            )}
            
            {functions.map((func) => (
              <div
                key={func.signature}
                onClick={() => handleFunctionSelect(func)}
                className={`cursor-pointer select-none relative py-3 pl-3 pr-9 hover:bg-purple-50 ${
                  selectedFunction?.signature === func.signature ? 'bg-purple-100' : ''
                }`}
              >
                <div className="flex items-center mb-1">
                  <span className="font-medium text-gray-900">{func.name}</span>
                  {func.payable && (
                    <span className="ml-2 text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                      💰 payable
                    </span>
                  )}
                  <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {func.stateMutability}
                  </span>
                </div>
                
                
                <p className="text-xs text-gray-400 font-mono bg-gray-50 p-1 rounded">
                  {func.signature}
                </p>
                
                {func.inputs.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-600 mb-1">
                      Parameters ({func.inputs.length}):
                    </p>
                    <div className="space-y-1">
                      {func.inputs.slice(0, 3).map((input, index) => (
                        <div key={index} className="text-xs text-gray-500 flex">
                          <span className="font-mono bg-gray-100 px-1 rounded mr-2 min-w-0">
                            {input.type}
                          </span>
                          <span className="truncate">{input.name || `param${index}`}</span>
                        </div>
                      ))}
                      {func.inputs.length > 3 && (
                        <div className="text-xs text-gray-400">
                          ... and {func.inputs.length - 3} more parameters
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {selectedFunction?.signature === func.signature && (
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-purple-600">
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {functions.length > 0 && (
        <div className="mt-2 text-xs text-gray-600">
          <span>Available functions: </span>
          <span className="font-medium">{functions.length}</span>
          {showOnlyPayable && (
            <span className="text-green-600"> (only payable)</span>
          )}
        </div>
      )}
    </div>
  )
}
