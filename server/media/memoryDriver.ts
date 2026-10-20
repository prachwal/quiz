/**
 * In-memory StorageDriver for tests and `test:mcp` (MEDIA_DRIVER=memory). Objects live in a Map of this process
 * only, or - when a directory is given (MEDIA_MEMORY_DIR) - as files there, so that a second process (the e2e
 * script next to the dev server) can read what the server stored. presignPut returns a `memory://` URL: there is
 * no HTTP endpoint to PUT to.
 */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { MEDIA_CACHE_CONTROL, MEDIA_MEMORY_DEFAULT_BASE_URL, MEDIA_PRESIGN_MAX_SECONDS } from './constants'
import type { PresignPutOptions, StorageDriver } from './driver'

interface StoredObject {
  bytes: Uint8Array
  contentType: string
}

export class MemoryStorageDriver implements StorageDriver {
  private readonly objects = new Map<string, StoredObject>()
  private readonly publicBaseUrl: string
  private readonly directory: string | null

  constructor(publicBaseUrl: string = MEDIA_MEMORY_DEFAULT_BASE_URL, directory: string | null = null) {
    this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, '')
    this.directory = directory
  }

  private pathOf(key: string): string {
    if (this.directory === null) throw new Error('memory driver: no directory')
    if (key.startsWith('/') || key.split('/').some((part) => part === '' || part === '..' || part === '.')) {
      throw new Error('memory driver: unsafe key')
    }
    return join(this.directory, key)
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
    if (this.directory !== null) {
      const path = this.pathOf(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
      await writeFile(`${path}.type`, options.contentType)
      return
    }
    this.objects.set(key, { bytes: new Uint8Array(bytes), contentType: options.contentType })
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    if (this.directory !== null) {
      const path = this.pathOf(key)
      try {
        const [info, type] = await Promise.all([stat(path), readFile(`${path}.type`, 'utf8')])
        return { size: info.size, contentType: type }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    }
    const object = this.objects.get(key)
    if (!object) return null
    return { size: object.bytes.byteLength, contentType: object.contentType }
  }

  async getRange(key: string, start: number, end: number): Promise<Uint8Array | null> {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new RangeError('getRange: expected 0 <= start <= end')
    }
    let object: StoredObject | undefined
    if (this.directory !== null) {
      const head = await this.head(key)
      if (!head) return null
      object = { bytes: new Uint8Array(await readFile(this.pathOf(key))), contentType: head.contentType }
    } else {
      object = this.objects.get(key)
    }
    if (!object) return null
    if (start >= object.bytes.byteLength) return new Uint8Array(0)
    return object.bytes.slice(start, Math.min(end, object.bytes.byteLength - 1) + 1)
  }

  async remove(key: string): Promise<void> {
    if (this.directory !== null) {
      const path = this.pathOf(key)
      await rm(path, { force: true })
      await rm(`${path}.type`, { force: true })
      return
    }
    this.objects.delete(key)
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`
  }
}
