import React, { useState } from 'react'
import { SafeCreationForm as SafeCreationFormData, createSafeCreationForm } from '../lib/onchain'
import { DEFAULT_SAFE_VERSION } from '../lib/safe-common'

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
  title = "Create Safe",
  className = "",
  userAddress
}) => {
  const [formData, setFormData] = useState<SafeCreationFormData>({
    owners: [userAddress || ''],
    threshold: 1,
    safeVersion: DEFAULT_SAFE_VERSION,
    fallbackHandler: ''
  })

  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    // Check owners
    const validOwners = formData.owners.filter(owner => owner.trim())
    if (validOwners.length === 0) {
      newErrors.owners = 'Add at least one owner'
    } else {
      const invalidOwners = validOwners.filter(owner => !owner.match(/^0x[a-fA-F0-9]{40}$/))
      if (invalidOwners.length > 0) {
        newErrors.owners = 'Invalid owner address format'
      }

      // Check for duplicates
      const uniqueOwners = new Set(validOwners.map(o => o.toLowerCase()))
      if (uniqueOwners.size !== validOwners.length) {
        newErrors.owners = 'Owner addresses must be unique'
      }
    }

    // Check threshold
    if (formData.threshold < 1) {
      newErrors.threshold = 'Threshold must be greater than 0'
    } else if (formData.threshold > validOwners.length) {
      newErrors.threshold = 'Threshold cannot be greater than number of owners'
    }

    // Check fallbackHandler (if specified)
    if (formData.fallbackHandler && formData.fallbackHandler.trim() && 
        !formData.fallbackHandler.match(/^0x[a-fA-F0-9]{40}$/)) {
      newErrors.fallbackHandler = 'Invalid fallback handler address format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle form submission for creation
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    const finalFormData = createSafeCreationForm(
      formData.owners.filter(owner => owner.trim()),
      formData.threshold,
      {
        safeVersion: formData.safeVersion || DEFAULT_SAFE_VERSION,
        fallbackHandler: formData.fallbackHandler?.trim() || undefined
      }
    )

    onCreate(finalFormData)
  }

  // Handle address prediction
  const handlePredict = () => {
    if (!validateForm() || !onPredict) {
      return
    }

    const finalFormData = createSafeCreationForm(
      formData.owners.filter(owner => owner.trim()),
      formData.threshold,
      {
        safeVersion: formData.safeVersion || DEFAULT_SAFE_VERSION,
        fallbackHandler: formData.fallbackHandler?.trim() || undefined
      }
    )

    onPredict(finalFormData)
  }

  // Update form field
  const updateField = (field: keyof SafeCreationFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Add owner
  const addOwner = () => {
    setFormData(prev => ({
      ...prev,
      owners: [...prev.owners, '']
    }))
  }

  // Remove owner
  const removeOwner = (index: number) => {
    setFormData(prev => ({
      ...prev,
      owners: prev.owners.filter((_, i) => i !== index)
    }))
  }

  // Update owner
  const updateOwner = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      owners: prev.owners.map((owner, i) => i === index ? value : owner)
    }))
  }

  // Add current user as owner
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
          Create a new Safe multisig wallet. Specify owners and minimum number of signatures required to execute transactions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Owners */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Safe Owners *
            </label>
            <div className="flex gap-2">
              {userAddress && !formData.owners.includes(userAddress) && (
                <button
                  type="button"
                  onClick={addCurrentUser}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors"
                >
                  + Add Yourself
                </button>
              )}
              <button
                type="button"
                onClick={addOwner}
                className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-200 transition-colors"
              >
                + Add Owner
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
                  placeholder={`Owner address ${index + 1}`}
                  className={`flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.owners ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {owner === userAddress && (
                  <div className="flex items-center px-3 py-2 bg-green-100 text-green-800 text-sm rounded-lg">
                    You
                  </div>
                )}
                {formData.owners.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOwner(index)}
                    className="px-3 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    title="Remove owner"
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
              💡 <strong>Important:</strong> Add all addresses that should have access to Safe management. 
              These addresses cannot be changed without consensus of all current owners.
            </p>
          </div>
        </div>

        {/* Signature threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Signature Threshold *
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
              of {formData.owners.filter(o => o.trim()).length} owners
            </span>
          </div>
          {errors.threshold && (
            <p className="mt-1 text-sm text-red-600">{errors.threshold}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            Minimum number of signatures required to execute any transaction
          </p>

          {/* Threshold recommendations */}
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm mb-2">
              <strong>Threshold selection recommendations:</strong>
            </p>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• <strong>1 of 1:</strong> Basic security, convenient for personal use</li>
              <li>• <strong>2 of 3:</strong> Good security with backup</li>
              <li>• <strong>3 of 5:</strong> High security for teams or organizations</li>
              <li>• <strong>More than 50%:</strong> Protection against minority owner compromise</li>
            </ul>
          </div>
        </div>

        {/* Additional parameters */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Additional Parameters
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Safe version */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Safe Version
              </label>
              <select
                value={formData.safeVersion}
                onChange={(e) => updateField('safeVersion', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={DEFAULT_SAFE_VERSION}>{DEFAULT_SAFE_VERSION} (recommended)</option>
                <option value="1.3.0">1.3.0</option>
                <option value="1.2.0">1.2.0</option>
                <option value="1.1.1">1.1.1</option>
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Use the latest version for better security
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
                placeholder="0x... (optional)"
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.fallbackHandler ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.fallbackHandler && (
                <p className="mt-1 text-sm text-red-600">{errors.fallbackHandler}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Leave empty to use default handler
              </p>
            </div>
          </div>
        </div>

        {/* Predicted address */}
        {predictedAddress && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-medium text-green-900 mb-2">🔮 Predicted Safe Address:</h4>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-white border rounded text-sm font-mono">
                {predictedAddress}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(predictedAddress)}
                className="px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                title="Copy address"
              >
                📋
              </button>
            </div>
            <p className="mt-2 text-sm text-green-800">
              Safe will be deployed to this address after creation
            </p>
          </div>
        )}

        {/* Buttons */}
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
                  Predicting...
                </div>
              ) : (
                '🔮 Predict Address'
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
                Creating...
              </div>
            ) : (
              '🚀 Create Safe'
            )}
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading || predicting}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Gas information */}
      <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <h4 className="font-medium text-orange-900 mb-2">⛽ Fee Information</h4>
        <ul className="text-sm text-orange-800 space-y-1">
          <li>• Creating Safe will require gas payment for contract deployment</li>
          <li>• Cost depends on network congestion and gas price</li>
          <li>• Make sure you have enough ETH balance to pay fees</li>
          <li>• Safe address cannot be changed after creation</li>
        </ul>
      </div>
    </div>
  )
}

export default SafeCreationForm
