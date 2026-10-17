import { useEffect } from 'react'

/** Browser chrome colors (status bar / address bar), matching the header surface of brandTheme. */
export const THEME_COLORS = { light: '#ffffff', dark: '#161722' } as const

/**
 * Syncs document-level theme hints with the theme actually rendered: `data-theme` (page background
 * on overscroll), `color-scheme` (native controls, scrollbars) and the `theme-color` metas.
 */
export function useDocumentTheme(dark: boolean) {
  useEffect(() => {
    const root = document.documentElement
    const mode = dark ? 'dark' : 'light'
    root.dataset.theme = mode
    root.style.colorScheme = mode
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute('content', THEME_COLORS[mode]))
  }, [dark])
}
