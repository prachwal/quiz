/**
 * Downloads one image for `media_upload_from_url` (Media-Storage-Plan, "C. MCP - media_upload_from_url").
 *
 * Everything that touches the network is injected (`FetchDeps`): name resolution and the HTTP request. The real
 * ones live in nodeTransport.ts; the tests use fakes only. This file imports no `node:` module on purpose.
 *
 * The defences, in the order they run for every hop:
 *  1. the URL passes checkImageUrl (https, port 443, no credentials, public host or IP literal);
 *  2. the name resolves to addresses, and ALL of them must be public (a mixed answer is refused);
 *  3. the request is made to the first of those addresses (the transport must connect there and nowhere else),
 *     so a second DNS answer cannot redirect the connection (DNS rebinding);
 *  4. redirects are followed by hand, each one through nextRedirect and back to step 2;
 *  5. the whole job has one time budget, and the body is counted on the stream (not by Content-Length).
 */
import { MEDIA_DEFAULT_MAX_BYTES } from './constants'
import { checkImageUrl, nextRedirect, reasonForIp } from './ssrf'

export type FetchErrorCode = 'refused' | 'network' | 'status' | 'size' | 'timeout'

/** Every failure of the fetcher. The message is Polish and user-facing; `code` tells the caller what happened. */
export class FetchImageError extends Error {
  readonly code: FetchErrorCode

  constructor(code: FetchErrorCode, message: string) {
    super(message)
    this.name = 'FetchImageError'
    this.code = code
  }
}

export interface FetchRequest {
  url: URL
  /** The only address the connection may use: the one that passed the checks. */
  address: string
  family: 4 | 6
  /** Exactly these headers and no others (no cookies, no client headers, no keep-alive reuse). */
  headers: Readonly<Record<string, string>>
  signal: AbortSignal
}

export interface FetchResponse {
  status: number
  headers: Readonly<Record<string, string | string[] | undefined>>
  body: AsyncIterable<Uint8Array>
  /** Frees the connection of a response whose body is not read (redirects, errors). */
  discard?: () => void
}

export interface FetchDeps {
  /** All addresses of a host name (like dns.lookup with `all: true`). */
  resolve: (hostname: string) => Promise<string[]>
  request: (request: FetchRequest) => Promise<FetchResponse>
  /** Clock for the time budget (milliseconds). Defaults to Date.now. */
  now?: () => number
}

export interface FetchLimits {
  /** Bytes counted on the stream; more aborts the download. */
  maxBytes: number
  /** Total time for the resolution, every hop and the body. */
  timeoutMs: number
}

export interface FetchedImage {
  bytes: Uint8Array
  /** The address after redirects (what the caller stores as the source). */
  finalUrl: string
}

export const FETCH_TIMEOUT_MS = 8000

/** The only headers the fetcher sends. */
export const FETCH_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'User-Agent': 'quiz-media-fetcher/1',
  Accept: 'image/png,image/jpeg,image/webp',
})

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** Internal: an operation was cancelled by the abort signal. */
class Aborted extends Error {}

