import { useSyncExternalStore } from 'react'
import { useAppSelector } from './hooks'

const query = '(prefers-color-scheme: dark)'

const subscribe = (callback: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

const getSnapshot = () => window.matchMedia(query).matches

/** Follows the OS color scheme live. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Resolves the `system` theme mode to a concrete light/dark value and follows OS changes. */
export function useResolvedTheme(): 'light' | 'dark' {
  const mode = useAppSelector((state) => state.settings.themeMode)
  const systemDark = useSystemDark()
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}
