/**
 * Компонент для ввода параметров функции контракта
 */

import React, { useState, useEffect } from 'react'
import { ParsedFunction, FunctionFormData, ABIInput } from '../lib/contract-types'

interface ParameterFormProps {
  selectedFunction: ParsedFunction | null
  onFormChange: (data: FunctionFormData) => void
  formData: FunctionFormData
}

export const ParameterForm: React.FC<ParameterFormProps> = ({
  selectedFunction,
  onFormChange,
  formData
}) => {
  useEffect(() => {
    if (selectedFunction) {
      // Инициализируем пустые значения для новой функции
      const initialParameters: { [key: string]: any } = {}
      selectedFunction.inputs.forEach((input, index) => {
        const fieldName = input.name || `param${index}`
        initialParameters[fieldName] = ''
      })
      
      onFormChange({
        parameters: initialParameters,
        ethValue: formData.ethValue || '0'
      })
    }
  }, [selectedFunction])

  const handleParameterChange = (paramName: string, value: string) => {
    onFormChange({
      ...formData,
      parameters: {
        ...formData.parameters,
        [paramName]: value
      }
    })
  }

  const handleEthValueChange = (value: string) => {
    onFormChange({
      ...formData,
      ethValue: value
    })
  }

  const renderInput = (input: ABIInput, index: number) => {
    const fieldName = input.name || `param${index}`
    const value = formData.parameters[fieldName] || ''

    return (
      <div key={index} className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {input.name || `Parameter ${index + 1}`}
          <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {input.type}
          </span>
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => handleParameterChange(fieldName, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          placeholder={`Введите ${input.type}`}
        />
      </div>
    )
  }

  if (!selectedFunction) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
        Сначала выберите функцию
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">📝 Параметры функции</h3>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {selectedFunction.name}
        </span>
      </div>

      {selectedFunction.inputs.length === 0 ? (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center text-blue-700">
          Эта функция не требует параметров
        </div>
      ) : (
        <div className="space-y-4">
          {selectedFunction.inputs.map(renderInput)}
        </div>
      )}

      {selectedFunction.payable && (
        <div className="space-y-2 p-4 bg-green-50 border border-green-200 rounded-lg">
          <label className="block text-sm font-medium text-green-800">
            💰 ETH Value (опционально)
          </label>
          <input
            type="text"
            value={formData.ethValue}
            onChange={(e) => handleEthValueChange(e.target.value)}
            className="w-full px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="0.0"
          />
          <p className="text-xs text-green-600">
            Количество ETH для отправки с транзакцией
          </p>
        </div>
      )}
    </div>
  )
}