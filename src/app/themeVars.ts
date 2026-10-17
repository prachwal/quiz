import { theme } from 'antd'
import type { CSSProperties } from 'react'

/** Exposes a few antd tokens as CSS custom properties for the rules in index.css (hover, focus, shadows). */
export function useThemeVars(): CSSProperties {
  const { token } = theme.useToken()
  const dark = token.colorBgBase === '#000' || token.colorBgBase === '#000000'
  return {
    '--app-primary': token.colorPrimary,
    '--app-primary-hover': token.colorPrimaryHover,
    '--app-primary-bg': token.colorPrimaryBg,
    '--app-primary-border': token.colorPrimaryBorder,
    '--app-text': token.colorText,
    '--app-text-secondary': token.colorTextSecondary,
    '--app-fill': token.colorFillTertiary,
    '--app-border': token.colorBorderSecondary,
    '--app-surface': token.colorBgContainer,
    '--app-shadow-sm': dark
      ? '0 1px 2px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)'
      : '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
    '--app-shadow-md': dark
      ? '0 12px 32px -8px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)'
      : '0 12px 28px -10px rgba(40,36,120,0.18), 0 2px 6px rgba(16,24,40,0.05)',
  } as CSSProperties
}
