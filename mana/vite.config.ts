import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        // Site façade (vitrine) + portail utilisateur (l'app)
        facade: resolve(__dirname, 'index.html'),
        portail: resolve(__dirname, 'portail.html'),
      },
    },
  },
})
