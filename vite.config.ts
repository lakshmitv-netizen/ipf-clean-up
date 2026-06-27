import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: true,
    strictPort: false,
  },
  preview: {
    port: parseInt(process.env.PORT || '5000'),
    host: true,
  },
})





