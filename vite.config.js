import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { localApi } from '@kato8/core/vite'

// `npm run dev` serves the Vercel-style handlers in /api too (dev only; production uses vercel.json).
export default defineConfig(({ mode }) => ({
  plugins: [react(), localApi(loadEnv(mode, process.cwd(), ''))],
  server: { port: 5175 },
}))
