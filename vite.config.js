import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { whatsappApiPlugin } from './server/viteWhatsappApiPlugin.js'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), whatsappApiPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        bypass: (req) => (req.url?.startsWith('/api/whatsapp') ? req.url : undefined),
      },
    },
  },
})