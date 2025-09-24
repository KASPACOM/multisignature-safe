import React, { useState, useEffect } from 'react'
import { SafeConnectionForm as SafeConnectionFormData, createSafeConnectionForm } from '../lib/onchain'
import { DEFAULT_SAFE_VERSION } from '../lib/safe-common'

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
  title = "Connect to Safe",
  className = "",
  prefilledData
}) => {
  const [formData, setFormData] = useState<SafeConnectionFormData>({
    safeAddress: '',
    owners: [''],
    threshold: 1,
    safeVersion: DEFAULT_SAFE_VERSION,
    fallbackHandler: ''
  })

  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  // Pre-fill form with navigation data
  useEffect(() => {
    if (prefilledData) {
      console.log('🔄 Pre-filling Safe connection form:', prefilledData)
      setFormData({
        safeAddress: prefilledData.address,
        owners: prefilledData.owners,
        threshold: prefilledData.threshold,
        safeVersion: DEFAULT_SAFE_VERSION,
        fallbackHandler: ''
      })
    }
  }, [prefilledData])

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    // Check Safe address
    if (!formData.safeAddress.trim()) {
      newErrors.safeAddress = 'Enter Safe address'
    } else if (!formData.safeAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      newErrors.safeAddress = 'Invalid Ethereum address format'
    }

    // Check owners
    const validOwners = formData.owners.filter(owner => owner.trim())
    if (validOwners.length === 0) {
      newErrors.owners = 'Add at least one owner'
    } else {
      const invalidOwners = validOwners.filter(owner => !owner.match(/^0x[a-fA-F0-9]{40}$/))
      if (invalidOwners.length > 0) {
        newErrors.owners = 'Invalid owner address format'
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

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    // Clear empty owners and create final form
    const finalFormData = createSafeConnectionForm(
      formData.safeAddress.trim(),
      formData.owners.filter(owner => owner.trim()),
      formData.threshold,
      {
        safeVersion: formData.safeVersion || DEFAULT_SAFE_VERSION,
        fallbackHandler: formData.fallbackHandler?.trim() || undefined
      }
    )

    onConnect(finalFormData)
  }

  // Update form field
  const updateField = (field: keyof SafeConnectionFormData, value: string) => {
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

  return (
    <div className={`p-6 bg-white rounded-lg shadow ${className}`}>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          🔌 {title}
        </h2>
        <p className="text-gray-600 text-sm">
          Specify Safe parameters for connection. Make sure all data matches the actual Safe.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Safe address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Safe Address *
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

        {/* Owners */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Safe Owners *
            </label>
            <button
              type="button"
              onClick={addOwner}
              className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-200 transition-colors"
            >
              + Add Owner
            </button>
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
        </div>

        {/* Signature threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Signature Threshold *
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
            Number of signatures required to execute transactions
          </p>
        </div>


        {/* Buttons */}
        <div className="flex gap-4 pt-6 border-t">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Connecting...
              </div>
            ) : (
              '🔌 Connect to Safe'
            )}
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Information */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">💡 Important Information</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Make sure the Safe address is correct</li>
          <li>• Owners and threshold must match the actual Safe</li>
          <li>• Incorrect parameters may lead to errors during operation</li>
          <li>• After connection, you will be able to create and sign transactions</li>
        </ul>
      </div>
    </div>
  )
}

export default SafeConnectionForm
