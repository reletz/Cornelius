import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, Edit2, Trash2, ArrowRight, Loader2, Merge, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, CardFooter } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import PromptOptionsPanel from '../components/PromptOptionsPanel'
import { useAppStore } from '../store/appStore'
import { analyzeAndCluster, listClusters, updateCluster, deleteCluster, mergeClusters } from '../lib/api'
import { cn } from '../lib/utils'

// Loading messages for clustering
const CLUSTERING_MESSAGES = [
  "🔍 Reading your documents...",
  "📖 Understanding the content...",
  "🧩 Finding related topics...",
  "📊 Grouping similar concepts...",
  "🎯 Identifying key themes...",
  "✨ Organizing clusters...",
]

export default function ClusteringPage() {
  const navigate = useNavigate()
  const { sessionId, clusters, setClusters, updateCluster: updateClusterStore, removeCluster, setCurrentStep } = useAppStore()
  
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [selectedClusters, setSelectedClusters] = useState<string[]>([])
  const [showPromptOptions, setShowPromptOptions] = useState(false)
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0)
  const [merging, setMerging] = useState(false)
  
  // Prevent double-call in React StrictMode
  const hasAnalyzedRef = useRef(false)

  // Rotate loading messages
  useEffect(() => {
    if (!analyzing) return
    
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % CLUSTERING_MESSAGES.length)
    }, 2500)
    
    return () => clearInterval(interval)
  }, [analyzing])

  useEffect(() => {
    if (!sessionId) return
    
    // Check if we have clusters already
    if (clusters.length === 0 && !hasAnalyzedRef.current) {
      hasAnalyzedRef.current = true
      handleAnalyze()
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnalyze = async () => {
    if (!sessionId || analyzing) return
    
    setAnalyzing(true)
    
    try {
      const result = await analyzeAndCluster(sessionId)
      setClusters(result.clusters)
      toast.success(`Identified ${result.total} topic clusters`)
    } catch (err) {
      toast.error('Failed to analyze documents')
      hasAnalyzedRef.current = false // Allow retry on error
    } finally {
      setAnalyzing(false)
    }
  }

  const handleEdit = (cluster: typeof clusters[0]) => {
    setEditingId(cluster.id)
    setEditTitle(cluster.title)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editTitle.trim()) return
    
    setLoading(true)
    
    try {
      await updateCluster(editingId, { title: editTitle.trim() })
      updateClusterStore(editingId, { title: editTitle.trim() })
      setEditingId(null)
      toast.success('Cluster updated')
    } catch (err) {
      toast.error('Failed to update cluster')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (clusterId: string) => {
    if (!confirm('Are you sure you want to delete this cluster?')) return
    
    setLoading(true)
    
    try {
      await deleteCluster(clusterId)
      removeCluster(clusterId)
      toast.success('Cluster deleted')
    } catch (err) {
      toast.error('Failed to delete cluster')
    } finally {
      setLoading(false)
    }
  }

  const toggleClusterSelection = (clusterId: string) => {
    setSelectedClusters(prev => 
      prev.includes(clusterId)
        ? prev.filter(id => id !== clusterId)
        : [...prev, clusterId]
    )
  }

  const handleMerge = async () => {
    if (selectedClusters.length < 2) {
      toast.error('Select at least 2 clusters to merge')
      return
    }
    
    const newTitle = prompt('Enter a title for the merged cluster:')
    if (!newTitle?.trim()) return
    
    setMerging(true)
    
    try {
      const result = await mergeClusters(selectedClusters, newTitle.trim())
      
      // Refresh clusters
      if (sessionId) {
        const updated = await listClusters(sessionId)
        setClusters(updated.clusters)
      }
      
      setSelectedClusters([])
      toast.success('Clusters merged successfully')
    } catch (err) {
      toast.error('Failed to merge clusters')
    } finally {
      setMerging(false)
    }
  }

  const handleContinue = () => {
    if (clusters.length === 0) {
      toast.error('No clusters to generate notes from')
      return
    }
    setCurrentStep(4)
    navigate('/generation')
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Layers className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Topic Clusters
                </h2>
                <p className="text-sm text-gray-500">
                  Review and organize your topic clusters
                </p>
              </div>
            </div>
            <Button 
              variant="secondary" 
              size="sm"
              onClick={handleAnalyze}
              loading={analyzing}
            >
              Re-analyze
            </Button>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          {analyzing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 text-primary-500 animate-spin mb-4" />
              <p className="text-gray-600 font-medium animate-pulse">
                {CLUSTERING_MESSAGES[loadingMessageIndex]}
              </p>
              <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
            </div>
          ) : clusters.length === 0 ? (
            <div className="text-center py-12">
              <Layers className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No clusters detected</p>
              <Button 
                className="mt-4" 
                onClick={handleAnalyze}
              >
                Analyze Documents
              </Button>
            </div>
          ) : (
            <>
              {/* Merge controls */}
              {selectedClusters.length > 1 && (
                <div className="flex items-center justify-between bg-primary-50 p-3 rounded-lg">
                  <span className="text-sm text-primary-700">
                    {selectedClusters.length} clusters selected
                  </span>
                  <Button 
                    size="sm" 
                    onClick={handleMerge}
                    loading={merging}
                  >
                    <Merge className="mr-2 h-4 w-4" />
                    Merge Selected
                  </Button>
                </div>
              )}

              {/* Cluster list */}
              <ul className="space-y-3">
                {clusters.map((cluster, index) => (
                  <li 
                    key={cluster.id}
                    className={cn(
                      "p-4 rounded-lg border transition-colors",
                      selectedClusters.includes(cluster.id)
                        ? "border-primary-500 bg-primary-50"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    )}
                  >
                    {editingId === cluster.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1"
                          autoFocus
                        />
                        <Button size="sm" onClick={handleSaveEdit} loading={loading}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => toggleClusterSelection(cluster.id)}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedClusters.includes(cluster.id)}
                              onChange={() => {}} // Handled by parent onClick
                              onClick={(e) => e.stopPropagation()} // Prevent double toggle
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                            />
                            <h3 className="font-medium text-gray-900">
                              {index + 1}. {cluster.title}
                            </h3>
                          </div>
                          {cluster.sourcesJson?.summary && (
                            <p className="text-sm text-gray-500 mt-1 ml-6">
                              {cluster.sourcesJson.summary}
                            </p>
                          )}
                          {cluster.sourcesJson?.keywords?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2 ml-6">
                              {cluster.sourcesJson.keywords.slice(0, 5).map((kw: string, i: number) => (
                                <span 
                                  key={i}
                                  className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(cluster)}
                            className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cluster.id)}
                            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* Prompt Options Section */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowPromptOptions(!showPromptOptions)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <Settings2 className="h-4 w-4" />
                  {showPromptOptions ? 'Hide' : 'Show'} Generation Options
                </button>
                
                {showPromptOptions && (
                  <div className="mt-4">
                    <PromptOptionsPanel />
                  </div>
                )}
              </div>
            </>
          )}
        </CardBody>

        <CardFooter className="flex justify-between">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/processing')}
          >
            Back
          </Button>
          <Button 
            onClick={handleContinue}
            disabled={clusters.length === 0 || analyzing}
          >
            Generate Notes
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
