import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import type { AppState } from '@auth0/auth0-react'
import { LoginOutlined, UserAddOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Result, Spin, Typography } from 'antd'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sentry, sentryEnabled } from '../../app/sentry'
import { auth0Config, authEnabled } from './config'
import { devAuth } from './devAuth'
import BrandMark from '../../components/BrandMark'
import PublicShell from './PublicShell'
import { setTokenGetter } from './token'

/** Publishes the token getter for the API layer and holds rendering until the SDK is ready. */
function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, getAccessTokenSilently, user } = useAuth0()

  // set during render (not in an effect) so child queries fired on mount already see the getter
  setTokenGetter(isAuthenticated ? () => getAccessTokenSilently() : null)
  useEffect(() => () => setTokenGetter(null), [])

  // errors are attributed to the Auth0 user id only (no e-mail / name)
  useEffect(() => {
    if (sentryEnabled) Sentry.setUser(isAuthenticated && user?.sub ? { id: user.sub } : null)
  }, [isAuthenticated, user?.sub])

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
      <Card className="signin-card" style={{ width: '100%', maxWidth: 440, boxShadow: 'var(--app-shadow-md)' }}>
        <Flex vertical align="center" gap={20} className="signin-stack" style={{ textAlign: 'center' }}>
          <BrandMark size={56} showName={false} />
          <div>
            <Typography.Title level={2} style={{ margin: 0, letterSpacing: -0.5 }}>
              Witaj w Quiz
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 17 }}>
              Zaloguj się lub załóż konto, aby korzystać z quizów i nauki.
            </Typography.Paragraph>
          </div>
          <Flex vertical gap={10} style={{ width: '100%' }}>
            <Button type="primary" size="large" block icon={<LoginOutlined />} onClick={() => go()}>
              Zaloguj się
            </Button>
            <Button size="large" block icon={<UserAddOutlined />} onClick={() => go('signup')}>
              Zarejestruj się
            </Button>
          </Flex>
        </Flex>
      </Card>
    </PublicShell>
  )
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  if (devAuth) {
    // local development only: no Auth0, every API call carries the dev token (set during render, like AuthGate)
    const devToken = devAuth.token
    setTokenGetter(async () => devToken)
    return (
      <>
        <div className="dev-auth-banner" role="status">
          Tryb deweloperski: logowanie pominięte ({devAuth.userId}, role: {devAuth.roles.join(', ') || 'brak'})
        </div>
        {children}
      </>
    )
  }
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
