import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ConfigPage from './pages/ConfigPage'
import UploadPage from './pages/UploadPage'
import ClusteringPage from './pages/ClusteringPage'
import GenerationPage from './pages/GenerationPage'
import ReviewPage from './pages/ReviewPage'
import SettingsPage from './pages/SettingsPage'
import { getSettings } from './lib/db'

function App() {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)

  // Check if API key is configured
  useEffect(() => {
    const checkApiKey = async () => {
      const settings = await getSettings()
      setHasApiKey(!!settings.apiKey)
    }
    checkApiKey()
  }, [])

  // Show loading while checking API key
  if (hasApiKey === null) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">Loading...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ConfigPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route 
          path="/upload" 
          element={hasApiKey ? <UploadPage /> : <Navigate to="/" replace />} 
        />
        {/* Processing page removed - processing now happens in UploadPage */}
        <Route 
          path="/clustering" 
          element={hasApiKey ? <ClusteringPage /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/generation" 
          element={hasApiKey ? <GenerationPage /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/review" 
          element={hasApiKey ? <ReviewPage /> : <Navigate to="/" replace />} 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
