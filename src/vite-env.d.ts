/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Optional public base URL of the media bucket; images outside it are not rendered (see src/features/media/trustedUrl.ts). */
  readonly VITE_MEDIA_PUBLIC_BASE_URL?: string
}
