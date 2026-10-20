/**
 * Which media addresses the browser may load. Defence in depth: the server already writes only its own
 * public addresses into the media map, but the page must not trust that alone.
 */
export interface MediaUrlPolicy {
  /** Public base URL of the bucket (`VITE_MEDIA_PUBLIC_BASE_URL`). Unset: any https address passes. */
  base?: string
  /** Development build: `http://localhost` is accepted for a local media server. */
  dev: boolean
}

export const defaultMediaUrlPolicy = (): MediaUrlPolicy => ({
  base: import.meta.env.VITE_MEDIA_PUBLIC_BASE_URL || undefined,
  dev: import.meta.env.DEV,
})

// the base is compared as a directory: `.../media` must not admit `.../media-evil/...`
const asDirectory = (href: string) => (href.endsWith('/') ? href : `${href}/`)

/** True only for an https address (or `http://localhost` in development) under the configured base. */
export function isTrustedMediaUrl(url: string, policy: MediaUrlPolicy = defaultMediaUrlPolicy()): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const localDev = policy.dev && parsed.protocol === 'http:' && parsed.hostname === 'localhost'
  if (parsed.protocol !== 'https:' && !localDev) return false
  if (parsed.username || parsed.password) return false
  if (!policy.base) return true
  let base: URL
  try {
    base = new URL(policy.base)
  } catch {
    return false
  }
  return parsed.href.startsWith(asDirectory(base.href))
}
