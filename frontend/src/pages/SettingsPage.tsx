import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Key, Save, CheckCircle, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { 
  getSettings, 
  updateSettings
} from '../lib/db'
import { validateApiKey, resetLLMClient } from '../lib/llm'

// Cache for model list (stored in localStorage with TTL)
const MODEL_CACHE_KEY = 'openrouter_models_cache'
const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

interface ModelCache {
  models: string[]
  timestamp: number
}

async function fetchAvailableModels(): Promise<string[]> {
  // Check cache first
  const cached = localStorage.getItem(MODEL_CACHE_KEY)
  if (cached) {
    try {
      const data: ModelCache = JSON.parse(cached)
      if (Date.now() - data.timestamp < MODEL_CACHE_TTL) {
        return data.models
      }
    } catch {}
  }

  // Fetch from API
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models')
    if (!response.ok) throw new Error('Failed to fetch models')
    
    const data = await response.json()
    const models: string[] = data.data?.map((m: { id: string }) => m.id) || []
    
    // Cache the result
    const cache: ModelCache = { models, timestamp: Date.now() }
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(cache))
    
    return models
  } catch (err) {
    console.error('Failed to fetch models:', err)
    return []
  }
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null)
  
  // Original values to track changes
  const [originalApiKey, setOriginalApiKey] = useState('')
  
  // Form state
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  
  // Model validation state
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelValidating, setModelValidating] = useState(false)
  const [modelValid, setModelValid] = useState<boolean | null>(null)
  const modelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check if API key has changed and needs validation
  const apiKeyChanged = apiKey.trim() !== originalApiKey
  const apiKeyValidated = validationResult?.valid === true

  useEffect(() => {
    loadSettings()
    loadAvailableModels()
  }, [])

  const loadSettings = async () => {
    try {
      const s = await getSettings()
      setApiKey(s.apiKey)
      setOriginalApiKey(s.apiKey)
      setBaseUrl(s.baseUrl)
      setModel(s.model)
      
      // If API key already exists, consider it validated
      if (s.apiKey) {
        setValidationResult({ valid: true, message: 'API key previously validated' })
      }
    } catch (err) {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableModels = async () => {
    const models = await fetchAvailableModels()
    setAvailableModels(models)
  }

  // Debounced model validation
  const validateModel = useCallback((modelId: string) => {
    if (modelDebounceRef.current) {
      clearTimeout(modelDebounceRef.current)
    }

    if (!modelId.trim()) {
      setModelValid(null)
      return
    }

    setModelValidating(true)
    
    modelDebounceRef.current = setTimeout(() => {
      const isValid = availableModels.length === 0 || availableModels.includes(modelId.trim())
      setModelValid(isValid)
      setModelValidating(false)
    }, 500)
  }, [availableModels])

  const handleModelChange = (value: string) => {
    setModel(value)
    validateModel(value)
  }

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    // Reset validation when API key changes
    if (value.trim() !== originalApiKey) {
      setValidationResult(null)
    } else {
      // If reverted to original, consider it validated
      setValidationResult({ valid: true, message: 'API key previously validated' })
    }
  }

  const handleValidateKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key')
      return
    }

    setValidating(true)
    setValidationResult(null)

    try {
      const result = await validateApiKey(apiKey.trim(), baseUrl)
      setValidationResult(result)
      
      if (result.valid) {
        toast.success('API key is valid!')
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      setValidationResult({ valid: false, message: 'Validation failed' })
    } finally {
      setValidating(false)
    }
  }

  const handleSave = async () => {
    // Check if API key changed but not validated
    if (apiKeyChanged && !apiKeyValidated) {
      toast.error('Please validate your API key before saving')
      return
    }

    // Check model validity
    if (modelValid === false) {
      toast.error('Please enter a valid model ID')
      return
    }

    setSaving(true)

    try {
      await updateSettings({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      })
      
      // Update original API key reference
      setOriginalApiKey(apiKey.trim())
      
      // Reset LLM client to pick up new settings
      resetLLMClient()
      
      toast.success('Settings saved!')
    } catch (err) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    // Check if there are unsaved API key changes
    if (apiKeyChanged && !apiKeyValidated) {
      const confirmed = window.confirm(
        'Your API key has been changed but not validated. Changes will not be saved. Continue?'
      )
      if (!confirmed) return
    }
    navigate('/')
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardBody className="py-12 text-center">
            <p className="text-gray-500">Loading settings...</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* API Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Key className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                API Configuration
              </h2>
              <p className="text-sm text-gray-500">
                Configure your OpenRouter API settings
              </p>
            </div>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">
              🔑 Bring Your Own Key (BYOK)
            </h3>
            <p className="text-sm text-blue-700">
              Your API key is stored locally in your browser using IndexedDB.
              It is never sent to any server - API calls go directly from your browser to OpenRouter.
            </p>
          </div>

          <div>
            <Input
              label="OpenRouter API Key"
              type="password"
              placeholder="sk-or-v1-..."
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              helperText="Get your API key from openrouter.ai/keys"
            />
            {apiKeyChanged && !apiKeyValidated && (
              <p className="mt-1 text-xs text-amber-600">
                ⚠️ API key changed - validation required before saving
              </p>
            )}
          </div>

          <Input
            label="Base URL"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            helperText="OpenRouter API base URLc"
            disabled
          />

          <div>
            <Input
              label="Model"
              type="text"
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              helperText="LLM model ID to use for note generation"
            />
            <div className="mt-1 flex items-center gap-2">
              {modelValidating && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Validating model...
                </span>
              )}
              {!modelValidating && modelValid === true && model.trim() && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Valid model ID
                </span>
              )}
              {!modelValidating && modelValid === false && (
                <span className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Model not found in OpenRouter
                </span>
              )}
            </div>
          </div>

          {validationResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              validationResult.valid 
                ? 'text-green-600 bg-green-50' 
                : 'text-red-600 bg-red-50'
            }`}>
              {validationResult.valid ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span className="text-sm">{validationResult.message}</span>
            </div>
          )}

          <Button 
            variant="secondary" 
            onClick={handleValidateKey}
            loading={validating}
            disabled={!apiKey.trim()}
          >
            Validate API Key
          </Button>
        </CardBody>
      </Card>

      {/* Save Button */}
      <Card>
        <CardBody className="space-y-3">
          <Button 
            onClick={handleSave} 
            loading={saving}
            className="w-full"
            disabled={apiKeyChanged && !apiKeyValidated}
          >
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
          {apiKeyChanged && !apiKeyValidated && (
            <p className="text-xs text-center text-amber-600">
              Validate API key to enable saving
            </p>
          )}
          <Button 
            variant="ghost"
            onClick={handleBack}
            className="w-full"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </CardBody>
      </Card>

      {/* Info */}
      <Card>
        <CardBody>
          <h3 className="font-medium text-gray-900 mb-2">ℹ️ About This App</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              <strong>Cornell Notes Generator v3.0</strong> - Full Client-Side Edition
            </p>
            <p>
              All processing happens in your browser:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Documents are processed locally (no upload to server)</li>
              <li>Data stored in IndexedDB (browser storage)</li>
              <li>LLM calls go directly to OpenRouter</li>
              <li>PDF generation in browser using html2pdf.js</li>
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
