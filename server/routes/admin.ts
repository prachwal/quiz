import type { Router } from 'express'
import { z } from 'zod'
import {
  appSettingsInput,
  auth0UserId,
  blockedInput,
  feedbackInput,
  feedbackStatusInput,
  rolesInput,
} from '../../src/shared/quiz/schema'
import * as admin from '../adminRepo'
import * as appSettings from '../appSettingsRepo'
import * as auth0 from '../auth0Management'
import { MANAGE_USERS, requirePermission } from '../auth'
import * as classes from '../classesRepo'
import { HttpError, idParam, userOf } from '../http'
import { adminStudentResults } from '../userResults'

/**
 * Feedback (any signed-in user writes it) and the admin panel: feedback triage, users and roles, any
 * student's results, global app settings and the audit log. Everything under /admin needs `manage:users`
 * and a JWT session (personal tokens never get that permission).
 */
export function registerAdminRoutes(router: Router) {
  router.post('/feedback', async (req, res) => {
    const input = feedbackInput.parse(req.body)
    const id = await admin.createFeedback({
      userId: userOf(req),
      userLabel: input.userLabel,
      kind: input.kind,
      message: input.message,
      context: input.context,
    })
    res.status(201).json({ id })
  })

  const adminOnly = requirePermission(MANAGE_USERS)

  router.get('/admin/feedback', adminOnly, async (req, res) => {
    const status = z.enum(['new', 'in_progress', 'done']).optional().parse(req.query.status)
    res.json(await admin.listFeedback(status))
  })

  router.patch('/admin/feedback/:id', adminOnly, async (req, res) => {
    const { status } = feedbackStatusInput.parse(req.body)
    const item = await admin.setFeedbackStatus(idParam(req.params.id), status)
    if (!item) throw new HttpError(404, 'Feedback not found')
    await admin.writeAudit({
      actorId: userOf(req),
      actorLabel: await auth0.userLabel(userOf(req)),
      action: 'feedback.status',
      targetId: item.id,
      targetLabel: item.message.slice(0, 80),
      details: { status },
    })
    res.json(item)
  })

  router.get('/admin/users', adminOnly, async (req, res) => {
    const { q, page } = z
      .object({ q: z.string().max(100).default(''), page: z.coerce.number().int().min(0).max(1000).default(0) })
      .parse(req.query)
    res.json(await auth0.listUsers(q, page, 20))
  })

  router.put('/admin/users/:id/roles', adminOnly, async (req, res) => {
    const targetId = String(req.params.id)
    const { roles } = rolesInput.parse(req.body)
    const desired = [...new Set(roles)]
    const target = await auth0.getUser(targetId)
    const removingAdmin = target.roles.includes('admin') && !desired.includes('admin')
    if (removingAdmin) {
      if (targetId === userOf(req)) throw new HttpError(409, 'Nie możesz odebrać sobie roli admin')
      if ((await auth0.countAdmins()) <= 1) throw new HttpError(409, 'Nie można odebrać roli ostatniemu adminowi')
    }
    await auth0.setManagedRoles(targetId, target.roles, desired)
    await admin.writeAudit({
      actorId: userOf(req),
      actorLabel: await auth0.userLabel(userOf(req)),
      action: 'roles.update',
      targetId,
      targetLabel: target.email ?? target.name,
      details: { from: target.roles, to: desired },
    })
    res.json({ ...target, roles: desired })
  })

  router.patch('/admin/users/:id/blocked', adminOnly, async (req, res) => {
    const targetId = String(req.params.id)
    const { blocked } = blockedInput.parse(req.body)
    if (blocked && targetId === userOf(req)) throw new HttpError(409, 'Nie możesz zablokować własnego konta')
    const target = await auth0.getUser(targetId)
    if (blocked && target.roles.includes('admin') && (await auth0.countAdmins()) <= 1) {
      throw new HttpError(409, 'Nie można zablokować ostatniego admina')
    }
    await auth0.setBlocked(targetId, blocked)
    await admin.writeAudit({
      actorId: userOf(req),
      actorLabel: await auth0.userLabel(userOf(req)),
      action: blocked ? 'user.block' : 'user.unblock',
      targetId,
      targetLabel: target.email ?? target.name,
    })
    res.json({ ...target, blocked })
  })

  // ---- admin: any student's complete results (all quizzes, not only class assignments) ----
  router.get('/admin/students', adminOnly, async (req, res) => {
    const q = z.string().trim().max(100).default('').parse(req.query.q ?? '')
    res.json(await classes.searchUsers(q.length >= 2 ? q : ''))
  })

  router.get('/admin/students/:userId/results', adminOnly, async (req, res) => {
    const userId = auth0UserId.parse(String(req.params.userId))
    const results = await adminStudentResults(userId, 200)
    if (!results) throw new HttpError(404, 'Nie znaleziono ucznia')
    res.json(results)
  })

  // ---- global app settings: everybody reads (score colours), admins change ----------------
  router.get('/settings/app', async (_req, res) => {
    res.json(await appSettings.getAppSettings())
  })

  router.put('/admin/settings/app', adminOnly, async (req, res) => {
    const input = appSettingsInput.parse(req.body)
    const before = await appSettings.getAppSettings()
    await appSettings.saveAppSettings(input, userOf(req))
    await admin.writeAudit({
      actorId: userOf(req),
      actorLabel: await auth0.userLabel(userOf(req)),
      action: 'settings.update',
      targetLabel: 'scoreThresholds',
      details: { from: before.scoreThresholds, to: input.scoreThresholds },
    })
    res.json(input)
  })

  router.get('/admin/audit', adminOnly, async (_req, res) => {
    res.json(await admin.listAudit())
  })
}
