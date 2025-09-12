import React, { useState, useEffect } from 'react'
import SafeConnectionForm from './SafeConnectionForm'
import SafeCreationForm from './SafeCreationForm'
import { SafeConnectionForm as SafeConnectionFormData, SafeCreationForm as SafeCreationFormData } from '../lib/onchain'

interface SafeManagementProps {
  onConnect?: (formData: SafeConnectionFormData) => void
  onCreate: (formData: SafeCreationFormData) => void
  onPredict?: (formData: SafeCreationFormData) => void
  loading?: boolean
  predicting?: boolean
  predictedAddress?: string
  userAddress?: string
  className?: string
}

type TabType = 'create' | 'connect'

const SafeManagement: React.FC<SafeManagementProps> = ({
  onConnect,
  onCreate,
  onPredict,
  loading = false,
  predicting = false,
  predictedAddress,
  userAddress,
  className = ""
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('create')

  // Переключаемся на вкладку создания, если находимся на вкладке подключения, но onConnect не предоставлен
  useEffect(() => {
    if (activeTab === 'connect' && !onConnect) {
      setActiveTab('create')
    }
  }, [activeTab, onConnect])

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Заголовок и переключатель табов */}
      <div className="border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            🏦 Управление Safe
          </h1>
          <p className="text-gray-600 text-sm">
            {onConnect ? 
              'Создайте новый Safe мультисиг кошелек или подключитесь к существующему' :
              'Создайте новый Safe мультисиг кошелек'
            }
          </p>
        </div>
        
        {/* Табы */}
        <div className="px-6">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'create'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              🚀 Создать Safe
            </button>
            
            {onConnect && (
              <button
                onClick={() => setActiveTab('connect')}
                className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'connect'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                🔌 Подключиться к Safe
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Содержимое табов */}
      <div className="p-0">
        {activeTab === 'create' && (
          <SafeCreationForm
            onCreate={onCreate}
            onPredict={onPredict}
            loading={loading}
            predicting={predicting}
            predictedAddress={predictedAddress}
            userAddress={userAddress}
            className="border-0 shadow-none"
          />
        )}
        
        {activeTab === 'connect' && onConnect && (
          <SafeConnectionForm
            onConnect={onConnect}
            loading={loading}
            className="border-0 shadow-none"
          />
        )}
      </div>

      {/* Дополнительная информация */}
      <div className="border-t border-gray-200 px-6 py-4">
        <div className={`grid grid-cols-1 ${onConnect ? 'md:grid-cols-2' : ''} gap-4`}>
          <div className="p-3 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">🚀 Создание нового Safe</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Полный контроль над параметрами</li>
              <li>• Выбор владельцев и порога подписей</li>
              <li>• Потребуется оплата газа за развертывание</li>
              <li>• Предсказуемый адрес до создания</li>
            </ul>
          </div>
          
          {onConnect && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <h3 className="font-medium text-purple-900 mb-2">🔌 Подключение к существующему</h3>
              <ul className="text-sm text-purple-800 space-y-1">
                <li>• Подключение к уже развернутому Safe</li>
                <li>• Требуются точные параметры Safe</li>
                <li>• Не требует оплаты газа</li>
                <li>• Проверка соответствия параметров</li>
              </ul>
            </div>
          )}
        </div>
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm">
            <strong>💡 Совет:</strong> {onConnect ? 
              'Если у вас уже есть Safe, используйте "Подключение". Если нужен новый мультисиг кошелек, выберите "Создать Safe".' :
              'Создайте новый Safe мультисиг кошелек для управления цифровыми активами с несколькими подписями.'
            }
          </p>
        </div>
      </div>
    </div>
  )
}

export default SafeManagement
