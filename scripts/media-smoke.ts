/**
 * M0 smoke test of the media bucket (Media-Storage-Plan, "Runbook M0"). Uses the real s3 driver of the server
 * (server/media/driver.ts, s3Driver.ts, sigv4.ts) with the S3_* and MEDIA_* settings of this environment.
 *
 * It writes two tiny PNG objects under `<S3_KEY_PREFIX>smoke/`, checks them, removes them (always, even after a
 * failure) and prints a PASS / FAIL / INFO table. Secrets and signatures are never printed.
 *
 *   npm run media:smoke -- --dry   only validates the configuration: names of missing variables, no values
 *   npm run media:smoke            the full check; contacts the bucket and needs the variables
 *
 * npm bundles this file with esbuild and runs it with .env and .env.local (like the MCP e2e test). It is never run
 * by CI or by `npm test`. Exit code: 0 when every required step passes, 1 otherwise.
 * Optional: MEDIA_SMOKE_ORIGIN (the app origin for the CORS checks; the first value is used; default
 * https://quiz-vercel-rho.vercel.app).
 */
import { randomUUID } from 'node:crypto'
import { resolveMediaConfig, type MediaConfig } from '../server/media/config'
import { createStorage, type StorageDriver } from '../server/media/driver'

/** Variables the s3 driver needs (the list is repeated here on purpose: the script names them, it never prints values). */
const REQUIRED = ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_BASE_URL'] as const
const OPTIONAL = ['S3_ENDPOINT', 'S3_FORCE_PATH_STYLE', 'S3_KEY_PREFIX', 'MEDIA_DRIVER', 'MEDIA_MAX_BYTES', 'MEDIA_SMOKE_ORIGIN'] as const
const SECRETS = ['S3_SECRET_ACCESS_KEY', 'S3_ACCESS_KEY_ID'] as const

/** A 1x1 transparent PNG: the smallest object that the server's sniffer would accept as an image. */
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

type Status = 'PASS' | 'FAIL' | 'INFO'
const rows: { step: string; status: Status; detail: string }[] = []
let secretValues: string[] = []

const env = process.env
const value = (name: string): string => (env[name] ?? '').trim()

