import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { whatsappApiPlugin } from './server/viteWhatsappApiPlugin.js'
import { setupApiPlugin } from './server/viteSetupApiPlugin.js'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), whatsappApiPlugin(), setupApiPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        bypass: (req) => {
          const url = req.url || ''
          if (url.startsWith('/api/whatsapp') || url.startsWith('/api/setup')) return url
          return undefined
        },
      },
    },
  },
})