import type { IncomingMessage, ServerResponse } from 'node:http'
import { createApp } from '../server/app'

// Vercel does not expand a catch-all `[...path]` function, so every /api/* request is rewritten
// to the bundled `api/index.js` and the original path travels in `__original`. Restore it before
// Express sees it (the app strips the /api prefix itself, exactly like on Netlify).
//
// This file is bundled by esbuild (`npm run build:api`) because the server sources use extensionless
// ESM imports, which Node on Vercel would not resolve.
const app = createApp()

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const [pathname, search = ''] = (req.url ?? '/').split('?')
  const params = new URLSearchParams(search)
  const original = params.get('__original')
  if (original) {
    params.delete('__original')
    const rest = params.toString()
    req.url = `${pathname === '/api/index' ? original : pathname}${rest ? `?${rest}` : ''}`
  }
  return app(req, res)
}
