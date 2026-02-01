import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { Upload, X, ArrowRight, AlertCircle, Loader2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, CardFooter } from '../components/ui/Card'
import Button from '../components/ui/Button'
import ProgressBar from '../components/ui/ProgressBar'
import { useAppStore, Document as AppDocument } from '../store/appStore'
import { addDocument } from '../lib/db'
import { extractText, isFileSupported } from '../lib/documentProcessor'
import { cn, formatFileSize } from '../lib/utils'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

interface FileWithProgress {
  file: File
  id: string
  status: 'pending' | 'processing' | 'done' | 'error'
  progress: number
  progressText: string
  error?: string
  content?: string
}

export default function UploadPage() {
  const navigate = useNavigate()
  const { sessionId, setDocuments, setCurrentStep } = useAppStore()
  
  const [files, setFiles] = useState<FileWithProgress[]>([])
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newErrors: string[] = []
    
    const validFiles = acceptedFiles.filter(file => {
      if (!isFileSupported(file.name)) {
        newErrors.push(`${file.name}: Invalid file type`)
        return false
      }
      if (file.size > MAX_FILE_SIZE) {
        newErrors.push(`${file.name}: File too large (max 50MB)`)
        return false
      }
      return true
    })
    
    setErrors(newErrors)
    
    // Add files with pending status
    const newFiles: FileWithProgress[] = validFiles.map(file => ({
      file,
      id: crypto.randomUUID(),
      status: 'pending',
      progress: 0,
      progressText: 'Waiting...',
    }))
    
    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxSize: MAX_FILE_SIZE,
    disabled: processing,
  })

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const processFiles = async () => {
    if (!sessionId || files.length === 0) return

    setProcessing(true)

    const processedDocs: AppDocument[] = []

    for (let i = 0; i < files.length; i++) {
      const fileItem = files[i]
      
      // Update status to processing
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'processing' as const, progress: 0, progressText: 'Starting...' }
          : f
      ))

      try {
        // Extract text with progress callback
        const content = await extractText(
          fileItem.file,
          (progress, status) => {
            setFiles(prev => prev.map(f => 
              f.id === fileItem.id 
                ? { ...f, progress, progressText: status }
                : f
            ))
          }
        )

        // Save to IndexedDB
        const doc = await addDocument(sessionId, fileItem.file.name, content)

        // Update status to done
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id 
            ? { ...f, status: 'done' as const, progress: 100, progressText: 'Done', content }
            : f
        ))

        processedDocs.push({
          id: doc.id,
          filename: doc.filename,
          status: 'extracted',
          createdAt: doc.createdAt,
        })

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Processing failed'
        
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id 
            ? { ...f, status: 'error' as const, error: errorMessage }
            : f
        ))

        processedDocs.push({
          id: fileItem.id,
          filename: fileItem.file.name,
          status: 'failed',
          errorMessage,
          createdAt: new Date().toISOString(),
        })
      }
    }

    // Update store with all documents
    setDocuments(processedDocs)
    setProcessing(false)
  }

  const handleContinue = () => {
    const successCount = files.filter(f => f.status === 'done').length
    if (successCount === 0) {
      toast.error('No documents were processed successfully')
      return
    }
    setCurrentStep(3) // Skip ProcessingPage, go directly to clustering
    navigate('/clustering')
  }

  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')
  const hasSuccess = files.some(f => f.status === 'done')
  const pendingCount = files.filter(f => f.status === 'pending').length

  const getStatusIcon = (status: FileWithProgress['status']) => {
    switch (status) {
      case 'done':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'processing':
        return <Loader2 className="h-5 w-5 text-primary-500 animate-spin" />
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Upload className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Upload & Process Documents
              </h2>
              <p className="text-sm text-gray-500">
                Upload your lecture materials - processing happens in your browser
              </p>
            </div>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          {/* Dropzone */}
          {!processing && (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                isDragActive 
                  ? 'border-primary-500 bg-primary-50' 
                  : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              {isDragActive ? (
                <p className="text-primary-600 font-medium">Drop files here...</p>
              ) : (
                <>
                  <p className="text-gray-600 font-medium mb-1">
                    Drag & drop files here, or click to browse
                  </p>
                  <p className="text-sm text-gray-500">
                    Supports PPTX, PDF, DOCX, TXT, MD, PNG, JPG (max 50MB each)
                  </p>
                </>
              )}
            </div>
          )}

          {/* Error messages */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-800 mb-2">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium text-sm">Some files were rejected</span>
              </div>
              <ul className="text-sm text-red-600 space-y-1">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-700">
                Files ({files.length})
              </h3>
              <ul className="space-y-2">
                {files.map((fileItem) => (
                  <li 
                    key={fileItem.id}
                    className={cn(
                      'p-3 rounded-lg',
                      fileItem.status === 'error' ? 'bg-red-50' : 'bg-gray-50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(fileItem.status)}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {fileItem.file.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(fileItem.file.size)}
                          </p>
                        </div>
                      </div>
                      {!processing && (
                        <button
                          onClick={() => removeFile(fileItem.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    
                    {/* Progress bar for processing files */}
                    {fileItem.status === 'processing' && (
                      <div className="space-y-1">
                        <ProgressBar value={fileItem.progress} />
                        <p className="text-xs text-gray-500">{fileItem.progressText}</p>
                      </div>
                    )}
                    
                    {/* Error message */}
                    {fileItem.status === 'error' && fileItem.error && (
                      <p className="text-xs text-red-600 mt-1">{fileItem.error}</p>
                    )}
                    
                    {/* Success indicator */}
                    {fileItem.status === 'done' && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ Extracted {fileItem.content?.length.toLocaleString()} characters
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Stats after processing */}
          {allDone && (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {files.filter(f => f.status === 'done').length}
                </p>
                <p className="text-sm text-green-700">Successful</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">
                  {files.filter(f => f.status === 'error').length}
                </p>
                <p className="text-sm text-red-700">Failed</p>
              </div>
              <div className="text-center p-3 bg-gray-100 rounded-lg">
                <p className="text-2xl font-bold text-gray-600">{files.length}</p>
                <p className="text-sm text-gray-700">Total</p>
              </div>
            </div>
          )}
        </CardBody>

        <CardFooter className="flex justify-between">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/')}
            disabled={processing}
          >
            Back
          </Button>
          
          {allDone ? (
            <Button 
              onClick={handleContinue}
              disabled={!hasSuccess}
            >
              Continue to Clustering
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={processFiles}
              disabled={files.length === 0 || processing}
              loading={processing}
            >
              {processing 
                ? `Processing (${files.length - pendingCount}/${files.length})...`
                : 'Process Files'
              }
              {!processing && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
