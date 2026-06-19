import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Dev server proxies /api to the Go backend so the frontend can call real
// endpoints during `npm run dev`. The production build is emitted to ../web/dist
// where it gets embedded into the Go binary via go:embed.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We control the update UX ourselves (a reload toast) rather than
      // auto-reloading the page out from under the user.
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Tribo',
        short_name: 'Tribo',
        description: 'Self-hosted, family-centered organizer',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#3E6259',
        background_color: '#F1EBDE',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the hashed app shell; SPA deep links fall back to index.html
        // offline, mirroring the Go server's index.html fallback.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // /api, /auth and /mcp are server-driven; never serve them from the SW.
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/mcp/],
        runtimeCaching: [
          {
            // Read-only API GETs: serve from network when online (so data stays
            // fresh and mutations reflect immediately), fall back to the last
            // cached response when offline/slow. Only GETs are matched by
            // Workbox, so mutations are never cached. /api/session is excluded —
            // auth/profile state must always be live, never a stale snapshot.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/api/session'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tribo-api',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Toggle to exercise the SW under `npm run dev` if needed.
        enabled: false,
      },
    }),
  ],
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
