/**
 * S3-compatible StorageDriver on global fetch with our own SigV4 (sigv4.ts). Path-style addressing only.
 * Works with AWS S3, Neon Object Storage and R2 (any endpoint that speaks SigV4 path-style).
 */
import { MEDIA_CACHE_CONTROL, MEDIA_PRESIGN_MAX_SECONDS } from './constants'
import type { PresignPutOptions, StorageDriver } from './driver'
import { EMPTY_PAYLOAD_SHA256, encodePath, presignUrl, sha256Hex, signRequest } from './sigv4'

export interface S3DriverSettings {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
}

export class S3StorageDriver implements StorageDriver {
  private readonly endpoint: URL
  private readonly settings: S3DriverSettings
  private readonly now: () => Date

  constructor(settings: S3DriverSettings, now: () => Date = () => new Date()) {
    this.settings = settings
    this.endpoint = new URL(settings.endpoint)
    this.now = now
  }

  /** `/<bucket>/<key>`, encoded. The endpoint's origin is the only host ever used. */
  private objectPath(key: string): string {
    return `/${encodePath(this.settings.bucket)}/${encodePath(key)}`
  }

  private url(key: string): string {
    return `${this.endpoint.origin}${this.objectPath(key)}`
  }

  private credentials() {
    return { accessKeyId: this.settings.accessKeyId, secretAccessKey: this.settings.secretAccessKey }
  }

  private scope() {
    return { region: this.settings.region, service: 's3' }
  }

  /** Signed request headers (without `host`) for a call that carries `payloadHash` as its body digest. */
  private signed(method: string, key: string, extra: Record<string, string>, payloadHash: string): Record<string, string> {
    return signRequest({
      method,
      path: this.objectPath(key),
      headers: { host: this.endpoint.host, ...extra },
      payloadHash,
      credentials: this.credentials(),
      scope: this.scope(),
      now: this.now(),
    })
  }

  async presignPut(key: string, options: PresignPutOptions): Promise<{ url: string; headers: Record<string, string> }> {
    if (!Number.isInteger(options.expiresInSeconds) || options.expiresInSeconds < 1 || options.expiresInSeconds > MEDIA_PRESIGN_MAX_SECONDS) {
      throw new RangeError('expiresInSeconds must be between 1 and 604800')
    }
    const signedHeaders: Record<string, string> = {
      'content-type': options.contentType,
      'cache-control': MEDIA_CACHE_CONTROL,
    }
    if (options.contentLength !== undefined) signedHeaders['content-length'] = String(options.contentLength)
    const url = presignUrl({
      method: 'PUT',
      endpoint: this.endpoint,
      path: this.objectPath(key),
      headers: signedHeaders,
      credentials: this.credentials(),
      scope: this.scope(),
      now: this.now(),
      expiresInSeconds: options.expiresInSeconds,
    })
    // Content-Length is not returned: browsers set it from the body, and the signature requires it to match.
    return { url, headers: { 'Content-Type': options.contentType, 'Cache-Control': MEDIA_CACHE_CONTROL } }
  }

  async put(key: string, bytes: Uint8Array, options: { contentType: string }): Promise<void> {
    const headers = this.signed(
      'PUT',
      key,
      { 'content-type': options.contentType, 'cache-control': MEDIA_CACHE_CONTROL },
      sha256Hex(bytes),
    )
    const response = await fetch(this.url(key), { method: 'PUT', headers, body: bytes })
    if (!response.ok) throw new Error(`S3 PUT failed with status ${response.status}`)
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    const headers = this.signed('HEAD', key, {}, EMPTY_PAYLOAD_SHA256)
    const response = await fetch(this.url(key), { method: 'HEAD', headers })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`S3 HEAD failed with status ${response.status}`)
    return {
      size: Number(response.headers.get('content-length') ?? '0'),
      contentType: response.headers.get('content-type') ?? '',
    }
  }

  async getRange(key: string, start: number, end: number): Promise<Uint8Array | null> {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new RangeError('getRange: expected 0 <= start <= end')
    }
    const headers = this.signed('GET', key, { range: `bytes=${start}-${end}` }, EMPTY_PAYLOAD_SHA256)
    const response = await fetch(this.url(key), { method: 'GET', headers })
    if (response.status === 404) return null
    if (response.status === 416) return new Uint8Array(0)
    if (!response.ok) throw new Error(`S3 GET failed with status ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  }

  async remove(key: string): Promise<void> {
    const headers = this.signed('DELETE', key, {}, EMPTY_PAYLOAD_SHA256)
    const response = await fetch(this.url(key), { method: 'DELETE', headers })
    if (!response.ok && response.status !== 404) throw new Error(`S3 DELETE failed with status ${response.status}`)
  }

  publicUrl(key: string): string {
    return `${this.settings.publicBaseUrl.replace(/\/+$/, '')}/${encodePath(key)}`
  }
}
