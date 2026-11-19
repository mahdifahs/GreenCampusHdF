import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Le backend tourne sur :4000 (npm run dev dans backend/) ; ce proxy permet d'appeler
    // l'API en chemins relatifs (fetch('/api/...')), comme le fait déjà backend/admin/admin.js.
    // API_URL : autre API que celle de dev (parcours Playwright, voir e2e/). `vite preview`
    // reprend ce proxy (preview.proxy vaut server.proxy par défaut).
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:4000',
    },
  },
})
