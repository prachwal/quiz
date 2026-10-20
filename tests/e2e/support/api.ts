import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { assertRemoteDbAllowed } from './guard'

/** The local full stack started by playwright.config.ts (the same origin the browser uses). */
export const API_BASE = 'http://localhost:8888'

/** The random login-bypass token of this run, set by scripts/e2e-browser.sh (never printed). */
function devToken(): string {
  const token = process.env.DEV_AUTH_TOKEN
  if (!token) throw new Error('DEV_AUTH_TOKEN is not set: run the suite through npm run test:e2e')
  return token
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  assertRemoteDbAllowed()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${devToken()}`)
  return fetch(new URL(path, API_BASE), { ...init, headers })
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init)
  const text = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${response.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text) as T
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function createQuizViaApi(quiz: unknown): Promise<{ id: string }> {
  return apiJson<{ id: string }>('/api/quizzes', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(quiz) })
}

/** Deletes a quiz and its media references (the REST delete does both); an already missing quiz is fine. */
export async function deleteQuizViaApi(id: string): Promise<void> {
  const response = await apiFetch(`/api/quizzes/${id}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw new Error(`DELETE quiz ${id} answered ${response.status}`)
}

export interface UploadedImage {
  mediaId: string
  reused: boolean
  url: string
  width: number
  height: number
}

interface UploadStarted {
  mediaId: string
  reused: boolean
  status: 'ready' | 'pending'
  url?: string
  width?: number
  height?: number
  upload?: { url: string; method: 'PUT'; headers: Record<string, string> }
}

/**
 * The upload flow of the API, as the editor runs it: start (POST /api/media/uploads), PUT the bytes to the presigned
 * bucket URL with exactly the returned headers and no Authorization, then complete. A `reused` answer skips the PUT.
 */
export async function uploadImageViaApi(png: Buffer, alt: string): Promise<UploadedImage> {
  const sha256 = createHash('sha256').update(png).digest('hex')
  const started = await apiJson<UploadStarted>('/api/media/uploads', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ contentType: 'image/png', size: png.length, sha256, alt }),
  })
  if (started.status === 'ready' || !started.upload) {
    return { mediaId: started.mediaId, reused: true, url: started.url ?? '', width: started.width ?? 0, height: started.height ?? 0 }
  }
  const put = await fetch(started.upload.url, { method: 'PUT', headers: started.upload.headers, body: new Uint8Array(png) })
  if (!put.ok) throw new Error(`PUT to the bucket answered ${put.status}`)
  const done = await apiJson<{ mediaId: string; url: string; width: number; height: number }>(`/api/media/${started.mediaId}/complete`, {
    method: 'POST',
  })
  return { mediaId: done.mediaId, reused: false, url: done.url, width: done.width, height: done.height }
}

/**
 * Deletes media through the MCP tool `media_delete` (with confirm), which also removes the bucket object. The media
 * must have no references left (the callers remove quizzes, lessons and verb illustrations first).
 */
export async function mediaDeleteViaMcp(mediaIds: string[]): Promise<string[]> {
  assertRemoteDbAllowed()
  if (mediaIds.length === 0) return []
  const client = new Client({ name: 'e2e-browser', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/api/mcp', API_BASE), {
      requestInit: { headers: { Authorization: `Bearer ${devToken()}` } },
    }),
  )
  const failures: string[] = []
  try {
    for (const mediaId of mediaIds) {
      const result = await client.callTool({ name: 'media_delete', arguments: { mediaId, confirm: true } })
      const first = (result.content as { text?: string }[])[0]
      if (result.isError) failures.push(`${mediaId}: ${first?.text ?? 'error'}`)
    }
  } finally {
    await client.close()
  }
  return failures
}
