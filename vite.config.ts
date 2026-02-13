import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Enable polling for WSL2 on Windows drives
      usePolling: true,
      interval: 1000,
    },
  },
})
