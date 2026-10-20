/**
 * AWS Signature Version 4 for S3 requests, pure apart from `node:crypto` (Media-Storage-Plan D10: the SDK adds
 * about 1.5 MB to api/index.mjs, so the S3 client is our own signer on global fetch).
 * Path-style only: the caller passes the already built path (`/<bucket>/<key>`).
 */
import { createHash, createHmac } from 'node:crypto'

const ALGORITHM = 'AWS4-HMAC-SHA256'
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'

export interface Credentials {
  accessKeyId: string
  secretAccessKey: string
}

export interface SigningScope {
  region: string
  service: string
}

export type QueryPairs = ReadonlyArray<readonly [string, string]>

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export const EMPTY_PAYLOAD_SHA256 = sha256Hex('')

/** RFC 3986 percent-encoding as SigV4 wants it: unreserved characters stay, everything else is %XX (uppercase). */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = ''
  for (const byte of new TextEncoder().encode(value)) {
    const ch = String.fromCharCode(byte)
    if (/[A-Za-z0-9_.~-]/.test(ch)) out += ch
    else if (ch === '/' && !encodeSlash) out += ch
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** Encodes an object key path segment by segment (slashes kept). */
export function encodePath(path: string): string {
  return path.split('/').map((segment) => uriEncode(segment, true)).join('/')
}

/** `20150830T123600Z` and `20150830` from a Date. */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

/** Query string in canonical form: names and values encoded, sorted by name then value. */
export function canonicalQuery(pairs: QueryPairs): string {
  return pairs
    .map(([name, value]) => [uriEncode(name), uriEncode(value)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
}

/** Lowercased, trimmed, sorted header names and values; `signedHeaders` is the `;`-joined name list. */
export function canonicalHeaders(headers: Readonly<Record<string, string>>): { block: string; signedHeaders: string } {
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return {
    block: entries.map(([name, value]) => `${name}:${value}\n`).join(''),
    signedHeaders: entries.map(([name]) => name).join(';'),
  }
}

export function canonicalRequest(input: {
  method: string
  path: string
  query: QueryPairs
  headers: Readonly<Record<string, string>>
  payloadHash: string
}): { text: string; signedHeaders: string } {
  const headers = canonicalHeaders(input.headers)
  const text = [
    input.method,
    input.path,
    canonicalQuery(input.query),
    headers.block,
    headers.signedHeaders,
    input.payloadHash,
  ].join('\n')
  return { text, signedHeaders: headers.signedHeaders }
}

export function credentialScope(dateStamp: string, scope: SigningScope): string {
  return `${dateStamp}/${scope.region}/${scope.service}/aws4_request`
}

export function stringToSign(amzDate: string, dateStamp: string, scope: SigningScope, canonical: string): string {
  return [ALGORITHM, amzDate, credentialScope(dateStamp, scope), sha256Hex(canonical)].join('\n')
}

function hmac(key: string | Uint8Array, data: string): Uint8Array {
  return createHmac('sha256', key).update(data).digest()
}

/** kSigning = HMAC(HMAC(HMAC(HMAC("AWS4" + secret, date), region), service), "aws4_request"). */
export function signingKey(secretAccessKey: string, dateStamp: string, scope: SigningScope): Uint8Array {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, scope.region)
  const kService = hmac(kRegion, scope.service)
  return hmac(kService, 'aws4_request')
}

export function signature(key: Uint8Array, toSign: string): string {
  return createHmac('sha256', key).update(toSign).digest('hex')
}

export interface SignRequestInput {
  method: string
  path: string
  query?: QueryPairs
  /** Must contain `host`; other headers (range, content-type, ...) are signed as given. */
  headers: Readonly<Record<string, string>>
  payloadHash: string
  credentials: Credentials
  scope: SigningScope
  now: Date
}

/**
 * Header-based signature. Returns the headers to send (everything except `host`, which the HTTP client sets):
 * the given headers plus `x-amz-date`, `x-amz-content-sha256` and `Authorization`.
 */
export function signRequest(input: SignRequestInput): Record<string, string> {
  const { amzDate, dateStamp } = amzDates(input.now)
  const headers: Record<string, string> = {
    ...input.headers,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate,
  }
  const canonical = canonicalRequest({
    method: input.method,
    path: input.path,
    query: input.query ?? [],
    headers,
    payloadHash: input.payloadHash,
  })
  const sig = signature(
    signingKey(input.credentials.secretAccessKey, dateStamp, input.scope),
    stringToSign(amzDate, dateStamp, input.scope, canonical.text),
  )
  const authorization =
    `${ALGORITHM} Credential=${input.credentials.accessKeyId}/${credentialScope(dateStamp, input.scope)}, ` +
    `SignedHeaders=${canonical.signedHeaders}, Signature=${sig}`
  const { host: _host, ...sent } = headers
  return { ...sent, Authorization: authorization }
}

export interface PresignInput {
  method: string
  /** Origin of the endpoint, e.g. `https://s3.us-east-1.amazonaws.com`. */
  endpoint: URL
  /** Encoded path, e.g. `/bucket/media/2026/<uuid>.webp`. */
  path: string
  /** Headers that must match the request exactly (besides `host`). */
  headers?: Readonly<Record<string, string>>
  credentials: Credentials
  scope: SigningScope
  now: Date
  expiresInSeconds: number
}

/** Query-string (presigned) URL with `UNSIGNED-PAYLOAD`, the form browsers use for a PUT. */
export function presignUrl(input: PresignInput): string {
  const { amzDate, dateStamp } = amzDates(input.now)
  const host = input.endpoint.host
  const headers: Record<string, string> = { ...(input.headers ?? {}), host }
  const query: Array<readonly [string, string]> = [
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${input.credentials.accessKeyId}/${credentialScope(dateStamp, input.scope)}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresInSeconds)],
    ['X-Amz-SignedHeaders', canonicalHeaders(headers).signedHeaders],
  ]
  const canonical = canonicalRequest({
    method: input.method,
    path: input.path,
    query,
    headers,
    payloadHash: UNSIGNED_PAYLOAD,
  })
  const sig = signature(
    signingKey(input.credentials.secretAccessKey, dateStamp, input.scope),
    stringToSign(amzDate, dateStamp, input.scope, canonical.text),
  )
  return `${input.endpoint.origin}${input.path}?${canonicalQuery(query)}&X-Amz-Signature=${sig}`
}
