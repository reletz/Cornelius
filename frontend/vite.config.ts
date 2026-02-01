import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Raw imports work out of the box with ?raw suffix
  // No additional config needed for .md files
  assetsInclude: ['**/*.md'],
  server: {
    port: 3000,
    // Proxy removed - no backend needed for client-side architecture
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
