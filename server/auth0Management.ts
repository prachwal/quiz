import { MANAGED_ROLES } from '../src/shared/quiz/types'
import type { AdminUser, AdminUsersPage, ManagedRole } from '../src/shared/quiz/types'

const domain = process.env.AUTH0_DOMAIN
const clientId = process.env.AUTH0_MGMT_CLIENT_ID
const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET

export class ManagementError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const managementConfigured = Boolean(domain && clientId && clientSecret)

let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (!managementConfigured) {
    throw new ManagementError(503, 'Zarządzanie użytkownikami nie jest skonfigurowane (AUTH0_MGMT_*)')
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  })
  if (!response.ok) throw new ManagementError(502, 'Nie udało się połączyć z Auth0 Management API')
  const data = (await response.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.value
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function management<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = async () =>
    fetch(`https://${domain}/api/v2${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  let response = await send()
  if (response.status === 429) {
    // the tenant's Management API limit is low: wait for the window to reset and try once more
    const reset = Number(response.headers.get('retry-after') ?? 1)
    await sleep(Math.min(Math.max(reset, 1), 3) * 1000)
    response = await send()
  }
  if (response.status === 429) throw new ManagementError(429, 'Auth0: zbyt wiele zapytań, spróbuj za chwilę')
  if (!response.ok) {
    console.error(JSON.stringify({ level: 'error', msg: 'auth0 management failed', path, status: response.status }))
    throw new ManagementError(response.status === 404 ? 404 : 502, 'Operacja w Auth0 nie powiodła się')
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

let roleIds: Record<ManagedRole, string> | null = null

async function managedRoleIds(): Promise<Record<ManagedRole, string>> {
  if (roleIds) return roleIds
  const roles = await management<{ id: string; name: string }[]>('/roles?per_page=100')
  const found = {} as Record<ManagedRole, string>
  for (const name of MANAGED_ROLES) {
    const role = roles.find((r) => r.name === name)
    if (!role) throw new ManagementError(500, `Brak roli „${name}” w Auth0`)
    found[name] = role.id
  }
  roleIds = found
  return found
}

const MEMBERS_TTL_MS = 15_000
let membersCache: { value: Map<string, ManagedRole[]>; expiresAt: number } | null = null

/** user id -> managed roles, built from the members of the managed roles (cached briefly: few calls, no N+1). */
async function roleMembers(): Promise<Map<string, ManagedRole[]>> {
  if (membersCache && membersCache.expiresAt > Date.now()) return membersCache.value
  const ids = await managedRoleIds()
  const members = new Map<string, ManagedRole[]>()
  for (const name of MANAGED_ROLES) {
    for (let page = 0; page < 20; page++) {
      const batch = await management<{ user_id: string }[]>(`/roles/${ids[name]}/users?per_page=100&page=${page}`)
      for (const user of batch) members.set(user.user_id, [...(members.get(user.user_id) ?? []), name])
      if (batch.length < 100) break
    }
  }
  membersCache = { value: members, expiresAt: Date.now() + MEMBERS_TTL_MS }
  return members
}

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

const FIELDS = 'user_id,email,name,nickname,picture,last_login,logins_count,blocked,identities'

const toAdminUser = (user: Auth0User, roles: ManagedRole[]): AdminUser => ({
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

export async function listUsers(search: string, page: number, perPage: number): Promise<AdminUsersPage> {
  // keep only characters that are safe inside a Lucene query
  const term = search.replace(/[^\p{L}\p{N}@._ -]/gu, ' ').trim()
  const query = term
    ? `&q=${encodeURIComponent(term.split(/\s+/).map((t) => `(email:*${t}* OR name:*${t}* OR nickname:*${t}*)`).join(' AND '))}`
    : ''
  const [result, members] = await Promise.all([
    management<{ users: Auth0User[]; total: number }>(
      `/users?search_engine=v3&include_totals=true&fields=${FIELDS}&include_fields=true&sort=last_login:-1&page=${page}&per_page=${perPage}${query}`,
    ),
    roleMembers(),
  ])
  return {
    users: result.users.map((u) => toAdminUser(u, members.get(u.user_id) ?? [])),
    total: result.total,
    page,
    perPage,
  }
}

export async function getUser(userId: string): Promise<AdminUser> {
  const [user, members] = await Promise.all([
    management<Auth0User>(`/users/${encodeURIComponent(userId)}?fields=${FIELDS}&include_fields=true`),
    roleMembers(),
  ])
  return toAdminUser(user, members.get(user.user_id) ?? [])
}

export async function countAdmins(): Promise<number> {
  const members = await roleMembers()
  return [...members.values()].filter((roles) => roles.includes('admin')).length
}

/** Makes the user's managed roles exactly `desired`; other tenant roles stay untouched. */
export async function setManagedRoles(userId: string, current: ManagedRole[], desired: ManagedRole[]) {
  const ids = await managedRoleIds()
  const toAdd = desired.filter((r) => !current.includes(r)).map((r) => ids[r])
  const toRemove = current.filter((r) => !desired.includes(r)).map((r) => ids[r])
  const path = `/users/${encodeURIComponent(userId)}/roles`
  if (toAdd.length) await management(path, { method: 'POST', body: { roles: toAdd } })
  if (toRemove.length) await management(path, { method: 'DELETE', body: { roles: toRemove } })
  membersCache = null
}

export async function setBlocked(userId: string, blocked: boolean) {
  await management(`/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: { blocked } })
}

const labels = new Map<string, { value: string; expiresAt: number }>()

/** Display label of any user (for the audit trail); cached to spare the Management API limit. */
export async function userLabel(userId: string): Promise<string> {
  const hit = labels.get(userId)
  if (hit && hit.expiresAt > Date.now()) return hit.value
  try {
    const user = await management<Auth0User>(`/users/${encodeURIComponent(userId)}?fields=email,name,nickname&include_fields=true`)
    const value = user.email ?? user.name ?? user.nickname ?? userId
    labels.set(userId, { value, expiresAt: Date.now() + 10 * 60_000 })
    return value
  } catch {
    return userId
  }
}
