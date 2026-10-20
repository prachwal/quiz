import type { ManagedRole } from '../src/shared/quiz/types'

/**
 * Safeguards of the user administration (REST `/api/admin/users/*` and the MCP `user_*` tools). Pure and
 * import-free apart from the type, so the rules are unit-tested without Auth0 or a database.
 *
 * Every caller passes the admin gate first (`manage:users`), so the actor always holds the admin role; that is
 * why the self-protection rules can be decided before any Auth0 call. Each function returns the refusal message
 * (shown to the user as-is) or null when the change may go ahead.
 */

export const SELF_ROLE_REFUSAL = 'Nie możesz odebrać sobie roli admin'
export const LAST_ADMIN_ROLE_REFUSAL = 'Nie można odebrać roli ostatniemu adminowi'
export const SELF_BLOCK_REFUSAL = 'Nie możesz zablokować własnego konta'
export const LAST_ADMIN_BLOCK_REFUSAL = 'Nie można zablokować ostatniego admina'

/** Removing the admin role from the actor's own account (decided before reading Auth0). */
export const selfRoleRefusal = (actorId: string, targetId: string, desired: ManagedRole[]): string | null =>
  targetId === actorId && !desired.includes('admin') ? SELF_ROLE_REFUSAL : null

/** Removing the admin role from the last remaining admin; `adminCount` is only needed when admin is removed. */
export const lastAdminRoleRefusal = (currentRoles: ManagedRole[], desired: ManagedRole[], adminCount: number): string | null =>
  currentRoles.includes('admin') && !desired.includes('admin') && adminCount <= 1 ? LAST_ADMIN_ROLE_REFUSAL : null

/** Blocking the actor's own account (decided before reading Auth0). */
export const selfBlockRefusal = (actorId: string, targetId: string, blocked: boolean): string | null =>
  blocked && targetId === actorId ? SELF_BLOCK_REFUSAL : null

/** Blocking the last remaining admin; `adminCount` is only needed when blocking an admin. */
export const lastAdminBlockRefusal = (targetRoles: ManagedRole[], blocked: boolean, adminCount: number): string | null =>
  blocked && targetRoles.includes('admin') && adminCount <= 1 ? LAST_ADMIN_BLOCK_REFUSAL : null

/** Class transfer, checked before any Auth0 call: the class must be active and the new owner must differ. */
export const classTransferBlocker = (input: { archived: boolean; ownerId: string; newOwnerId: string }): string | null => {
  if (input.archived) return 'Zarchiwizowanej klasy nie można przekazać. Najpierw ją przywróć.'
  if (input.newOwnerId === input.ownerId) return 'Ten użytkownik już jest właścicielem klasy.'
  return null
}

/** Class transfer, after the lookup: the new owner must hold the teacher or admin role (null = no such account). */
export const newOwnerRoleRefusal = (newOwnerRoles: ManagedRole[] | null): string | null => {
  if (newOwnerRoles === null) return 'Nie znaleziono użytkownika o takim identyfikatorze Auth0.'
  if (!newOwnerRoles.includes('teacher') && !newOwnerRoles.includes('admin')) return 'Nowy właściciel musi mieć rolę nauczyciela albo admina.'
  return null
}
