import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Both the dev server and `vite preview` proxy /api to the ASP.NET Core API, so the browser never needs CORS.
// Everything binds to localhost only. VITE_API_ORIGIN overrides the target for the Playwright E2E suite,
// which runs its own isolated API instance; unset it means the normal port 5062 development API.
const proxy = { '/api': process.env.VITE_API_ORIGIN ?? 'http://localhost:5062' }

export default defineConfig({
  plugins: [react()],
  server: { host: 'localhost', port: 5174, strictPort: true, proxy },
  preview: { host: 'localhost', port: 5174, strictPort: true, proxy },
})
