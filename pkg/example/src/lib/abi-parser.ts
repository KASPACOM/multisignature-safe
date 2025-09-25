/**
 * ABI parser for extracting functions of contracts
 */

import { ParsedFunction } from './contract-types'

export class ABIParser {
  /**
   * Extracts functions from ABI
   */
  static parseFunctions(abi: any[]): ParsedFunction[] {
    return abi
      .filter(item => item.type === 'function')
      .map(func => ({
        name: func.name,
        signature: this.createSignature(func),
        inputs: func.inputs || [],
        payable: func.stateMutability === 'payable',
        stateMutability: func.stateMutability
      }))
  }

  /**
   * Creates function signature
   */
  static createSignature(func: any): string {
    const params = func.inputs?.map((input: any) => input.type).join(',') || ''
    return `${func.name}(${params})`
  }
}