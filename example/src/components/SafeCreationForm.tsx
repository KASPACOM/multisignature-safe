import React, { useState } from 'react'
import { SafeCreationForm as SafeCreationFormData, createSafeCreationForm } from '../lib/onchain'

interface SafeCreationFormProps {
  onCreate: (formData: SafeCreationFormData) => void
  onPredict?: (formData: SafeCreationFormData) => void
  onCancel?: () => void
  loading?: boolean
  predicting?: boolean
  predictedAddress?: string
  title?: string
  className?: string
  userAddress?: string
}

const SafeCreationForm: React.FC<SafeCreationFormProps> = ({
  onCreate,
  onPredict,
  onCancel,
  loading = false,
  predicting = false,
  predictedAddress,
  title = "Создание Safe",
  className = "",
  userAddress
}) => {
  const [formData, setFormData] = useState<SafeCreationFormData>({
    owners: [userAddress || ''],
    threshold: 1,
    safeVersion: '1.4.1',
    fallbackHandler: ''
  })

  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  // Валидация формы
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    // Проверка владельцев
    const validOwners = formData.owners.filter(owner => owner.trim())
    if (validOwners.length === 0) {
      newErrors.owners = 'Добавьте хотя бы одного владельца'
    } else {
      const invalidOwners = validOwners.filter(owner => !owner.match(/^0x[a-fA-F0-9]{40}$/))
      if (invalidOwners.length > 0) {
        newErrors.owners = 'Некорректный формат адреса владельца'
      }

      // Проверка на дубликаты
      const uniqueOwners = new Set(validOwners.map(o => o.toLowerCase()))
      if (uniqueOwners.size !== validOwners.length) {
        newErrors.owners = 'Адреса владельцев должны быть уникальными'
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

  // Обработка отправки формы для создания
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    const finalFormData = createSafeCreationForm(
      formData.owners.filter(owner => owner.trim()),
      formData.threshold,
      {
        safeVersion: formData.safeVersion || '1.4.1',
        fallbackHandler: formData.fallbackHandler?.trim() || undefined
      }
    )

    onCreate(finalFormData)
  }

  // Обработка предсказания адреса
  const handlePredict = () => {
    if (!validateForm() || !onPredict) {
      return
    }

    const finalFormData = createSafeCreationForm(
      formData.owners.filter(owner => owner.trim()),
      formData.threshold,
      {
        safeVersion: formData.safeVersion || '1.4.1',
        fallbackHandler: formData.fallbackHandler?.trim() || undefined
      }
    )

    onPredict(finalFormData)
  }

  // Обновление поля формы
  const updateField = (field: keyof SafeCreationFormData, value: any) => {
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

  // Добавление текущего пользователя как владельца
  const addCurrentUser = () => {
    if (userAddress && !formData.owners.includes(userAddress)) {
      setFormData(prev => ({
        ...prev,
        owners: [...prev.owners.filter(o => o.trim()), userAddress]
      }))
    }
  }

  return (
    <div className={`p-6 bg-white rounded-lg shadow ${className}`}>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          🚀 {title}
        </h2>
        <p className="text-gray-600 text-sm">
          Создайте новый Safe мультисиг кошелек. Укажите владельцев и минимальное количество подписей для выполнения транзакций.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Владельцы */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Владельцы Safe *
            </label>
            <div className="flex gap-2">
              {userAddress && !formData.owners.includes(userAddress) && (
                <button
                  type="button"
                  onClick={addCurrentUser}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors"
                >
                  + Добавить себя
                </button>
              )}
              <button
                type="button"
                onClick={addOwner}
                className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-200 transition-colors"
              >
                + Добавить владельца
              </button>
            </div>
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
                {owner === userAddress && (
                  <div className="flex items-center px-3 py-2 bg-green-100 text-green-800 text-sm rounded-lg">
                    Вы
                  </div>
                )}
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
          
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-sm">
              💡 <strong>Важно:</strong> Добавьте все адреса, которые должны иметь доступ к управлению Safe. 
              Эти адреса нельзя будет изменить без consensus всех текущих владельцев.
            </p>
          </div>
        </div>

        {/* Порог подписей */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Порог подписей *
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="1"
              max={formData.owners.filter(o => o.trim()).length || 1}
              value={formData.threshold}
              onChange={(e) => updateField('threshold', parseInt(e.target.value) || 1)}
              className={`w-32 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.threshold ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            <span className="text-sm text-gray-600">
              из {formData.owners.filter(o => o.trim()).length} владельцев
            </span>
          </div>
          {errors.threshold && (
            <p className="mt-1 text-sm text-red-600">{errors.threshold}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            Минимальное количество подписей, необходимых для выполнения любой транзакции
          </p>

          {/* Рекомендации по threshold */}
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm mb-2">
              <strong>Рекомендации по выбору порога:</strong>
            </p>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• <strong>1 из 1:</strong> Базовая безопасность, удобно для личного использования</li>
              <li>• <strong>2 из 3:</strong> Хорошая безопасность с резервированием</li>
              <li>• <strong>3 из 5:</strong> Высокая безопасность для команды или организации</li>
              <li>• <strong>Более 50%:</strong> Защита от компрометации меньшинства владельцев</li>
            </ul>
          </div>
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
              <p className="mt-1 text-sm text-gray-500">
                Используйте последнюю версию для лучшей безопасности
              </p>
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
                Оставьте пустым для использования стандартного обработчика
              </p>
            </div>
          </div>
        </div>

        {/* Предсказанный адрес */}
        {predictedAddress && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-medium text-green-900 mb-2">🔮 Предсказанный адрес Safe:</h4>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-white border rounded text-sm font-mono">
                {predictedAddress}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(predictedAddress)}
                className="px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                title="Скопировать адрес"
              >
                📋
              </button>
            </div>
            <p className="mt-2 text-sm text-green-800">
              Safe будет развернут по этому адресу после создания
            </p>
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-4 pt-6 border-t">
          {onPredict && (
            <button
              type="button"
              onClick={handlePredict}
              disabled={loading || predicting}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {predicting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Предсказание...
                </div>
              ) : (
                '🔮 Предсказать адрес'
              )}
            </button>
          )}
          
          <button
            type="submit"
            disabled={loading || predicting}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Создание...
              </div>
            ) : (
              '🚀 Создать Safe'
            )}
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading || predicting}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Отмена
            </button>
          )}
        </div>
      </form>

      {/* Информация о газе */}
      <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <h4 className="font-medium text-orange-900 mb-2">⛽ Информация о комиссии</h4>
        <ul className="text-sm text-orange-800 space-y-1">
          <li>• Создание Safe потребует оплаты газа для развертывания контракта</li>
          <li>• Стоимость зависит от загрузки сети и цены газа</li>
          <li>• Убедитесь, что у вас достаточно ETH на балансе для оплаты</li>
          <li>• После создания Safe адрес нельзя изменить</li>
        </ul>
      </div>
    </div>
  )
}

export default SafeCreationForm
