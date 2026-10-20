import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { feedbackStatusInput } from '../../../src/shared/quiz/schema'
import * as admin from '../../adminRepo'
import * as appSettings from '../../appSettingsRepo'
import { systemStats } from '../../systemStats'
import { changeAppSettings, changeFeedbackStatus } from '../../userAdmin'
import { audit, needAdmin, refusing, text } from '../context'
import type { Ctx } from '../context'
import { confirm } from './shared'
import { isoDate } from './admin'

/**
 * Admin operations: the audit trail, feedback triage, global score settings and system counts. Reads need
 * `manage:users` only; the two changes need confirm=true, go through the same code as the admin panel
 * (`server/userAdmin.ts`) and add an `mcp.call` audit entry on top of the panel's own entry.
 */

const AUDIT_ACTIONS = ['roles.update', 'user.block', 'user.unblock', 'feedback.status', 'mcp.call', 'settings.update', 'media.upload', 'verb.image'] as const
const pageSize = z.number().int().min(1).max(200)

export function registerOperationTools(server: McpServer, ctx: Ctx) {
  const isAdmin = ctx.viewer.admin

  server.registerTool(
    'audit_list',
    {
      title: 'Dziennik audytu (admin)',
      description:
        'Wpisy audytu, od najnowszego. Filtry: action (roles.update, user.block, user.unblock, feedback.status, mcp.call, settings.update, media.upload, verb.image), actorId (kto), targetId (czego dotyczyło), from (włącznie) i to (wyłącznie) jako daty ISO. mcp.call ma details.tool. Domyślnie 50, maks. 200; hasMore mówi, czy jest następna strona (offset).',
      inputSchema: {
        action: z.enum(AUDIT_ACTIONS).optional(),
        actorId: z.string().trim().min(1).max(200).optional(),
        targetId: z.string().trim().min(1).max(200).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: pageSize.default(50),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ action, actorId, targetId, from, to, limit, offset }) => {
      if (!isAdmin) return needAdmin()
      // one row more than requested tells whether another page exists
      const rows = await admin.listAudit({ action, actorId, targetId, from, to, limit: limit + 1, offset })
      return text({ offset, limit, hasMore: rows.length > limit, entries: rows.slice(0, limit) })
    },
  )

  server.registerTool(
    'feedback_list',
    {
      title: 'Zgłoszenia użytkowników (admin)',
      description: 'Zgłoszenia (błędy, pomysły, inne) od najnowszego: id, kind, status, message, userLabel, context (trasa, wersja, przeglądarka, id zdarzenia Sentry). status filtruje: new, in_progress, done. Domyślnie 50, maks. 200.',
      inputSchema: {
        status: feedbackStatusInput.shape.status.optional(),
        limit: pageSize.default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, limit }) => {
      if (!isAdmin) return needAdmin()
      const rows = await admin.listFeedback(status, limit + 1)
      return text({ limit, hasMore: rows.length > limit, items: rows.slice(0, limit) })
    },
  )

  server.registerTool(
    'feedback_update',
    {
      title: 'Zmień status zgłoszenia (admin)',
      description: 'Ustawia status zgłoszenia (new, in_progress, done). Wymaga confirm=true. Ten sam zapis co w panelu admina, z wpisem audytu.',
      inputSchema: { id: z.string().uuid().describe('Id zgłoszenia (UUID) z feedback_list'), status: feedbackStatusInput.shape.status, confirm },
      annotations: { idempotentHint: true },
    },
    async ({ id, status }) => {
      if (!isAdmin) return needAdmin()
      return refusing(async () => {
        const item = await changeFeedbackStatus(ctx.userId, id, status)
        await audit(ctx, 'feedback_update', { id: item.id, label: item.message.slice(0, 80) }, { status })
        return text(item)
      })
    },
  )

  server.registerTool(
    'settings_get',
    {
      title: 'Ustawienia aplikacji (admin)',
      description: 'Globalne ustawienia: scoreThresholds { low, high } - progi kolorów wyników (poniżej low czerwony, poniżej high pomarańczowy, reszta zielony).',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      if (!isAdmin) return needAdmin()
      return text(await appSettings.getAppSettings())
    },
  )

  server.registerTool(
    'settings_set',
    {
      title: 'Zmień progi wyników (admin)',
      description:
        'Zmienia progi kolorów wyników: low i high są liczbami całkowitymi 1-100, low musi być mniejsze niż high (ta sama walidacja co w panelu). Wymaga confirm=true. Zapisuje wpis audytu settings.update z poprzednimi i nowymi progami.',
      inputSchema: {
        scoreThresholds: z.object({ low: z.number().int().min(1).max(100), high: z.number().int().min(1).max(100) }),
        confirm,
      },
      annotations: { idempotentHint: true },
    },
    async ({ scoreThresholds }) => {
      if (!isAdmin) return needAdmin()
      return refusing(async () => {
        const change = await changeAppSettings(ctx.userId, { scoreThresholds })
        await audit(ctx, 'settings_set', { label: 'scoreThresholds' }, { from: change.from, to: change.settings.scoreThresholds })
        return text(change.settings)
      })
    },
  )

  server.registerTool(
    'system_stats',
    {
      title: 'Stan systemu (admin)',
      description:
        'Liczby jednym zapytaniem: users (profile), classes (aktywne), quizzes (ręczne), generatedQuizzes, attempts, attemptsLast7Days, feedbackNew, activeTokens (niecofnięte, nieprzeterminowane), weakVerbRows, db (liczba zastosowanych migracji, ostatnia migracja, schemaCurrent: czy ostatnia zastosowana to najnowszy plik w db/migrations; null, gdy folder nie jest dostępny w tym środowisku, wtedy schemaNote mówi dlaczego) i appVersion (commit z VERCEL_GIT_COMMIT_SHA albo null).',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      if (!isAdmin) return needAdmin()
      return text(await systemStats())
    },
  )
}
