import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Netlify sets COMMIT_REF during builds; used as the Sentry release and sent with feedback
  define: { __APP_VERSION__: JSON.stringify(process.env.COMMIT_REF?.slice(0, 7) ?? 'dev') },
})