/** Removes signatures and credentials from any text that is printed. */
function redact(text: string): string {
  let out = text.replace(/X-Amz-[A-Za-z-]+=[^&\s"']*/gi, (match) => `${match.split('=')[0]}=***`)
  for (const secret of secretValues) out = out.split(secret).join('***')
  return out
}

/** A URL without its query string (the signature lives there); a presigned URL shows that it has one. */
function maskUrl(raw: string): string {
  const url = new URL(raw)
  return url.search ? `${url.origin}${url.pathname}?<query masked>` : `${url.origin}${url.pathname}`
}

function record(step: string, status: Status, detail: string) {
  rows.push({ step, status, detail: redact(detail) })
}

/** Runs one check: its return value is the detail of a PASS; a throw is a FAIL with the message. */
async function check(step: string, work: () => Promise<string>): Promise<boolean> {
  try {
    record(step, 'PASS', await work())
    return true
  } catch (error) {
    record(step, 'FAIL', error instanceof Error ? error.message : String(error))
    return false
  }
}

function printTable() {
  const width = Math.max(...rows.map((row) => row.step.length), 4)
  console.log('')
  for (const row of rows) console.log(`${row.status.padEnd(4)}  ${row.step.padEnd(width)}  ${row.detail}`)
  console.log('')
}

/** `--dry`: names of the variables, their state and the validated settings. Never a value of a secret. */
function dryRun(): number {
  console.log('Media smoke, --dry (configuration only, nothing is contacted)')
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    const state = value(name) === '' ? (REQUIRED.includes(name as never) ? 'MISSING' : 'default') : 'set'
    console.log(`  ${name.padEnd(24)} ${state}`)
  }
  const missing = REQUIRED.filter((name) => value(name) === '')
  if (missing.length > 0) {
    console.log(`\nMissing: ${missing.join(', ')}. Set them in .env.local (see .env.example and the runbook in docs/Media-Storage-Plan.md).`)
    return 1
  }
  try {
    const config = resolveMediaConfig(env)
    console.log(`\nConfiguration is valid: driver ${config.driver}, endpoint host ${new URL(config.s3?.endpoint ?? 'https://invalid').host}, public origin ${new URL(config.publicBaseUrl).origin}, key prefix "${config.keyPrefix}".`)
    return 0
  } catch (error) {
    console.log(`\nConfiguration is invalid: ${redact((error as Error).message)}`)
    return 1
  }
}

async function main(): Promise<number> {
  if (process.argv.includes('--dry')) return dryRun()

  if ((value('MEDIA_DRIVER') || 's3') !== 's3') {
    console.log('MEDIA_DRIVER must be s3 (or unset) for the smoke test: it checks the real bucket, not the memory driver.')
    return 1
  }
  let config: MediaConfig
  try {
    config = resolveMediaConfig({ ...env, MEDIA_DRIVER: 's3' })
  } catch (error) {
    console.log(`Configuration is invalid: ${redact((error as Error).message)}\nRun with --dry to see which variables are missing.`)
    return 1
  }
  secretValues = SECRETS.map((name) => value(name)).filter((secret) => secret.length >= 4)
  const storage: StorageDriver = createStorage(config)
  const origin = (value('MEDIA_SMOKE_ORIGIN') || 'https://quiz-vercel-rho.vercel.app').split(',')[0]!.trim()

  record('config', 'INFO', `bucket ${config.s3?.bucket}, region ${config.s3?.region}, endpoint ${new URL(config.s3!.endpoint).host}, path-style, key prefix "${config.keyPrefix}"`)
  record('public base', 'INFO', `${new URL(config.publicBaseUrl).origin} (MEDIA_PUBLIC_BASE_URL), app origin for CORS: ${new URL(origin).origin}`)

  // every object this run creates is under <prefix>smoke/, so a cleanup can never touch a real file
  const base = `${config.keyPrefix}smoke/${randomUUID()}`
  const serverKey = `${base}.png`
  const browserKey = `${base}-presigned.png`
  const png = Buffer.from(TINY_PNG_BASE64, 'base64')
  let publicUrl = ''

  try {
    await check('put (server, object written by the driver)', async () => {
      await storage.put(serverKey, png, { contentType: 'image/png' })
      return `${png.length} B written`
    })

    await check('head (size of the stored object)', async () => {
      const head = await storage.head(serverKey)
      if (!head) throw new Error('the object is not there after the put (HEAD returned 404)')
      if (head.size !== png.length) throw new Error(`size ${head.size} B, expected ${png.length} B`)
      return `size ${head.size} B, content-type ${head.contentType || '(none)'}`
    })

    await check('getRange (first 8 bytes are the PNG signature)', async () => {
      const bytes = await storage.getRange(serverKey, 0, 7)
      if (!bytes || bytes.length !== 8 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) throw new Error('the range does not start with the PNG signature')
      return 'bytes 0-7 match'
    })

    publicUrl = storage.publicUrl(serverKey)
    record('public url format', 'INFO', maskUrl(publicUrl))

    await check('anonymous GET of the public URL', async () => {
      const response = await fetch(publicUrl)
      const type = response.headers.get('content-type') ?? ''
      await response.arrayBuffer()
      if (response.status !== 200) throw new Error(`HTTP ${response.status} without credentials (public_read is needed)`)
      if (!type.startsWith('image/png')) throw new Error(`content-type "${type}", expected image/png`)
      return `HTTP 200, content-type ${type}, cache-control ${response.headers.get('cache-control') ?? '(none)'}`
    })

    await check('presigned PUT (browser path, only the returned headers)', async () => {
      const signed = await storage.presignPut(browserKey, { contentType: 'image/png', contentLength: png.length, expiresInSeconds: 300 })
      record('presigned url', 'INFO', `${maskUrl(signed.url)} (signed headers: ${Object.keys(signed.headers).join(', ')})`)
      const response = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: png })
      const text = await response.text().catch(() => '')
      if (!response.ok) throw new Error(`HTTP ${response.status} ${redact(text).slice(0, 200)}`)
      return `HTTP ${response.status}`
    })

    const preflightHeaders = (response: Response) =>
      [...response.headers.entries()].filter(([name]) => name.startsWith('access-control-allow-') || name === 'vary').map(([name, v]) => `${name}: ${v}`).join('; ')

    await check('CORS preflight (OPTIONS on the presigned URL from the app origin)', async () => {
      const signed = await storage.presignPut(browserKey, { contentType: 'image/png', contentLength: png.length, expiresInSeconds: 300 })
      const response = await fetch(signed.url, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
      })
      await response.arrayBuffer().catch(() => undefined)
      const allowOrigin = response.headers.get('access-control-allow-origin')
      record('CORS preflight headers', 'INFO', `HTTP ${response.status}; ${preflightHeaders(response) || 'no access-control-allow-* headers'}`)
      if (allowOrigin !== origin && allowOrigin !== '*') throw new Error(`access-control-allow-origin is "${allowOrigin ?? '(missing)'}", expected ${origin}`)
      return `HTTP ${response.status}, allow-origin ${allowOrigin}`
    })

    await check('CORS on the public GET (simulated cross-origin image load)', async () => {
      const response = await fetch(publicUrl, { headers: { Origin: origin } })
      await response.arrayBuffer().catch(() => undefined)
      const allowOrigin = response.headers.get('access-control-allow-origin')
      if (allowOrigin !== origin && allowOrigin !== '*') throw new Error(`access-control-allow-origin is "${allowOrigin ?? '(missing)'}", expected ${origin}`)
      return `HTTP ${response.status}, allow-origin ${allowOrigin}`
    })
  } finally {
    // always: both objects are removed and the removal is checked with a HEAD request
    for (const [label, key] of [['server object', serverKey], ['presigned object', browserKey]] as const) {
      await check(`remove ${label}`, async () => {
        await storage.remove(key)
        return 'DELETE sent'
      })
      await check(`${label} is gone`, async () => {
        if ((await storage.head(key)) !== null) throw new Error('still there after the DELETE (on Neon a delete is a soft delete on the current branch)')
        return 'HEAD 404'
      })
    }
  }

  printTable()
  return rows.some((row) => row.status === 'FAIL') ? 1 : 0
}

main().then(
  (code) => {
    if (rows.length > 0 && !process.argv.includes('--dry')) console.log(rows.some((r) => r.status === 'FAIL') ? 'RESULT: FAIL (see the table)' : 'RESULT: PASS')
    process.exitCode = code
  },
  (error) => {
    console.error(`media smoke crashed: ${redact(error instanceof Error ? error.message : String(error))}`)
    process.exitCode = 1
  },
)
