import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // strictPort: the server's CORS allows only :5173, so fail instead of drifting to :5174.
  server: { port: 5173, strictPort: true },
})
