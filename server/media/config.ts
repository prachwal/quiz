/**
 * Media configuration from environment variables (Media-Storage-Plan, "Konfiguracja").
 * Pure: takes the environment as an argument, so it can be tested without touching process.env.
 */
import { MEDIA_DEFAULT_MAX_BYTES, MEDIA_MEMORY_DEFAULT_BASE_URL } from './constants'
import { normalizeKeyPrefix } from './keys'

export type MediaEnv = Readonly<Record<string, string | undefined>>

export interface S3Settings {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export interface MediaConfig {
  driver: 's3' | 'memory'
  maxBytes: number
  publicBaseUrl: string
  keyPrefix: string
  /** Present only for the s3 driver. */
  s3: S3Settings | null
  /** Memory driver only: a directory that makes its objects visible to other processes (MEDIA_MEMORY_DIR). */
  memoryDir: string | null
}

const S3_REQUIRED = ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_BASE_URL'] as const

function value(env: MediaEnv, name: string): string {
  return (env[name] ?? '').trim()
}

function parseMaxBytes(raw: string): number {
  if (raw === '') return MEDIA_DEFAULT_MAX_BYTES
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error('MEDIA_MAX_BYTES must be a positive whole number of bytes')
  return Number(raw)
}

function parsePublicBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('MEDIA_PUBLIC_BASE_URL must be an absolute https URL')
  }
  if (url.protocol !== 'https:') throw new Error('MEDIA_PUBLIC_BASE_URL must use https')
  return raw.replace(/\/+$/, '')
}

/**
 * The public base URL alone, for building `url` in API responses. Needs no other setting (the stored key
 * already carries `S3_KEY_PREFIX`), never touches the storage driver, and never throws: null when unset or invalid.
 */
export function publicBaseUrlOf(env: MediaEnv): string | null {
  const raw = value(env, 'MEDIA_PUBLIC_BASE_URL')
  if (raw === '') return null
  try {
    return parsePublicBaseUrl(raw)
  } catch {
    return null
  }
}

/** The public address of a stored object: `<base>/<key>` (keys are immutable, see MEDIA_CACHE_CONTROL). */
export const mediaUrlFor = (baseUrl: string, key: string): string => `${baseUrl.replace(/\/+$/, '')}/${key}`

/**
 * Resolves the media configuration. Throws a Polish error naming the missing variables when the s3 driver
 * is selected (the default) and not configured.
 */
export function resolveMediaConfig(env: MediaEnv): MediaConfig {
  const driverRaw = value(env, 'MEDIA_DRIVER') || 's3'
  if (driverRaw !== 's3' && driverRaw !== 'memory') {
    throw new Error(`MEDIA_DRIVER ma nieznaną wartość "${driverRaw}" (dozwolone: s3, memory).`)
  }
  const maxBytes = parseMaxBytes(value(env, 'MEDIA_MAX_BYTES'))
  const keyPrefix = normalizeKeyPrefix(value(env, 'S3_KEY_PREFIX'))

  if (driverRaw === 'memory') {
    const publicBaseUrl = value(env, 'MEDIA_PUBLIC_BASE_URL')
    return {
      driver: 'memory',
      maxBytes,
      keyPrefix,
      publicBaseUrl: publicBaseUrl ? parsePublicBaseUrl(publicBaseUrl) : MEDIA_MEMORY_DEFAULT_BASE_URL,
      s3: null,
      memoryDir: value(env, 'MEDIA_MEMORY_DIR') || null,
    }
  }

  const missing = S3_REQUIRED.filter((name) => value(env, name) === '')
  if (missing.length > 0) {
    throw new Error(
      `Magazyn mediów (MEDIA_DRIVER=s3) nie jest skonfigurowany, brakuje zmiennych: ${missing.join(', ')}. ` +
        'Ustaw je (zob. .env.example) albo ustaw MEDIA_DRIVER=memory (tylko testy).',
    )
  }
  const region = value(env, 'S3_REGION')
  const forcePathStyle = value(env, 'S3_FORCE_PATH_STYLE')
  if (forcePathStyle !== '' && forcePathStyle !== 'true') {
    throw new Error('S3_FORCE_PATH_STYLE: obsługiwane jest tylko adresowanie path-style (wartość "true" albo brak).')
  }
  const endpoint = value(env, 'S3_ENDPOINT') || `https://s3.${region}.amazonaws.com`
  try {
    new URL(endpoint)
  } catch {
    throw new Error('S3_ENDPOINT must be an absolute URL')
  }
  return {
    driver: 's3',
    maxBytes,
    keyPrefix,
    publicBaseUrl: parsePublicBaseUrl(value(env, 'MEDIA_PUBLIC_BASE_URL')),
    memoryDir: null,
    s3: {
      endpoint: endpoint.replace(/\/+$/, ''),
      region,
      bucket: value(env, 'S3_BUCKET'),
      accessKeyId: value(env, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: value(env, 'S3_SECRET_ACCESS_KEY'),
    },
  }
}

/** True when MEDIA_DRIVER selects the memory driver (dev and tests). Reads only the environment, never storage. */
export const isMemoryDriver = (env: MediaEnv): boolean => value(env, 'MEDIA_DRIVER') === 'memory'

/**
 * `MEDIA_URL_FETCH=true` enables `media_upload_from_url` (the server fetches an image from an https address).
 * Off by default: the pinned fetcher is tested with fakes only, and the owner turns it on after checking the
 * connection pinning on the real Vercel runtime (Media-Storage-Plan, M5). Any other value keeps it off.
 */
export function urlFetchEnabled(env: MediaEnv): boolean {
  return value(env, 'MEDIA_URL_FETCH') === 'true'
}
