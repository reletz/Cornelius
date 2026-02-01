import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { FileText, Download, ChevronLeft, ChevronRight, RotateCcw, FileDown, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, CardFooter } from '../components/ui/Card'
import Button from '../components/ui/Button'
import { useAppStore } from '../store/appStore'
import { getNotes } from '../lib/db'
import { generatePdf, downloadMarkdown, downloadMarkdownZip } from '../lib/pdfGenerator'
import { cn } from '../lib/utils'

export default function ReviewPage() {
  const navigate = useNavigate()
  const { sessionId, clusters, notes, setNotes, reset } = useAppStore()
  
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'pdf' | 'md' | 'zip' | null>(null)
  
  // Prevent double-call in React StrictMode
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!sessionId) return

    const fetchNotes = async () => {
      try {
        const result = await getNotes(sessionId)
        setNotes(result.map(n => ({
          id: n.id,
          clusterId: n.clusterId,
          markdownContent: n.content,
          status: 'generated' as const,
          createdAt: n.createdAt,
        })))
      } catch (err) {
        toast.error('Failed to load notes')
      } finally {
        setLoading(false)
      }
    }

    if (notes.length === 0 && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchNotes()
    } else {
      setLoading(false)
    }
  }, [sessionId, notes.length, setNotes])

  const currentNote = notes[selectedIndex]
  const currentCluster = clusters.find(c => c.id === currentNote?.clusterId)

  const handleDownloadMarkdown = async () => {
    if (!currentNote) return
    
    setExporting('md')
    try {
      const filename = currentCluster?.title || `note-${selectedIndex + 1}`
      downloadMarkdown(currentNote.markdownContent, filename)
      toast.success('Markdown downloaded!')
    } catch (err) {
      toast.error('Failed to download markdown')
    } finally {
      setExporting(null)
    }
  }

  const handleDownloadAllMarkdown = async () => {
    if (notes.length === 0) return
    
    setExporting('zip')
    try {
      const noteFiles = notes.map((note, index) => {
        const cluster = clusters.find(c => c.id === note.clusterId)
        return {
          filename: cluster?.title || `note-${index + 1}`,
          content: note.markdownContent,
        }
      })
      
      await downloadMarkdownZip(noteFiles, 'cornell-notes')
      toast.success('All notes downloaded!')
    } catch (err) {
      toast.error('Failed to download notes')
    } finally {
      setExporting(null)
    }
  }

  const handleDownloadPdf = async () => {
    if (!currentNote) return
    
    setExporting('pdf')
    try {
      const filename = currentCluster?.title || `note-${selectedIndex + 1}`
      await generatePdf(currentNote.markdownContent, filename)
      toast.success('PDF downloaded!')
    } catch (err) {
      toast.error('Failed to generate PDF')
    } finally {
      setExporting(null)
    }
  }

  const handleStartOver = () => {
    if (confirm('Are you sure you want to start over? All current work will be lost.')) {
      reset()
      navigate('/')
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardBody className="py-12 text-center">
            <p className="text-gray-500">Loading notes...</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6">
        {/* Note list sidebar */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <Card>
            <CardHeader>
              <h3 className="font-medium text-gray-900">Notes ({notes.length})</h3>
            </CardHeader>
            <CardBody className="p-2 max-h-48 lg:max-h-none overflow-y-auto">
              <ul className="space-y-1">
                {notes.map((note, index) => {
                  const cluster = clusters.find(c => c.id === note.clusterId)
                  return (
                    <li key={note.id}>
                      <button
                        onClick={() => setSelectedIndex(index)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                          selectedIndex === index
                            ? "bg-primary-100 text-primary-800"
                            : "hover:bg-gray-100 text-gray-700"
                        )}
                      >
                        <span className="font-medium">{index + 1}.</span>{' '}
                        {cluster?.title || 'Untitled'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </CardBody>
          </Card>

          {/* Export options */}
          <Card className="mt-4">
            <CardHeader>
              <h3 className="font-medium text-gray-900">Export</h3>
            </CardHeader>
            <CardBody className="space-y-2">
              <Button 
                variant="secondary" 
                className="w-full justify-start"
                onClick={handleDownloadMarkdown}
                loading={exporting === 'md'}
                disabled={!currentNote || exporting !== null}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Current (MD)
              </Button>
              
              <Button 
                variant="secondary" 
                className="w-full justify-start"
                onClick={handleDownloadAllMarkdown}
                loading={exporting === 'zip'}
                disabled={notes.length === 0 || exporting !== null}
              >
                <Package className="mr-2 h-4 w-4" />
                Download All (ZIP)
              </Button>
              
              <Button 
                variant="secondary" 
                className="w-full justify-start"
                onClick={handleDownloadPdf}
                loading={exporting === 'pdf'}
                disabled={!currentNote || exporting !== null}
              >
                <FileDown className="mr-2 h-4 w-4" />
                Download Current (PDF)
              </Button>
            </CardBody>
          </Card>

          {/* Actions */}
          <Card className="mt-4">
            <CardBody>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-gray-600"
                onClick={handleStartOver}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Start Over
              </Button>
            </CardBody>
          </Card>
        </div>

        {/* Note preview */}
        <div className="lg:col-span-3 order-1 lg:order-2">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-1">
                      {currentCluster?.title || 'Note Preview'}
                    </h2>
                    <p className="text-sm text-gray-500">
                      Note {selectedIndex + 1} of {notes.length}
                    </p>
                  </div>
                </div>
                
                {/* Navigation */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIndex(i => Math.max(0, i - 1))}
                    disabled={selectedIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-500">
                    {selectedIndex + 1} / {notes.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIndex(i => Math.min(notes.length - 1, i + 1))}
                    disabled={selectedIndex === notes.length - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardBody className="max-h-[600px] overflow-y-auto">
              {currentNote ? (
                <div className="markdown-preview prose prose-sm max-w-none">
                  <ReactMarkdown>
                    {currentNote.markdownContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No note selected
                </div>
              )}
            </CardBody>

            <CardFooter className="flex justify-between">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/generation')}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button 
                  variant="secondary"
                  onClick={handleDownloadMarkdown}
                  disabled={!currentNote || exporting !== null}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
