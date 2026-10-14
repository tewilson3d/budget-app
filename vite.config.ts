import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The site sits behind the exe.dev login, so the manifest request must
      // carry the login cookie.
      useCredentials: true,
      manifest: {
        name: 'Budget Tracker',
        short_name: 'Budget',
        description: 'Shared daily expense tracker',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Let login/logout and the API reach the network instead of being
        // answered with the cached app shell.
        navigateFallbackDenylist: [/^\/__exe\.dev\//, /^\/api\//],
      }
    })
  ],
  // `npm run dev` talks to a local Go server: go run ./cmd/srv -dev-user you@example.com
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
