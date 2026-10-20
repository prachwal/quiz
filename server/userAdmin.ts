import { appSettingsInput } from '../src/shared/quiz/schema'
import type { AdminUser, AppSettings, FeedbackItem, FeedbackStatus, ManagedRole } from '../src/shared/quiz/types'
import * as admin from './adminRepo'
import * as auth0 from './auth0Management'
import * as appSettings from './appSettingsRepo'
import * as classes from './classesRepo'
import { HttpError } from './http'
import {
  classTransferBlocker,
  lastAdminBlockRefusal,
  lastAdminRoleRefusal,
  newOwnerRoleRefusal,
  selfBlockRefusal,
  selfRoleRefusal,
} from './userAdminPure'

/**
 * Admin changes to users and classes, shared by the REST routes (`server/routes/admin.ts`) and the MCP tools
 * (`server/mcp/tools/users.ts`, `admin.ts`). Callers have already passed the `manage:users` gate. Refusals are
 * thrown as `HttpError` (409 with the message); both callers turn them into their own answer. The audit entries
 * written here are the ones the admin panel shows; MCP callers add their own `mcp.call` entry.
 */

/** Result of a role change: the user as it is now, plus the roles before and after (for the audit trail). */
export interface RoleChange {
  target: AdminUser
  from: ManagedRole[]
  to: ManagedRole[]
}

export async function setUserRoles(actorId: string, targetId: string, roles: ManagedRole[]): Promise<RoleChange> {
  const desired = [...new Set(roles)]
  // the actor is an admin (the gate), so this is decided without reading Auth0
  const self = selfRoleRefusal(actorId, targetId, desired)
  if (self) throw new HttpError(409, self)
  const target = await auth0.getUser(targetId)
  const adminCount = target.roles.includes('admin') && !desired.includes('admin') ? await auth0.countAdmins() : 0
  const lastAdmin = lastAdminRoleRefusal(target.roles, desired, adminCount)
  if (lastAdmin) throw new HttpError(409, lastAdmin)
  await auth0.setManagedRoles(targetId, target.roles, desired)
  await admin.writeAudit({
    actorId,
    actorLabel: await auth0.userLabel(actorId),
    action: 'roles.update',
    targetId,
    targetLabel: target.email ?? target.name,
    details: { from: target.roles, to: desired },
  })
  return { target: { ...target, roles: desired }, from: target.roles, to: desired }
}

/** Result of a block change: the user as it is now, and whether they were blocked before. */
export interface BlockChange {
  target: AdminUser
  wasBlocked: boolean
}

export async function setUserBlocked(actorId: string, targetId: string, blocked: boolean): Promise<BlockChange> {
  const self = selfBlockRefusal(actorId, targetId, blocked)
  if (self) throw new HttpError(409, self)
  const target = await auth0.getUser(targetId)
  const adminCount = blocked && target.roles.includes('admin') ? await auth0.countAdmins() : 0
  const lastAdmin = lastAdminBlockRefusal(target.roles, blocked, adminCount)
  if (lastAdmin) throw new HttpError(409, lastAdmin)
  await auth0.setBlocked(targetId, blocked)
  await admin.writeAudit({
    actorId,
    actorLabel: await auth0.userLabel(actorId),
    action: blocked ? 'user.block' : 'user.unblock',
    targetId,
    targetLabel: target.email ?? target.name,
  })
  return { target: { ...target, blocked }, wasBlocked: target.blocked }
}

/** Hands a class over to another teacher or admin. Members and assignments stay; archived classes are refused. */
export async function transferClass(classId: string, newOwnerId: string) {
  const cls = await classes.getClassAny(classId)
  if (!cls) throw new HttpError(404, 'Nie znaleziono klasy')
  const early = classTransferBlocker({ archived: cls.archived, ownerId: cls.ownerId, newOwnerId })
  if (early) throw new HttpError(409, early)
  // a missing Auth0 account is a refusal, any other Management API failure is a real error
  const newOwnerRoles = await auth0.getUser(newOwnerId).then(
    (user) => user.roles,
    (error: unknown) => {
      if (error instanceof auth0.ManagementError && error.status === 404) return null
      throw error
    },
  )
  const refusal = newOwnerRoleRefusal(newOwnerRoles)
  if (refusal) throw new HttpError(409, refusal)
  await classes.transferClass(classId, newOwnerId)
  return { classId, name: cls.name, from: cls.ownerId, to: newOwnerId }
}

/** Feedback triage: the status change and its audit entry (`feedback.status`). */
export async function changeFeedbackStatus(actorId: string, id: string, status: FeedbackStatus): Promise<FeedbackItem> {
  const item = await admin.setFeedbackStatus(id, status)
  if (!item) throw new HttpError(404, 'Feedback not found')
  await admin.writeAudit({
    actorId,
    actorLabel: await auth0.userLabel(actorId),
    action: 'feedback.status',
    targetId: item.id,
    targetLabel: item.message.slice(0, 80),
    details: { status },
  })
  return item
}

/**
 * Global score colours: validated with the same schema as `PUT /api/admin/settings/app` (integers 1-100, low < high;
 * a ZodError otherwise), audited as `settings.update` with the previous and the new thresholds.
 */
export interface SettingsChange {
  settings: AppSettings
  from: AppSettings['scoreThresholds']
}

export async function changeAppSettings(actorId: string, raw: unknown): Promise<SettingsChange> {
  const input = appSettingsInput.parse(raw)
  const before = await appSettings.getAppSettings()
  await appSettings.saveAppSettings(input, actorId)
  await admin.writeAudit({
    actorId,
    actorLabel: await auth0.userLabel(actorId),
    action: 'settings.update',
    targetLabel: 'scoreThresholds',
    details: { from: before.scoreThresholds, to: input.scoreThresholds },
  })
  return { settings: input, from: before.scoreThresholds }
}
