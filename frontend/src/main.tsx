import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (bundled by Vite, precached by the service worker) — no
// external CDN, so the app shell renders identically offline. Latin subset
// covers en/de/ptBR. Display: Spectral (incl. italics); body: Figtree.
// Imported here (not via CSS @import) so Vite rewrites their url()s — Tailwind
// v4's @import handling does not.
import '@fontsource/spectral/latin-400.css'
import '@fontsource/spectral/latin-500.css'
import '@fontsource/spectral/latin-600.css'
import '@fontsource/spectral/latin-400-italic.css'
import '@fontsource/spectral/latin-500-italic.css'
import '@fontsource/figtree/latin-400.css'
import '@fontsource/figtree/latin-500.css'
import '@fontsource/figtree/latin-600.css'
import '@fontsource/figtree/latin-700.css'
import './index.css'
import './lib/i18n'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
