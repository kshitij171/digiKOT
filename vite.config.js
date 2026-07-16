import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Ensure Set-Cookie from the API works when the UI is opened via a LAN IP. */
function fixProxyCookies(proxyRes) {
  const cookies = proxyRes.headers['set-cookie']
  if (!cookies) return
  const list = Array.isArray(cookies) ? cookies : [cookies]
  proxyRes.headers['set-cookie'] = list.map((cookie) =>
    cookie
      .replace(/;\s*Secure/gi, '')
      .replace(/;\s*Domain=[^;]*/gi, '')
      .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
  )
}

const apiProxy = {
  target: 'http://127.0.0.1:3000',
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('proxyRes', fixProxyCookies)
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': apiProxy,
      '/socket.io': {
        ...apiProxy,
        ws: true,
      },
    },
  },
})
