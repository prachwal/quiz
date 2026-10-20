import { api } from '../../app/api'
import { getAccessToken } from '../auth/token'
import type { MediaUploadCompleted, MediaUploadStarted, MediaUploadStartInput } from '../../shared/media/upload'

/** Browser upload endpoints (Media-Storage-Plan M6). Hooks are imported from this module, like the other features. */
export const mediaApi = api.injectEndpoints({
  endpoints: (build) => ({
    createMediaUpload: build.mutation<MediaUploadStarted, MediaUploadStartInput>({
      query: (body) => ({ url: 'media/uploads', method: 'POST', body }),
    }),
    completeMediaUpload: build.mutation<MediaUploadCompleted, string>({
      query: (mediaId) => ({ url: `media/${encodeURIComponent(mediaId)}/complete`, method: 'POST' }),
    }),
  }),
})

export const { useCreateMediaUploadMutation, useCompleteMediaUploadMutation } = mediaApi

/** Where the bytes go, as returned by the server (`upload` of MediaUploadStarted). */
export interface MediaUploadTarget {
  url: string
  method: 'PUT'
  headers: Record<string, string>
}

/**
 * Sends the bytes with a PUT. A same-origin target (the memory driver, dev and tests) is the API, so it gets the
 * Bearer token; an absolute target is the presigned storage URL and gets exactly the headers the server returned,
 * and no Authorization header. Never logs the bytes or the URL's query string.
 */
export async function putMediaBytes(target: MediaUploadTarget, bytes: Uint8Array): Promise<void> {
  const sameOrigin = target.url.startsWith('/')
  const headers: Record<string, string> = { ...target.headers }
  if (sameOrigin) {
    const token = await getAccessToken()
    if (token) headers.authorization = `Bearer ${token}`
  }
  const response = await fetch(target.url, { method: target.method, headers, body: bytes as BodyInit })
  if (!response.ok) throw new Error(`Nie udało się wysłać obrazka do magazynu (kod ${response.status}). Spróbuj ponownie.`)
}
