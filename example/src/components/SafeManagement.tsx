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
  prefilledData?: {
    address: string
    owners: string[]
    threshold: number
  } | null
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
  className = "",
  prefilledData
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('create')

  // Switch to create tab if we're on connect tab but onConnect is not provided
  useEffect(() => {
    if (activeTab === 'connect' && !onConnect) {
      setActiveTab('create')
    }
  }, [activeTab, onConnect])

  // Automatically switch to connect tab if prefilled data is available
  useEffect(() => {
    if (prefilledData && onConnect) {
      setActiveTab('connect')
    }
  }, [prefilledData, onConnect])

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header and tab switcher */}
      <div className="border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            🏦 Safe Management
          </h1>
          <p className="text-gray-600 text-sm">
            {onConnect ? 
              'Create a new Safe multisig wallet or connect to an existing one' :
              'Create a new Safe multisig wallet'
            }
          </p>
        </div>
        
        {/* Tabs */}
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
              🚀 Create Safe
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
                🔌 Connect to Safe
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab content */}
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
            prefilledData={prefilledData}
          />
        )}
      </div>

      {/* Additional information */}
      <div className="border-t border-gray-200 px-6 py-4">
        <div className={`grid grid-cols-1 ${onConnect ? 'md:grid-cols-2' : ''} gap-4`}>
          <div className="p-3 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">🚀 Creating New Safe</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Full control over parameters</li>
              <li>• Choose owners and signature threshold</li>
              <li>• Requires gas payment for deployment</li>
              <li>• Predictable address before creation</li>
            </ul>
          </div>
          
          {onConnect && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <h3 className="font-medium text-purple-900 mb-2">🔌 Connect to Existing</h3>
              <ul className="text-sm text-purple-800 space-y-1">
                <li>• Connect to already deployed Safe</li>
                <li>• Requires exact Safe parameters</li>
                <li>• No gas payment required</li>
                <li>• Parameter compliance verification</li>
              </ul>
            </div>
          )}
        </div>
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm">
            <strong>💡 Tip:</strong> {onConnect ? 
              'If you already have a Safe, use "Connect". If you need a new multisig wallet, choose "Create Safe".' :
              'Create a new Safe multisig wallet to manage digital assets with multiple signatures.'
            }
          </p>
        </div>
      </div>
    </div>
  )
}

export default SafeManagement
