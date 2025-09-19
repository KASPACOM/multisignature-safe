/**
 * Типы для работы с контрактами и их ABI
 */

// Базовые типы для ABI
export interface ABIInput {
  name: string
  type: string
}

// Обработанная функция для UI
export interface ParsedFunction {
  name: string
  signature: string
  inputs: ABIInput[]
  payable: boolean
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable'
}

// Конфигурация контракта
export interface ContractABI {
  name: string
  address: string
  abi: any[]
  parsedFunctions: ParsedFunction[]
}


// Данные формы функции
export interface FunctionFormData {
  parameters: { [key: string]: any }
  ethValue: string
}
