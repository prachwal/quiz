import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vercel exposes the commit SHA during builds; used as the Sentry release and sent with feedback
  define: {
    __APP_VERSION__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA)?.slice(0, 7) ?? 'dev'),
  },
})
