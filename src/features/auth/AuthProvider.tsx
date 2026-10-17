import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import type { AppState } from '@auth0/auth0-react'
import { Spin } from 'antd'
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
  return children
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  if (!authEnabled) return children

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
