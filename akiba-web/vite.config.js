import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Serves /api from server/app.js inside the Vite dev server, so local dev
// matches production (same origin, no CORS, no second process). Loaded via
// ssrLoadModule so edits to server/ apply without restarting.
function devApi() {
  return {
    name: 'akiba-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()
        const { handle } = await server.ssrLoadModule('/server/app.js')
        handle(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Server-side secrets (JWT_SIGNING_KEY, optional DATABASE_URL) come from
  // .env.local. Only VITE_-prefixed vars ever reach the browser bundle.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''), {
    PGLITE_DIR: process.env.PGLITE_DIR || '.data/pglite',
  })

  return {
    plugins: [react(), devApi()],
  }
})
