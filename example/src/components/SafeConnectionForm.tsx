import React, { useState, useEffect } from 'react'
import { SafeConnectionForm as SafeConnectionFormData, createSafeConnectionForm } from '../lib/onchain'

interface SafeConnectionFormProps {
  onConnect: (formData: SafeConnectionFormData) => void
  onCancel?: () => void
  loading?: boolean
  title?: string
  className?: string
  prefilledData?: {
    address: string
    owners: string[]
    threshold: number
  } | null
}

const SafeConnectionForm: React.FC<SafeConnectionFormProps> = ({
  onConnect,
  onCancel,
  loading = false,
  title = "Подключение к Safe",
  className = "",
  prefilledData
}) => {
  const [formData, setFormData] = useState<SafeConnectionFormData>({
    safeAddress: '',
    owners: [''],
    threshold: 1,
    safeVersion: '1.4.1',
    fallbackHandler: ''
  })

  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  // Предзаполнение формы данными из навигации
  useEffect(() => {
    if (prefilledData) {
      console.log('🔄 Предзаполняем форму подключения к Safe:', prefilledData)
      setFormData({
        safeAddress: prefilledData.address,
        owners: prefilledData.owners,
        threshold: prefilledData.threshold,
        safeVersion: '1.4.1',
        fallbackHandler: ''
      })
    }
  }, [prefilledData])

  // Валидация формы
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    // Проверка адреса Safe
    if (!formData.safeAddress.trim()) {
      newErrors.safeAddress = 'Введите адрес Safe'
    } else if (!formData.safeAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      newErrors.safeAddress = 'Неверный формат адреса Ethereum'
    }

    // Проверка владельцев
    const validOwners = formData.owners.filter(owner => owner.trim())
    if (validOwners.length === 0) {
      newErrors.owners = 'Добавьте хотя бы одного владельца'
    } else {
      const invalidOwners = validOwners.filter(owner => !owner.match(/^0x[a-fA-F0-9]{40}$/))
      if (invalidOwners.length > 0) {
        newErrors.owners = 'Некорректный формат адреса владельца'
      }
    }

    // Проверка threshold
    if (formData.threshold < 1) {
      newErrors.threshold = 'Порог должен быть больше 0'
    } else if (formData.threshold > validOwners.length) {
      newErrors.threshold = 'Порог не может быть больше количества владельцев'
    }

    // Проверка fallbackHandler (если указан)
    if (formData.fallbackHandler && formData.fallbackHandler.trim() && 
        !formData.fallbackHandler.match(/^0x[a-fA-F0-9]{40}$/)) {
      newErrors.fallbackHandler = 'Неверный формат адреса fallback handler'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Обработка отправки формы
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    // Очищаем пустые владельцы и создаем финальную форму
    const finalFormData = createSafeConnectionForm(
      formData.safeAddress.trim(),
      formData.owners.filter(owner => owner.trim()),
      formData.threshold,
      {
        safeVersion: formData.safeVersion || '1.4.1',
        fallbackHandler: formData.fallbackHandler?.trim() || undefined
      }
    )

    onConnect(finalFormData)
  }

  // Обновление поля формы
  const updateField = (field: keyof SafeConnectionFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Очищаем ошибку для этого поля
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Добавление владельца
  const addOwner = () => {
    setFormData(prev => ({
      ...prev,
      owners: [...prev.owners, '']
    }))
  }

  // Удаление владельца
  const removeOwner = (index: number) => {
    setFormData(prev => ({
      ...prev,
      owners: prev.owners.filter((_, i) => i !== index)
    }))
  }

  // Обновление владельца
  const updateOwner = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      owners: prev.owners.map((owner, i) => i === index ? value : owner)
    }))
  }

  return (
    <div className={`p-6 bg-white rounded-lg shadow ${className}`}>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          🔌 {title}
        </h2>
        <p className="text-gray-600 text-sm">
          Укажите параметры Safe для подключения. Убедитесь, что все данные соответствуют реальному Safe.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Адрес Safe */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Адрес Safe *
          </label>
          <input
            type="text"
            value={formData.safeAddress}
            onChange={(e) => updateField('safeAddress', e.target.value)}
            placeholder="0x1234567890123456789012345678901234567890"
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.safeAddress ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.safeAddress && (
            <p className="mt-1 text-sm text-red-600">{errors.safeAddress}</p>
          )}
        </div>

        {/* Владельцы */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Владельцы Safe *
            </label>
            <button
              type="button"
              onClick={addOwner}
              className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-200 transition-colors"
            >
              + Добавить владельца
            </button>
          </div>
          
          <div className="space-y-2">
            {formData.owners.map((owner, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => updateOwner(index, e.target.value)}
                  placeholder={`Адрес владельца ${index + 1}`}
                  className={`flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.owners ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {formData.owners.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOwner(index)}
                    className="px-3 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    title="Удалить владельца"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {errors.owners && (
            <p className="mt-1 text-sm text-red-600">{errors.owners}</p>
          )}
        </div>

        {/* Порог подписей */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Порог подписей *
          </label>
          <input
            type="number"
            min="1"
            max={formData.owners.filter(o => o.trim()).length || 1}
            value={formData.threshold}
            onChange={(e) => updateField('threshold', e.target.value)}
            className={`w-32 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.threshold ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.threshold && (
            <p className="mt-1 text-sm text-red-600">{errors.threshold}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            Количество подписей, необходимых для выполнения транзакций
          </p>
        </div>

        {/* Дополнительные параметры */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Дополнительные параметры
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Версия Safe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Версия Safe
              </label>
              <select
                value={formData.safeVersion}
                onChange={(e) => updateField('safeVersion', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="1.4.1">1.4.1 (рекомендуется)</option>
                <option value="1.3.0">1.3.0</option>
                <option value="1.2.0">1.2.0</option>
                <option value="1.1.1">1.1.1</option>
              </select>
            </div>

            {/* Fallback Handler */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fallback Handler
              </label>
              <input
                type="text"
                value={formData.fallbackHandler || ''}
                onChange={(e) => updateField('fallbackHandler', e.target.value)}
                placeholder="0x... (необязательно)"
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.fallbackHandler ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.fallbackHandler && (
                <p className="mt-1 text-sm text-red-600">{errors.fallbackHandler}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Если не указан, будет использован стандартный
              </p>
            </div>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex gap-4 pt-6 border-t">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Подключение...
              </div>
            ) : (
              '🔌 Подключиться к Safe'
            )}
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Отмена
            </button>
          )}
        </div>
      </form>

      {/* Информация */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">💡 Важная информация</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Убедитесь, что адрес Safe корректен</li>
          <li>• Владельцы и порог должны соответствовать реальному Safe</li>
          <li>• Неправильные параметры могут привести к ошибкам при работе</li>
          <li>• После подключения вы сможете создавать и подписывать транзакции</li>
        </ul>
      </div>
    </div>
  )
}

export default SafeConnectionForm
