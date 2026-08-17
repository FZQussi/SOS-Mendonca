import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em dev nativo o servidor está em localhost; dentro do Compose está no host
// `server`, porque aí localhost é o próprio container do painel.
const api = process.env.API_URL ?? 'http://localhost:3000'

// O build sai para server/public/ — o Express serve o painel do mesmo processo
// e da mesma origem, o que evita CORS e um segundo túnel (Context.md §2).
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../server/public', emptyOutDir: true },
  server: {
    // Dentro do Compose, os eventos de ficheiro do Windows não chegam ao
    // container — sem polling o HMR nunca dispara. Ver POLL no compose.override.
    watch: process.env.POLL ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      '/api': api,
      '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
    },
  },
})
