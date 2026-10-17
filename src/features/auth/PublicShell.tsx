import { ConfigProvider, theme } from 'antd'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { brandTheme } from '../../app/brandTheme'
import { useThemeVars } from '../../app/themeVars'
import { useSystemDark } from '../../app/useResolvedTheme'

function Surface({ children }: { children: ReactNode }) {
  const { token } = theme.useToken()
  const vars = useThemeVars()
  return (
    <div
      className="app-shell"
      style={{
        ...vars,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
        background: `radial-gradient(80% 60% at 15% 0%, ${token.colorPrimaryBg} 0%, transparent 60%), radial-gradient(70% 60% at 100% 100%, ${token.colorPrimaryBg} 0%, transparent 55%), ${token.colorBgLayout}`,
        color: token.colorText,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Frame for pages shown before sign-in (sign-in, loading, configuration notice).
 * Always follows the OS color scheme, ignoring the saved theme setting.
 */
export default function PublicShell({ children }: { children: ReactNode }) {
  const dark = useSystemDark()
  const themeConfig = useMemo(() => brandTheme(dark), [dark])
  return (
    <ConfigProvider theme={themeConfig}>
      <Surface>{children}</Surface>
    </ConfigProvider>
  )
}
