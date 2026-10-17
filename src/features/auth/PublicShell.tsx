import { ConfigProvider, theme } from 'antd'
import type { ReactNode } from 'react'
import { useSystemDark } from '../../app/useResolvedTheme'

function Surface({ children }: { children: ReactNode }) {
  const { token } = theme.useToken()
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: token.colorBgLayout,
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
  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { borderRadius: 10 },
      }}
    >
      <Surface>{children}</Surface>
    </ConfigProvider>
  )
}
