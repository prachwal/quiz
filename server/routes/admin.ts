import type { Router } from 'express'
import { z } from 'zod'
import { auth0UserId, feedbackInput } from '../../src/shared/platform/schema'
import { blockedInput, feedbackStatusInput, rolesInput } from '../../src/shared/quiz/schema'
import * as admin from '../adminRepo'
import * as appSettings from '../appSettingsRepo'
import * as auth0 from '../auth0Management'
import { MANAGE_USERS, requirePermission } from '../auth'
import * as classes from '../classesRepo'
import { HttpError, idParam, userOf } from '../http'
import { changeAppSettings, changeFeedbackStatus, setUserBlocked, setUserRoles } from '../userAdmin'
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
    res.json(await changeFeedbackStatus(userOf(req), idParam(req.params.id), status))
  })

  router.get('/admin/users', adminOnly, async (req, res) => {
    const { q, page } = z
      .object({ q: z.string().max(100).default(''), page: z.coerce.number().int().min(0).max(1000).default(0) })
      .parse(req.query)
    res.json(await auth0.listUsers(q, page, 20))
  })

  router.put('/admin/users/:id/roles', adminOnly, async (req, res) => {
    const { roles } = rolesInput.parse(req.body)
    const change = await setUserRoles(userOf(req), String(req.params.id), roles)
    res.json(change.target)
  })

  router.patch('/admin/users/:id/blocked', adminOnly, async (req, res) => {
    const { blocked } = blockedInput.parse(req.body)
    const change = await setUserBlocked(userOf(req), String(req.params.id), blocked)
    res.json(change.target)
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
    res.json((await changeAppSettings(userOf(req), req.body)).settings)
  })

  router.get('/admin/audit', adminOnly, async (_req, res) => {
    res.json(await admin.listAudit())
  })
}
