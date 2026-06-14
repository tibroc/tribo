import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server proxies /api to the Go backend so the frontend can call real
// endpoints during `npm run dev`. The production build is emitted to ../web/dist
// where it gets embedded into the Go binary via go:embed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: '../web/dist',
    emptyOutDir: true,
  },
})
