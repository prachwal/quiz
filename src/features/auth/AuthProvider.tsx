import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import type { AppState } from '@auth0/auth0-react'
import { RocketOutlined } from '@ant-design/icons'
import { Button, Result, Spin } from 'antd'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth0Config, authEnabled } from './config'
import { setTokenGetter } from './token'

/** Publishes the token getter for the API layer and holds rendering until the SDK is ready. */
function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, getAccessTokenSilently } = useAuth0()

  // set during render (not in an effect) so child queries fired on mount already see the getter
  setTokenGetter(isAuthenticated ? () => getAccessTokenSilently() : null)
  useEffect(() => () => setTokenGetter(null), [])

  if (isLoading) return <Spin fullscreen />
  if (!isAuthenticated) return <SignInPage />
  return children
}

/** The whole API is private, so anonymous visitors only see this page. */
function SignInPage() {
  const { loginWithRedirect } = useAuth0()
  return (
    <Result
      icon={<RocketOutlined />}
      title="Quiz"
      subTitle="Zaloguj się, aby korzystać z quizów i nauki."
      extra={
        <Button
          type="primary"
          size="large"
          onClick={() => void loginWithRedirect({ appState: { returnTo: window.location.pathname + window.location.search } })}
        >
          Zaloguj się
        </Button>
      }
      style={{ marginTop: 80 }}
    />
  )
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  if (!authEnabled) {
    return (
      <Result
        status="warning"
        title="Logowanie nie jest skonfigurowane"
        subTitle="Ustaw zmienne VITE_AUTH0_* (patrz .env.example) i uruchom ponownie serwer."
        style={{ marginTop: 80 }}
      />
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
