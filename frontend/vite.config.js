import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/search': 'http://localhost:3000',
      '/requests': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/config': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
})
