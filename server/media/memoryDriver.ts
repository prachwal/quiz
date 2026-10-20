/**
 * In-memory StorageDriver for tests and `test:mcp` (MEDIA_DRIVER=memory). Objects live in a Map of this
 * process only. presignPut returns a `memory://` URL: there is no HTTP endpoint to PUT to.
 */
import { MEDIA_CACHE_CONTROL, MEDIA_MEMORY_DEFAULT_BASE_URL, MEDIA_PRESIGN_MAX_SECONDS } from './constants'
import type { PresignPutOptions, StorageDriver } from './driver'

interface StoredObject {
  bytes: Uint8Array
  contentType: string
}

export class MemoryStorageDriver implements StorageDriver {
  private readonly objects = new Map<string, StoredObject>()
  private readonly publicBaseUrl: string

  constructor(publicBaseUrl: string = MEDIA_MEMORY_DEFAULT_BASE_URL) {
    this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, '')
  }

  async presignPut(key: string, options: PresignPutOptions): Promise<{ url: string; headers: Record<string, string> }> {
    if (!Number.isInteger(options.expiresInSeconds) || options.expiresInSeconds < 1 || options.expiresInSeconds > MEDIA_PRESIGN_MAX_SECONDS) {
      throw new RangeError('expiresInSeconds must be between 1 and 604800')
    }
    return {
      url: `memory://put/${key}`,
      headers: { 'Content-Type': options.contentType, 'Cache-Control': MEDIA_CACHE_CONTROL },
    }
  }

  async put(key: string, bytes: Uint8Array, options: { contentType: string }): Promise<void> {
    this.objects.set(key, { bytes: new Uint8Array(bytes), contentType: options.contentType })
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    const object = this.objects.get(key)
    if (!object) return null
    return { size: object.bytes.byteLength, contentType: object.contentType }
  }

  async getRange(key: string, start: number, end: number): Promise<Uint8Array | null> {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new RangeError('getRange: expected 0 <= start <= end')
    }
    const object = this.objects.get(key)
    if (!object) return null
    if (start >= object.bytes.byteLength) return new Uint8Array(0)
    return object.bytes.slice(start, Math.min(end, object.bytes.byteLength - 1) + 1)
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key)
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`
  }
}
