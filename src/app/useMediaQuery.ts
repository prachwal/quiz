import { useCallback, useSyncExternalStore } from 'react'

/** Phones (portrait and most landscape): matches the bottom tab bar / card-list breakpoint in index.css. */
export const PHONE_QUERY = '(max-width: 767.98px)'
/** Touch-first devices: bigger controls (44px+ targets). */
export const COARSE_QUERY = '(pointer: coarse)'

/**
 * Live `matchMedia` result. Read synchronously on the first render (unlike antd `Grid.useBreakpoint`,
 * which starts empty), so there is no flash of the wrong layout.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', callback)
      return () => media.removeEventListener('change', callback)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
