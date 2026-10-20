import type { Router } from 'express'
import { tokenInput } from '../../src/shared/platform/schema'
import * as tokens from '../apiTokens'
import { MANAGE_CLASSES, WRITE_QUIZZES, hasPermission, requireJwt } from '../auth'
import { HttpError, idSchema, userOf } from '../http'

/** Personal API tokens (`qz_...`), JWT sessions only. */

export function registerTokenRoutes(router: Router) {
  router.get('/tokens', requireJwt, async (req, res) => {
    res.json(await tokens.listApiTokens(userOf(req)))
  })

  router.post('/tokens', requireJwt, async (req, res) => {
    const input = tokenInput.parse(req.body ?? {})
    if (input.write && !hasPermission(req, WRITE_QUIZZES)) {
      throw new HttpError(403, 'Token z prawem zapisu może utworzyć tylko admin')
    }
    if (input.classes && !hasPermission(req, MANAGE_CLASSES)) {
      throw new HttpError(403, 'Token z dostępem do klas może utworzyć tylko nauczyciel')
    }
    const created = await tokens.createApiToken({
      userId: userOf(req),
      name: input.name,
      permissions: [...(input.write ? [WRITE_QUIZZES] : []), ...(input.classes ? [MANAGE_CLASSES] : [])],
      expiresInDays: input.expiresInDays,
    })
    if (created === 'limit') throw new HttpError(409, 'Osiągnięto limit aktywnych tokenów (20)')
    res.status(201).json(created)
  })

  router.delete('/tokens/:id', requireJwt, async (req, res) => {
    const id = idSchema.safeParse(req.params.id)
    if (!id.success || !(await tokens.revokeApiToken(id.data, userOf(req)))) {
      throw new HttpError(404, 'Token not found')
    }
    res.json({ ok: true })
  })
}
