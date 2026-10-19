#!/usr/bin/env node
/**
 * Local full-stack dev server: serves the API (`/api/*` and `/.well-known/*`) through the same
 * bundled Express app that Vercel runs, and proxies everything else to Vite with HMR.
 *
 *   npm run dev:full        # builds api/index.mjs, then starts Vite + the proxy on :8888
 *
 * Why a proxy instead of two ports: the frontend calls `/api` relatively, so one origin (8888)
 * is what the browser needs. `LOCAL_DEV=true` is set here, which is the only switch that can
 * enable the DEV_AUTH_TOKEN login bypass (see server/devAuth.ts).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const PORT = Number(process.env.PORT ?? 8888)
const VITE_PORT = Number(process.env.VITE_PORT ?? 5173)

/**
 * `.env` first, then `.env.local`, which wins. `process.loadEnvFile` cannot do this: it never
 * overrides a variable that is already set, so the first file would win. Real shell variables
 * still take precedence over both files.
 */
const fromFiles = new Set()
const loadEnvFile = (file) => {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, raw] = match
    if (key in process.env && !fromFiles.has(key)) continue
    process.env[key] = raw.trim().replace(/^(['"])(.*)\1$/, '$2')
    fromFiles.add(key)
  }
}
loadEnvFile('.env')
loadEnvFile('.env.local')
process.env.LOCAL_DEV = 'true'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy the connection string into .env.local (see .env.example).')
  process.exit(1)
}

const bundle = new URL('../api/index.mjs', import.meta.url)
if (!existsSync(bundle)) {
  console.error('api/index.mjs is missing - run `npm run build:api` first.')
  process.exit(1)
}
const { default: handler } = await import(bundle.href)

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const vite = spawn(npx, ['vite', '--port', String(VITE_PORT), '--strictPort'], { stdio: 'inherit' })

let closing = false
const shutdown = (code = 0) => {
  if (closing) return
  closing = true
  vite.kill('SIGTERM')
  server.close(() => process.exit(code))
  setTimeout(() => process.exit(code), 1000).unref()
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
vite.on('exit', (code) => {
  if (!closing) shutdown(code ?? 0)
})

/** Vite is proxied for everything the API does not own. */
const proxy = (req, res) => {
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: VITE_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${VITE_PORT}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (res.headersSent) return res.end()
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Vite is still starting - reload in a moment.')
  })
  req.pipe(upstream)
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/'
  if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) return handler(req, res)
  if (url.startsWith('/.well-known/')) return handler(req, res)
  return proxy(req, res)
})

// Vite's HMR websocket has to be tunnelled too, otherwise the page never hot-reloads.
server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(VITE_PORT, '127.0.0.1', () => {
    const lines = Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`)
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`)
    if (head?.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})

server.listen(PORT, async () => {
  // give Vite a head start so the first page load does not land on a 502
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await new Promise((resolve) => {
      const probe = net.connect(VITE_PORT, '127.0.0.1')
      probe.on('connect', () => (probe.destroy(), resolve(true)))
      probe.on('error', () => resolve(false))
    })
    if (ready) break
    await delay(100)
  }
  console.log(`\n  App      http://localhost:${PORT}`)
  console.log(`  API      http://localhost:${PORT}/api/health`)
  console.log(`  Vite     http://localhost:${VITE_PORT} (proxied)\n`)
})
