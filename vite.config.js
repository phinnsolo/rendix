import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo, /api/* lo atiende la misma API que corre en Vercel (server/router.js), con las variables de .env.
function api() {
  return {
    name: 'rendix-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''))
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()
        const { handle } = await server.ssrLoadModule('/server/router.js')
        handle(req, res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), api()],
})
