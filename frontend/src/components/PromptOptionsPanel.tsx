import { useAppStore, PromptOptions } from '../store/appStore'
import { cn } from '../lib/utils'

interface RadioOption {
  value: string
  label: string
  description?: string
}

interface RadioGroupProps {
  name: string
  options: RadioOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

function RadioGroup({ name, options, value, onChange, className }: RadioGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
            value === option.value
              ? "border-primary-500 bg-primary-50"
              : "border-gray-200 hover:bg-gray-50"
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => onChange(e.target.value)}
            className="text-primary-600 focus:ring-primary-500"
          />
          <div>
            <span className="font-medium text-gray-900">{option.label}</span>
            {option.description && (
              <p className="text-sm text-gray-500">{option.description}</p>
            )}
          </div>
        </label>
      ))}
    </div>
  )
}

export default function PromptOptionsPanel() {
  const { promptOptions, setPromptOptions } = useAppStore()

  const promptTypeOptions: RadioOption[] = [
    { value: 'default', label: 'Default Prompt', description: 'Use optimized Cornell Notes prompt' },
    { value: 'custom', label: 'Custom Prompt', description: 'Write your own prompt' },
  ]

  const languageOptions: RadioOption[] = [
    { value: 'en', label: '🇬🇧 English' },
    { value: 'id', label: '🇮🇩 Bahasa Indonesia' },
  ]

  const depthOptions: RadioOption[] = [
    { value: 'concise', label: 'Concise', description: '800-1200 words, key points only' },
    { value: 'balanced', label: 'Balanced', description: '1500-2500 words, comprehensive' },
    { value: 'indepth', label: 'In-Depth', description: '3000-5000 words, exhaustive coverage' },
  ]

  return (
    <div className="space-y-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📝 Prompt Type</h3>
        <RadioGroup
          name="promptType"
          options={promptTypeOptions}
          value={promptOptions.useDefault ? 'default' : 'custom'}
          onChange={(val) => setPromptOptions({ useDefault: val === 'default' })}
        />
      </div>

      {promptOptions.useDefault ? (
        <>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">🌐 Language</h3>
            <div className="grid grid-cols-2 gap-2">
              {languageOptions.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors text-center",
                    promptOptions.language === option.value
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <input
                    type="radio"
                    name="language"
                    value={option.value}
                    checked={promptOptions.language === option.value}
                    onChange={(e) => setPromptOptions({ language: e.target.value as 'en' | 'id' })}
                    className="sr-only"
                  />
                  <span className="font-medium text-gray-900">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 Detail Level</h3>
            <RadioGroup
              name="depth"
              options={depthOptions}
              value={promptOptions.depth}
              onChange={(val) => setPromptOptions({ depth: val as 'concise' | 'balanced' | 'indepth' })}
            />
          </div>
        </>
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">✍️ Custom Prompt</h3>
          <textarea
            value={promptOptions.customPrompt}
            onChange={(e) => setPromptOptions({ customPrompt: e.target.value })}
            placeholder="Enter your custom prompt here. Include instructions for how you want the notes to be generated..."
            className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-y focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          />
          <p className="mt-2 text-xs text-gray-500">
            💡 Tip: Your prompt will be followed by the topic title and source materials.
            Note: Custom prompts won't have automatic format correction applied.
          </p>
        </div>
      )}
    </div>
  )
}
