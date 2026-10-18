import { useAuth0 } from '@auth0/auth0-react'
import { authEnabled } from './config'
import { devAuth } from './devAuth'

/** Thin wrapper around Auth0 that also works (as "anonymous") when auth is not configured. */
/** Custom claim added by the "Quiz: roles claim" Auth0 Action. Authorization is enforced by the API. */
const ROLES_CLAIM = 'https://quiz.local/roles'

export function useAuth() {
  const auth0 = useAuth0()
  const user = devAuth
    ? { sub: devAuth.userId, name: 'Dev User', email: 'dev@localhost', [ROLES_CLAIM]: devAuth.roles }
    : authEnabled
      ? auth0.user
      : undefined
  const roles = (user?.[ROLES_CLAIM] as string[] | undefined) ?? (user ? ['student'] : [])

  return {
    enabled: authEnabled || devAuth !== null,
    roles,
    isAdmin: roles.includes('admin'),
    isTeacher: roles.includes('teacher'),
    isAuthenticated: devAuth !== null || (authEnabled && auth0.isAuthenticated),
    user,
    logout: () => {
      if (!devAuth) void auth0.logout({ logoutParams: { returnTo: window.location.origin } })
    },
  }
}
