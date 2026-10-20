/**
 * Storage driver interface and the factory that picks a driver from MEDIA_DRIVER.
 * The factory is never called at import time: getStorage() reads the environment on first use.
 */
import { type MediaConfig, type MediaEnv, resolveMediaConfig } from './config'
import { MemoryStorageDriver } from './memoryDriver'
import { S3StorageDriver } from './s3Driver'

export interface PresignPutOptions {
  contentType: string
  /** When given, the signature covers Content-Length, so the upload must have exactly this size. */
  contentLength?: number
  expiresInSeconds: number
}

export interface StorageDriver {
  /** A URL and the headers the browser must send with the PUT (the signed ones). */
  presignPut(key: string, options: PresignPutOptions): Promise<{ url: string; headers: Record<string, string> }>
  put(key: string, bytes: Uint8Array, options: { contentType: string }): Promise<void>
  head(key: string): Promise<{ size: number; contentType: string } | null>
  /** Inclusive byte range, like the HTTP `Range` header. `null` when the key does not exist. */
  getRange(key: string, start: number, end: number): Promise<Uint8Array | null>
  /** Idempotent: removing a missing key succeeds. */
  remove(key: string): Promise<void>
  publicUrl(key: string): string
}

export function createStorage(config: MediaConfig): StorageDriver {
  if (config.driver === 'memory') return new MemoryStorageDriver(config.publicBaseUrl, config.memoryDir)
  if (!config.s3) throw new Error('createStorage: s3 settings are missing')
  return new S3StorageDriver({ ...config.s3, publicBaseUrl: config.publicBaseUrl })
}

let cached: StorageDriver | null = null

/**
 * The driver for the current environment (`MEDIA_DRIVER`, default `s3`). Throws when the s3 driver is selected
 * and not configured. The instance is cached for the process; a non-default env object is not cached.
 */
export function getStorage(env: MediaEnv = process.env): StorageDriver {
  if (env !== process.env) return createStorage(resolveMediaConfig(env))
  cached ??= createStorage(resolveMediaConfig(process.env))
  return cached
}
