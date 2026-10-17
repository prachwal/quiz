import { useAuth0 } from '@auth0/auth0-react'
import { authEnabled } from './config'

/** Thin wrapper around Auth0 that also works (as "anonymous") when auth is not configured. */
/** Custom claim added by the "Quiz: roles claim" Auth0 Action. Authorization is enforced by the API. */
const ROLES_CLAIM = 'https://quiz.local/roles'

export function useAuth() {
  const auth0 = useAuth0()
  const user = authEnabled ? auth0.user : undefined
  const roles = (user?.[ROLES_CLAIM] as string[] | undefined) ?? (user ? ['student'] : [])

  return {
    enabled: authEnabled,
    roles,
    isAdmin: roles.includes('admin'),
    isAuthenticated: authEnabled && auth0.isAuthenticated,
    user,
    logout: () => auth0.logout({ logoutParams: { returnTo: window.location.origin } }),
  }
}
