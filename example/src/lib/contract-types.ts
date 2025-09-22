/**
 * Types for working with contracts and their ABI
 */

// Basic types for ABI
export interface ABIInput {
  name: string
  type: string
}

// Processed function for UI
export interface ParsedFunction {
  name: string
  signature: string
  inputs: ABIInput[]
  payable: boolean
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable'
}

// Contract configuration
export interface ContractABI {
  name: string
  address: string
  abi: any[]
  parsedFunctions: ParsedFunction[]
}


// Data for function form
export interface FunctionFormData {
  parameters: { [key: string]: any }
  ethValue: string
}
