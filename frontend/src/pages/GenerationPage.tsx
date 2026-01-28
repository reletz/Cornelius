import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, CardFooter } from '../components/ui/Card'
import Button from '../components/ui/Button'
import ProgressBar from '../components/ui/ProgressBar'
import { useAppStore } from '../store/appStore'
import { generateNotes, getGenerationStatus, listNotes, PromptOptionsPayload } from '../lib/api'
import { cn } from '../lib/utils'

// Loading messages that rotate during generation
const LOADING_MESSAGES = [
  "🧠 Analyzing your documents...",
  "📚 Extracting key concepts...",
  "✨ Crafting Cornell-style notes...",
  "🎯 Organizing main ideas...",
  "📝 Writing detailed explanations...",
  "🔍 Adding reference points...",
  "💡 Creating study questions...",
  "📊 Structuring content sections...",
  "🎨 Formatting for clarity...",
  "⚡ Almost there...",
]

export default function GenerationPage() {
  const navigate = useNavigate()
  const { 
    sessionId, 
    clusters, 
    generationTaskId, 
    setGenerationTaskId,
    setNotes,
    setCurrentStep,
    promptOptions
  } = useAppStore()
  
  const [status, setStatus] = useState<{
    status: string
    progress: number
    currentCluster: string | null
    completedClusters: string[]
    failedClusters: string[]
  } | null>(null)
  const [polling, setPolling] = useState(false)
  const [starting, setStarting] = useState(false)
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0)
  
  // Prevent double-call in React StrictMode
  const hasStartedRef = useRef(false)

  // Rotate loading messages
  useEffect(() => {
    if (!polling && !starting) return
    
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, 3000)
    
    return () => clearInterval(interval)
  }, [polling, starting])

  // Start generation on mount if no task
  useEffect(() => {
    if (!generationTaskId && sessionId && !hasStartedRef.current) {
      hasStartedRef.current = true
      startGeneration()
    } else if (generationTaskId) {
      setPolling(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for status
  useEffect(() => {
    if (!generationTaskId || !polling) return

    const pollStatus = async () => {
      try {
        const result = await getGenerationStatus(generationTaskId)
        setStatus({
          status: result.status,
          progress: result.progress * 100,
          currentCluster: result.current_cluster,
          completedClusters: result.completed_clusters || [],
          failedClusters: result.failed_clusters || [],
        })

        if (result.status === 'completed' || result.status === 'failed') {
          setPolling(false)
          
          // Clear task ID so user can re-generate fresh if needed
          setGenerationTaskId(null)
          
          // Fetch notes
          if (sessionId) {
            const notes = await listNotes(sessionId)
            setNotes(notes.notes)
          }
        }
      } catch (err) {
        console.error('Failed to poll status:', err)
      }
    }

    const interval = setInterval(pollStatus, 2000)
    pollStatus()

    return () => clearInterval(interval)
  }, [generationTaskId, polling, sessionId, setNotes, setGenerationTaskId])

  const startGeneration = async () => {
    if (!sessionId || starting) return

    setStarting(true)
    try {
      // Convert store promptOptions to API format
      const promptPayload: PromptOptionsPayload = {
        use_default: promptOptions.useDefault,
        language: promptOptions.language,
        depth: promptOptions.depth,
        custom_prompt: promptOptions.customPrompt || undefined,
      }
      
      const result = await generateNotes(sessionId, undefined, promptPayload)
      setGenerationTaskId(result.task_id)
      setPolling(true)
      toast.success('Generation started!')
    } catch (err) {
      toast.error('Failed to start generation')
      hasStartedRef.current = false // Allow retry on error
    } finally {
      setStarting(false)
    }
  }

  const getClusterStatus = (clusterId: string) => {
    if (!status) return 'pending'
    if (status.completedClusters.includes(clusterId)) return 'completed'
    if (status.failedClusters.includes(clusterId)) return 'failed'
    if (status.currentCluster === clusterId) return 'processing'
    return 'pending'
  }

  const getStatusIcon = (clusterStatus: string) => {
    switch (clusterStatus) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'processing':
        return <Loader2 className="h-5 w-5 text-primary-500 animate-spin" />
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
    }
  }

  const isComplete = status?.status === 'completed'
  const hasNotes = (status?.completedClusters.length || 0) > 0

  const handleContinue = () => {
    if (!hasNotes) {
      toast.error('No notes were generated')
      return
    }
    setCurrentStep(5)
    navigate('/review')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              isComplete ? "bg-green-100" : "bg-primary-100"
            )}>
              {isComplete ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : (
                <Sparkles className="h-6 w-6 text-primary-600" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isComplete ? 'Generation Complete' : 'Generating Cornell Notes'}
              </h2>
              <p className="text-sm text-gray-500">
                {isComplete 
                  ? `${status?.completedClusters.length} notes generated successfully`
                  : 'Creating detailed notes with AI...'
                }
              </p>
            </div>
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          {/* Loading Message */}
          {(polling || starting) && !isComplete && (
            <div className="flex items-center justify-center gap-3 p-4 bg-primary-50 rounded-lg border border-primary-200">
              <Loader2 className="h-5 w-5 text-primary-600 animate-spin" />
              <span className="text-sm font-medium text-primary-700 animate-pulse">
                {LOADING_MESSAGES[loadingMessageIndex]}
              </span>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Overall Progress</span>
              <span className="text-gray-900 font-medium">
                {Math.round(status?.progress || 0)}%
              </span>
            </div>
            <ProgressBar value={status?.progress || 0} />
          </div>

          {/* Cluster status list */}
          <div className="space-y-2">
            <h3 className="font-medium text-gray-700">Topics</h3>
            <ul className="space-y-2">
              {clusters.map((cluster, index) => {
                const clusterStatus = getClusterStatus(cluster.id)
                
                return (
                  <li 
                    key={cluster.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      clusterStatus === 'processing' && "bg-primary-50 border border-primary-200",
                      clusterStatus === 'completed' && "bg-green-50",
                      clusterStatus === 'failed' && "bg-red-50",
                      clusterStatus === 'pending' && "bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(clusterStatus)}
                      <span className="text-sm font-medium text-gray-900">
                        {index + 1}. {cluster.title}
                      </span>
                    </div>
                    <span className={cn(
                      "text-xs font-medium px-2 py-1 rounded",
                      clusterStatus === 'completed' && "bg-green-100 text-green-700",
                      clusterStatus === 'failed' && "bg-red-100 text-red-700",
                      clusterStatus === 'processing' && "bg-primary-100 text-primary-700",
                      clusterStatus === 'pending' && "bg-gray-100 text-gray-600"
                    )}>
                      {clusterStatus === 'processing' ? 'Generating...' : clusterStatus}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Stats when complete */}
          {isComplete && (
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">
                  {status?.completedClusters.length}
                </p>
                <p className="text-sm text-green-700">Notes Generated</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-3xl font-bold text-red-600">
                  {status?.failedClusters.length}
                </p>
                <p className="text-sm text-red-700">Failed</p>
              </div>
            </div>
          )}
        </CardBody>

        <CardFooter className="flex justify-between">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/clustering')}
          >
            Back
          </Button>
          <Button 
            onClick={handleContinue}
            disabled={!isComplete || !hasNotes}
          >
            Review Notes
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
