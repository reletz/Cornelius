import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Document {
  id: string
  filename: string
  status: 'uploaded' | 'processing' | 'extracted' | 'failed'
  errorMessage?: string
  createdAt: string
}

export interface Cluster {
  id: string
  sessionId: string
  title: string
  sourcesJson: {
    keywords: string[]
    sourceMapping: Array<{ source: string; slides?: number[] }>
    summary: string
    estimatedWordCount: number
    uniqueConcepts?: string[]
  }
  orderIndex: number
  createdAt: string
}

export interface Note {
  id: string
  clusterId: string
  markdownContent: string
  status: 'generating' | 'generated' | 'failed'
  createdAt: string
}

export interface PromptOptions {
  useDefault: boolean
  language: 'en' | 'id'
  depth: 'concise' | 'balanced' | 'indepth'
  customPrompt: string
}

interface AppState {
  // API Key (stored in localStorage)
  apiKey: string | null
  setApiKey: (key: string | null) => void
  
  // Rate limiting toggle
  rateLimitEnabled: boolean
  setRateLimitEnabled: (enabled: boolean) => void
  
  // Current session
  sessionId: string | null
  setSessionId: (id: string | null) => void
  
  // Documents
  documents: Document[]
  setDocuments: (docs: Document[]) => void
  updateDocument: (id: string, updates: Partial<Document>) => void
  
  // Clusters
  clusters: Cluster[]
  setClusters: (clusters: Cluster[]) => void
  updateCluster: (id: string, updates: Partial<Cluster>) => void
  removeCluster: (id: string) => void
  
  // Notes
  notes: Note[]
  setNotes: (notes: Note[]) => void
  
  // Prompt options
  promptOptions: PromptOptions
  setPromptOptions: (options: Partial<PromptOptions>) => void
  
  // Generation task
  generationTaskId: string | null
  setGenerationTaskId: (id: string | null) => void
  
  // Current step
  currentStep: number
  setCurrentStep: (step: number) => void
  
  // Reset state
  reset: () => void
}

const initialState = {
  apiKey: null,
  rateLimitEnabled: true,
  sessionId: null,
  documents: [],
  clusters: [],
  notes: [],
  promptOptions: {
    useDefault: true,
    language: 'en' as const,
    depth: 'balanced' as const,
    customPrompt: '',
  },
  generationTaskId: null,
  currentStep: 0,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setApiKey: (key) => set({ apiKey: key }),
      
      setRateLimitEnabled: (enabled) => set({ rateLimitEnabled: enabled }),
      
      setSessionId: (id) => set({ sessionId: id }),
      
      setDocuments: (docs) => set({ documents: docs }),
      
      updateDocument: (id, updates) => set((state) => ({
        documents: state.documents.map((doc) =>
          doc.id === id ? { ...doc, ...updates } : doc
        ),
      })),
      
      setClusters: (clusters) => set({ clusters }),
      
      updateCluster: (id, updates) => set((state) => ({
        clusters: state.clusters.map((cluster) =>
          cluster.id === id ? { ...cluster, ...updates } : cluster
        ),
      })),
      
      removeCluster: (id) => set((state) => ({
        clusters: state.clusters.filter((cluster) => cluster.id !== id),
      })),
      
      setNotes: (notes) => set({ notes }),
      
      setPromptOptions: (options) => set((state) => ({
        promptOptions: { ...state.promptOptions, ...options }
      })),
      
      setGenerationTaskId: (id) => set({ generationTaskId: id }),
      
      setCurrentStep: (step) => set({ currentStep: step }),
      
      reset: () => set({
        sessionId: null,
        documents: [],
        clusters: [],
        notes: [],
        generationTaskId: null,
        currentStep: 0,
        // Keep promptOptions and rateLimitEnabled for user preference
      }),
    }),
    {
      name: 'cornell-notes-storage',
      partialize: (state) => ({ 
        // API key is now stored in IndexedDB, not here
        rateLimitEnabled: state.rateLimitEnabled,
        sessionId: state.sessionId,
        currentStep: state.currentStep,
        promptOptions: state.promptOptions,
      }),
    }
  )
)