/** Rejects as soon as `signal` aborts, even when `work` never settles (a hung DNS lookup or stream). */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    work.catch(() => undefined)
    return Promise.reject(new Aborted('aborted'))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Aborted('aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

const isIpLiteral = (hostname: string): boolean => hostname.startsWith('[') || /^[0-9.]+$/.test(hostname)

/**
 * The address to connect to for one hop. An IP literal is its own address (checkImageUrl has already judged it).
 * A name must resolve to at least one address and every address must be public; the first one is pinned.
 */
async function pinAddress(url: URL, deps: FetchDeps, signal: AbortSignal): Promise<string> {
  const host = url.hostname
  if (isIpLiteral(host)) {
    const ip = host.startsWith('[') ? host.slice(1, -1) : host
    const reason = reasonForIp(ip)
    if (reason) throw new FetchImageError('refused', `Adres odrzucony: ${reason}`)
    return ip
  }
  let addresses: string[]
  try {
    addresses = await raceAbort(deps.resolve(host), signal)
  } catch (error) {
    if (error instanceof Aborted) throw error
    throw new FetchImageError('network', `Nie udało się rozwiązać nazwy ${host}.`)
  }
  if (addresses.length === 0) throw new FetchImageError('network', `Nie udało się rozwiązać nazwy ${host}.`)
  for (const address of addresses) {
    const reason = reasonForIp(address)
    if (reason) throw new FetchImageError('refused', `Nazwa ${host} wskazuje też na niedozwolony adres. ${reason}`)
  }
  return addresses[0]
}

/**
 * Reads the body while counting bytes on the stream. Going over `maxBytes` aborts the request and the stream,
 * whatever Content-Length said.
 */
async function readCapped(body: AsyncIterable<Uint8Array>, maxBytes: number, controller: AbortController): Promise<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const step = await raceAbort(iterator.next(), controller.signal)
    if (step.done) break
    total += step.value.byteLength
    if (total > maxBytes) {
      controller.abort()
      iterator.return?.()?.catch(() => undefined)
      throw new FetchImageError('size', `Obraz jest większy niż dozwolone ${maxBytes} bajtów.`)
    }
    chunks.push(step.value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * Fetches an image over https. Resolves to the bytes (the caller sniffs the type) or throws FetchImageError.
 * `limits` defaults to MEDIA_DEFAULT_MAX_BYTES and 8 seconds; the server passes MEDIA_MAX_BYTES.
 */
export async function fetchImage(
  rawUrl: string,
  deps: FetchDeps,
  limits: FetchLimits = { maxBytes: MEDIA_DEFAULT_MAX_BYTES, timeoutMs: FETCH_TIMEOUT_MS },
): Promise<FetchedImage> {
  const now = deps.now ?? Date.now
  const started = now()
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, limits.timeoutMs)
  const timeout = () => new FetchImageError('timeout', `Pobieranie obrazu przekroczyło limit czasu (${Math.round(limits.timeoutMs / 1000)} s).`)

  try {
    const first = checkImageUrl(rawUrl)
    if (!first.ok) throw new FetchImageError('refused', `Adres odrzucony: ${first.reason}`)
    let url = first.url

    for (let hops = 0; ; hops++) {
      if (now() - started >= limits.timeoutMs) throw timeout()
      const address = await pinAddress(url, deps, controller.signal)
      const response = await raceAbort(
        deps.request({
          url,
          address,
          family: address.includes(':') ? 6 : 4,
          headers: FETCH_HEADERS,
          signal: controller.signal,
        }),
        controller.signal,
      )

      if (REDIRECT_STATUSES.has(response.status)) {
        response.discard?.()
        const location = response.headers.location
        // hops = redirects already followed; the fourth redirect is refused inside nextRedirect
        const next = nextRedirect(url, typeof location === 'string' ? location : null, hops)
        if (!next.ok) throw new FetchImageError('refused', `Przekierowanie odrzucone: ${next.reason}`)
        url = next.url
        continue
      }

      if (response.status !== 200) {
        response.discard?.()
        throw new FetchImageError('status', `Serwer odpowiedział kodem ${response.status} zamiast 200.`)
      }

      const declared = response.headers['content-length']
      const declaredBytes = Number(typeof declared === 'string' ? declared : NaN)
      if (Number.isFinite(declaredBytes) && declaredBytes > limits.maxBytes) {
        response.discard?.()
        throw new FetchImageError('size', `Obraz jest większy niż dozwolone ${limits.maxBytes} bajtów.`)
      }

      const bytes = await readCapped(response.body, limits.maxBytes, controller)
      return { bytes, finalUrl: url.href }
    }
  } catch (error) {
    if (error instanceof FetchImageError) throw error
    if (timedOut || error instanceof Aborted) throw timeout()
    const detail = error instanceof Error ? error.message : 'nieznany błąd'
    throw new FetchImageError('network', `Nie udało się pobrać obrazu (${detail}).`)
  } finally {
    clearTimeout(timer)
  }
}
