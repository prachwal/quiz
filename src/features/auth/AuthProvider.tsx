import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import type { AppState } from '@auth0/auth0-react'
import { LoginOutlined, RocketOutlined, UserAddOutlined } from '@ant-design/icons'
import { Button, Result, Space, Spin } from 'antd'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth0Config, authEnabled } from './config'
import PublicShell from './PublicShell'
import { setTokenGetter } from './token'

/** Publishes the token getter for the API layer and holds rendering until the SDK is ready. */
function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, getAccessTokenSilently } = useAuth0()

  // set during render (not in an effect) so child queries fired on mount already see the getter
  setTokenGetter(isAuthenticated ? () => getAccessTokenSilently() : null)
  useEffect(() => () => setTokenGetter(null), [])

  if (isLoading) {
    return (
      <PublicShell>
        <Spin size="large" />
      </PublicShell>
    )
  }
  if (!isAuthenticated) return <SignInPage />
  return children
}

/** The whole API is private, so anonymous visitors only see this page (sign in or register). */
function SignInPage() {
  const { loginWithRedirect } = useAuth0()
  const returnTo = window.location.pathname + window.location.search
  const go = (screenHint?: 'signup') =>
    void loginWithRedirect({
      appState: { returnTo },
      authorizationParams: screenHint ? { screen_hint: screenHint } : undefined,
    })

  return (
    <PublicShell>
      <Result
        icon={<RocketOutlined />}
        title="Quiz"
        subTitle="Zaloguj się lub załóż konto, aby korzystać z quizów i nauki."
        extra={
          <Space wrap style={{ justifyContent: 'center' }}>
            <Button type="primary" size="large" icon={<LoginOutlined />} onClick={() => go()}>
              Zaloguj się
            </Button>
            <Button size="large" icon={<UserAddOutlined />} onClick={() => go('signup')}>
              Zarejestruj się
            </Button>
          </Space>
        }
      />
    </PublicShell>
  )
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  if (!authEnabled) {
    return (
      <PublicShell>
        <Result
          status="warning"
          title="Logowanie nie jest skonfigurowane"
          subTitle="Ustaw zmienne VITE_AUTH0_* (patrz .env.example) i uruchom ponownie serwer."
        />
      </PublicShell>
    )
  }

  return (
    <Auth0Provider
      domain={auth0Config.domain!}
      clientId={auth0Config.clientId!}
      cacheLocation="localstorage"
      useRefreshTokens
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: auth0Config.audience,
      }}
      onRedirectCallback={(appState?: AppState) => navigate(appState?.returnTo ?? '/', { replace: true })}
    >
      <AuthGate>{children}</AuthGate>
    </Auth0Provider>
  )
}
