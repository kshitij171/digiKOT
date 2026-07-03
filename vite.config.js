import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { whatsappApiPlugin } from './server/viteWhatsappApiPlugin.js'
import { setupApiPlugin } from './server/viteSetupApiPlugin.js'

export default defineConfig({
  plugins: [react(), whatsappApiPlugin(), setupApiPlugin()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) => {
          const url = req.url || ''
          if (url.startsWith('/api/whatsapp') || url.startsWith('/api/setup')) return url
          return undefined
        },
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})