import { useAuth0 } from '@auth0/auth0-react'
import { Button, Result } from 'antd'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'

/** Sends anonymous visitors to the Auth0 login page; renders children once signed in. */
function Guard({ children }: { children: ReactNode }) {
  const { isAuthenticated, login } = useAuth()
  const { isLoading } = useAuth0()

  const redirected = useRef(false)

  useEffect(() => {
    if (isLoading || isAuthenticated || redirected.current) return
    redirected.current = true
    void login()
  }, [isLoading, isAuthenticated, login])

  return isAuthenticated ? children : null
}

export default function RequireAuth({ children, role }: { children: ReactNode; role?: string }) {
  const { enabled, isAuthenticated, roles } = useAuth()
  if (!enabled) {
    return (
      <Result
        status="warning"
        title="Logowanie nie jest skonfigurowane"
        subTitle="Ustaw zmienne VITE_AUTH0_* (patrz .env.example) i uruchom ponownie serwer."
        extra={<Button href="/">Wróć</Button>}
      />
    )
  }
  return (
    <Guard>
      {role && isAuthenticated && !roles.includes(role) ? (
        <Result status="403" title="Brak dostępu" subTitle={`Ta strona wymaga roli „${role}”.`} />
      ) : (
        children
      )}
    </Guard>
  )
}
