import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, CheckCircle, XCircle, Loader2, ArrowRight, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, CardFooter } from '../components/ui/Card'
import Button from '../components/ui/Button'
import ProgressBar from '../components/ui/ProgressBar'
import { useAppStore } from '../store/appStore'
import { getDocuments, addNote, getNotes } from '../lib/db'
import { generateCornellNotes, TopicContext } from '../lib/llm'
import { getClusterContent, ClusterResult } from '../lib/clustering'
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

interface ClusterStatus {
  clusterId: string
  status: 'pending' | 'generating' | 'completed' | 'failed'
  error?: string
  streamedContent?: string
}

export default function GenerationPage() {
  const navigate = useNavigate()
  const { 
    sessionId, 
    clusters, 
    setNotes,
    setCurrentStep,
    promptOptions,
    rateLimitEnabled
  } = useAppStore()
  
  const [clusterStatuses, setClusterStatuses] = useState<ClusterStatus[]>([])
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0)
  
  // Prevent double-call in React StrictMode
  const hasStartedRef = useRef(false)

  // Initialize cluster statuses
  useEffect(() => {
    if (clusters.length > 0 && clusterStatuses.length === 0) {
      setClusterStatuses(clusters.map(c => ({
        clusterId: c.id,
        status: 'pending',
      })))
    }
  }, [clusters]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rotate loading messages
  useEffect(() => {
    if (!generating) return
    
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, 3000)
    
    return () => clearInterval(interval)
  }, [generating])

  // Start generation on mount if not started
  useEffect(() => {
    if (!hasStartedRef.current && sessionId && clusters.length > 0 && clusterStatuses.length > 0) {
      const hasGenerated = clusterStatuses.some(s => s.status !== 'pending')
      if (!hasGenerated) {
        hasStartedRef.current = true
        startGeneration()
      }
    }
  }, [clusterStatuses]) // eslint-disable-line react-hooks/exhaustive-deps

  const startGeneration = async () => {
    if (!sessionId || generating) return

    setGenerating(true)
    
    try {
      const docs = await getDocuments(sessionId)
      
      // Generate notes for each cluster sequentially
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i]
        
        // Update status to generating
        setClusterStatuses(prev => prev.map(s => 
          s.clusterId === cluster.id 
            ? { ...s, status: 'generating' as const, streamedContent: '' }
            : s
        ))
        setProgress(((i) / clusters.length) * 100)

        // Get other topics for uniqueness context
        const otherTopics: TopicContext[] = clusters
          .filter(c => c.id !== cluster.id)
          .map(c => ({
            title: c.title,
            keywords: c.sourcesJson.keywords,
            summary: c.sourcesJson.summary,
            uniqueConcepts: c.sourcesJson.uniqueConcepts,
          }))

        // Get content for this cluster
        const clusterData: ClusterResult = {
          id: cluster.id,
          title: cluster.title,
          keywords: cluster.sourcesJson.keywords || [],
          sourceMapping: cluster.sourcesJson.sourceMapping || [],
          summary: cluster.sourcesJson.summary || '',
          estimatedWordCount: cluster.sourcesJson.estimatedWordCount || 0,
          uniqueConcepts: cluster.sourcesJson.uniqueConcepts || [],
        }
        const sourceContent = getClusterContent(clusterData, docs)

        try {
          // Generate with streaming
          let fullContent = ''
          
          const result = await generateCornellNotes({
            topicTitle: cluster.title,
            sourceContent,
            language: promptOptions.language,
            depth: promptOptions.depth === 'concise' ? 'concise' : 
                   promptOptions.depth === 'indepth' ? 'indepth' : 'balanced',
            customPrompt: promptOptions.useDefault ? undefined : promptOptions.customPrompt,
            otherTopics,
            onChunk: (chunk) => {
              fullContent += chunk
              setClusterStatuses(prev => prev.map(s => 
                s.clusterId === cluster.id 
                  ? { ...s, streamedContent: fullContent }
                  : s
              ))
            },
          })

          // Save to IndexedDB
          await addNote(sessionId, cluster.id, result)

          // Update status to completed
          setClusterStatuses(prev => prev.map(s => 
            s.clusterId === cluster.id 
              ? { ...s, status: 'completed' as const }
              : s
          ))

        } catch (err) {
          console.error(`Failed to generate note for ${cluster.title}:`, err)
          
          setClusterStatuses(prev => prev.map(s => 
            s.clusterId === cluster.id 
              ? { 
                  ...s, 
                  status: 'failed' as const, 
                  error: err instanceof Error ? err.message : 'Generation failed'
                }
              : s
          ))
        }

        // Rate limiting delay if enabled
        if (rateLimitEnabled && i < clusters.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      setProgress(100)
      
      // Load notes from DB
      const savedNotes = await getNotes(sessionId)
      setNotes(savedNotes.map(n => ({
        id: n.id,
        clusterId: n.clusterId,
        markdownContent: n.content,
        status: 'generated' as const,
        createdAt: n.createdAt,
      })))
      
      toast.success('Notes generated successfully!')
      
    } catch (err) {
      console.error('Generation failed:', err)
      toast.error('Failed to generate notes')
      hasStartedRef.current = false
    } finally {
      setGenerating(false)
    }
  }

  const regenerateSingle = async (clusterId: string) => {
    if (!sessionId) return
    
    const cluster = clusters.find(c => c.id === clusterId)
    if (!cluster) return

    // Update status
    setClusterStatuses(prev => prev.map(s => 
      s.clusterId === clusterId 
        ? { ...s, status: 'generating' as const, streamedContent: '', error: undefined }
        : s
    ))

    try {
      const docs = await getDocuments(sessionId)
      
      const otherTopics: TopicContext[] = clusters
        .filter(c => c.id !== clusterId)
        .map(c => ({
          title: c.title,
          keywords: c.sourcesJson.keywords,
          summary: c.sourcesJson.summary,
          uniqueConcepts: c.sourcesJson.uniqueConcepts,
        }))

      const clusterData: ClusterResult = {
        id: cluster.id,
        title: cluster.title,
        keywords: cluster.sourcesJson.keywords || [],
        sourceMapping: cluster.sourcesJson.sourceMapping || [],
        summary: cluster.sourcesJson.summary || '',
        estimatedWordCount: cluster.sourcesJson.estimatedWordCount || 0,
        uniqueConcepts: cluster.sourcesJson.uniqueConcepts || [],
      }
      const sourceContent = getClusterContent(clusterData, docs)

      let fullContent = ''
      
      const result = await generateCornellNotes({
        topicTitle: cluster.title,
        sourceContent,
        language: promptOptions.language,
        depth: promptOptions.depth === 'concise' ? 'concise' : 
               promptOptions.depth === 'indepth' ? 'indepth' : 'balanced',
        customPrompt: promptOptions.useDefault ? undefined : promptOptions.customPrompt,
        otherTopics,
        onChunk: (chunk) => {
          fullContent += chunk
          setClusterStatuses(prev => prev.map(s => 
            s.clusterId === clusterId 
              ? { ...s, streamedContent: fullContent }
              : s
          ))
        },
      })

      await addNote(sessionId, cluster.id, result)

      setClusterStatuses(prev => prev.map(s => 
        s.clusterId === clusterId 
          ? { ...s, status: 'completed' as const }
          : s
      ))

      // Refresh notes
      const savedNotes = await getNotes(sessionId)
      setNotes(savedNotes.map(n => ({
        id: n.id,
        clusterId: n.clusterId,
        markdownContent: n.content,
        status: 'generated' as const,
        createdAt: n.createdAt,
      })))

      toast.success('Note regenerated!')

    } catch (err) {
      setClusterStatuses(prev => prev.map(s => 
        s.clusterId === clusterId 
          ? { 
              ...s, 
              status: 'failed' as const, 
              error: err instanceof Error ? err.message : 'Regeneration failed'
            }
          : s
      ))
      toast.error('Failed to regenerate note')
    }
  }

  const getStatusIcon = (status: ClusterStatus['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'generating':
        return <Loader2 className="h-5 w-5 text-primary-500 animate-spin" />
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
    }
  }

  const completedCount = clusterStatuses.filter(s => s.status === 'completed').length
  const failedCount = clusterStatuses.filter(s => s.status === 'failed').length
  const isComplete = completedCount + failedCount === clusters.length && clusters.length > 0
  const hasNotes = completedCount > 0

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
                  ? `${completedCount} notes generated successfully`
                  : 'Creating detailed notes with AI...'
                }
              </p>
            </div>
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          {/* Loading Message */}
          {generating && !isComplete && (
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
                {Math.round(progress)}%
              </span>
            </div>
            <ProgressBar value={progress} />
          </div>

          {/* Cluster status list */}
          <div className="space-y-2">
            <h3 className="font-medium text-gray-700">Topics</h3>
            <ul className="space-y-2">
              {clusters.map((cluster, index) => {
                const statusInfo = clusterStatuses.find(s => s.clusterId === cluster.id)
                const status = statusInfo?.status || 'pending'
                
                return (
                  <li 
                    key={cluster.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg',
                      status === 'failed' ? 'bg-red-50' : 'bg-gray-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(status)}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {index + 1}. {cluster.title}
                        </p>
                        {status === 'generating' && statusInfo?.streamedContent && (
                          <p className="text-xs text-gray-500 mt-1">
                            {statusInfo.streamedContent.length.toLocaleString()} characters generated...
                          </p>
                        )}
                        {status === 'failed' && statusInfo?.error && (
                          <p className="text-xs text-red-600 mt-1">
                            {statusInfo.error}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {status === 'failed' && !generating && (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => regenerateSingle(cluster.id)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Stats */}
          {isComplete && (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
                <p className="text-sm text-green-700">Successful</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{failedCount}</p>
                <p className="text-sm text-red-700">Failed</p>
              </div>
              <div className="text-center p-3 bg-gray-100 rounded-lg">
                <p className="text-2xl font-bold text-gray-600">{clusters.length}</p>
                <p className="text-sm text-gray-700">Total</p>
              </div>
            </div>
          )}
        </CardBody>

        <CardFooter className="flex justify-between">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/clustering')}
            disabled={generating}
          >
            Back
          </Button>
          <div className="flex gap-2">
            {!generating && !isComplete && (
              <Button onClick={startGeneration}>
                Start Generation
              </Button>
            )}
            {isComplete && (
              <Button 
                onClick={handleContinue}
                disabled={!hasNotes}
              >
                Review Notes
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
