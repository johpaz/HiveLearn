import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El gateway protege `/api/*` con la cookie de sesión y comprueba que `Origin` sea el suyo.
// En desarrollo el navegador habla con Vite (otro origen): el proxy reescribe `Origin`, así que el
// navegador solo ve su propio origen y no hace falta tocar HIVELEARN_ALLOWED_ORIGINS.
const target = process.env.HIVELEARN_GATEWAY ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
        configure: proxy => proxy.on('proxyReq', request => { request.setHeader('origin', target) }),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // three.js va en su propio chunk porque la escena se importa de forma dinámica.
    chunkSizeWarningLimit: 800,
  },
})
