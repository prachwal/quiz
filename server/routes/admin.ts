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
import { listVerbs } from '../irregularVerbs'
import * as progress from '../progressRepo'
import * as reviews from '../reviewsRepo'

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
    const profile = await classes.profileOf(userId)
    const attempts = await classes.allAttempts(userId)
    if (!profile && attempts.length === 0) throw new HttpError(404, 'Nie znaleziono ucznia')
    const [memberOf, summary, lessonsCompleted, weakStats] = await Promise.all([
      classes.classesOfMember(userId),
      progress.getSummary(userId),
      classes.totalLessonsCompleted(userId),
      reviews.weakVerbs(userId, 10),
    ])
    const verbs = weakStats.length ? await listVerbs({ ids: weakStats.map((s) => s.verbId) }) : []
    const byId = new Map(verbs.map((v) => [v.id, v]))
    const percents = attempts.map((x) => x.percent)
    res.json({
      userId,
      name: profile?.name ?? null,
      email: profile?.email ?? null,
      classes: memberOf,
      progress: summary,
      lessonsCompleted,
      weakVerbs: weakStats.flatMap((s) => {
        const verb = byId.get(s.verbId)
        return verb ? [{ verb, attempts: s.attempts, correct: s.correct, accuracy: s.accuracy, lastWrongAt: s.lastWrongAt }] : []
      }),
      totals: {
        attempts: attempts.length,
        averagePercent: percents.length ? Math.round(percents.reduce((x, y) => x + y, 0) / percents.length) : null,
        passedExams: attempts.filter((x) => x.courseId && x.passed).length,
      },
      attempts,
    })
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
