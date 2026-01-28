import { useLocation } from 'react-router-dom'
import { BookOpen, Upload, Loader2, Layers, Sparkles, FileText } from 'lucide-react'
import { cn } from '../lib/utils'
import { useAppStore } from '../store/appStore'

const steps = [
  { path: '/', label: 'Configure', icon: BookOpen },
  { path: '/upload', label: 'Upload', icon: Upload },
  { path: '/processing', label: 'Process', icon: Loader2 },
  { path: '/clustering', label: 'Cluster', icon: Layers },
  { path: '/generation', label: 'Generate', icon: Sparkles },
  { path: '/review', label: 'Review', icon: FileText },
]

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { currentStep } = useAppStore()
  
  const currentStepIndex = steps.findIndex(s => s.path === location.pathname)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-cornell-red" />
              <h1 className="text-xl font-bold text-gray-900">
                Cornell Notes Generator
              </h1>
            </div>
            <div className="text-sm text-gray-500">
              v2.1.0 - BYOK Edition
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-center py-4 min-w-max">
            <ol className="flex items-center space-x-2 sm:space-x-4">
              {steps.map((step, index) => {
                const Icon = step.icon
                const isActive = index === currentStepIndex
                const isCompleted = index < currentStep
                const isDisabled = index > currentStep && index !== currentStepIndex
                
                return (
                  <li key={step.path} className="flex items-center">
                    {index > 0 && (
                      <div 
                        className={cn(
                          "w-6 sm:w-12 h-0.5 mr-2 sm:mr-4",
                          isCompleted ? "bg-primary-500" : "bg-gray-200"
                        )}
                      />
                    )}
                    <div 
                      className={cn(
                        "flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg transition-colors",
                        isActive && "bg-primary-50 text-primary-700",
                        isCompleted && "text-primary-600",
                        isDisabled && "text-gray-400"
                      )}
                    >
                      <Icon className={cn(
                        "h-4 w-4 sm:h-5 sm:w-5",
                        isActive && "text-primary-600"
                      )} />
                      <span className="text-xs sm:text-sm font-medium hidden sm:inline">
                        {step.label}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            Transform lecture materials into detailed Cornell notes instantly
          </p>
        </div>
      </footer>
    </div>
  )
}
