import type { AdminUser, ManagedRole } from '../src/shared/quiz/types'

interface Auth0User {
  user_id: string
  email?: string
  name?: string
  nickname?: string
  picture?: string
  last_login?: string
  logins_count?: number
  blocked?: boolean
  identities?: { provider: string; connection: string }[]
}

/** Maps a raw Auth0 user plus its managed roles to the AdminUser shape used by the UI. */
export const toAdminUser = (user: Auth0User, roles: ManagedRole[]): AdminUser => ({
  id: user.user_id,
  email: user.email ?? null,
  name: user.name ?? user.nickname ?? null,
  picture: user.picture ?? null,
  provider: user.identities?.[0]?.connection ?? user.user_id.split('|')[0],
  lastLogin: user.last_login ?? null,
  loginsCount: user.logins_count ?? 0,
  blocked: user.blocked ?? false,
  roles,
})

/** Keeps only characters safe inside a Lucene query. */
export const sanitizeSearchTerm = (search: string): string =>
  search.replace(/[^\p{L}\p{N}@._ -]/gu, ' ').trim()

/** Builds the Auth0 users-search query string (empty when there is no term). */
export const buildUserQuery = (search: string): string => {
  const term = sanitizeSearchTerm(search)
  if (!term) return ''
  return `&q=${encodeURIComponent(term.split(/\s+/).map((t) => `(email:*${t}* OR name:*${t}* OR nickname:*${t}*)`).join(' AND '))}`
}
