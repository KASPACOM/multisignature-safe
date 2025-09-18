/**
 * Парсер ABI для извлечения функций контрактов
 */

import { ParsedFunction } from './contract-types'

export class ABIParser {
  /**
   * Извлекает функции из ABI
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
   * Создает сигнатуру функции
   */
  static createSignature(func: any): string {
    const params = func.inputs?.map((input: any) => input.type).join(',') || ''
    return `${func.name}(${params})`
  }
}