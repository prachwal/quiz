import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { auth0UserId } from '../../../src/shared/platform/schema'
import { blockedInput, rolesInput } from '../../../src/shared/quiz/schema'
import { attemptRows } from '../../../src/shared/quiz/userHistory'
import * as auth0 from '../../auth0Management'
import * as classes from '../../classesRepo'
import * as reviews from '../../reviewsRepo'
import { setUserBlocked, setUserRoles } from '../../userAdmin'
import { weakVerbDetails } from '../../userResults'
import { audit, failure, needAdmin, refusing, text } from '../context'
import type { Ctx } from '../context'
import { confirm } from './shared'

/**
 * Admin tools for user accounts: list and get (Auth0 account + app data), search in the app's directory, role
 * and block changes. The safeguards (no self-demotion, no last admin, no self-block) live in `server/userAdmin.ts`
 * and are shared with the REST routes; changes are audited twice: the admin panel entry and an `mcp.call`.
 */

/** Auth0 answers 404 for an unknown account: that is a refusal, not a server error. */
const accountOrNull = (userId: string) =>
  auth0.getUser(userId).catch((error: unknown) => {
    if (error instanceof auth0.ManagementError && error.status === 404) return null
    throw error
  })

export function registerUserTools(server: McpServer, ctx: Ctx) {
  const admin = ctx.viewer.admin

  server.registerTool(
    'user_list',
    {
      title: 'Lista kont (admin)',
      description:
        'Konta z Auth0 (e-mail, imię, dostawca logowania, roles, blocked, lastLogin, loginsCount), od ostatnio zalogowanego, 20 na stronę. q szuka po e-mailu, imieniu i nicku; page liczy od 1. Zwraca total i page.',
      inputSchema: {
        q: z.string().trim().max(100).optional(),
        page: z.number().int().min(1).max(1000).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ q, page }) => {
      if (!admin) return needAdmin()
      return refusing(async () => text({ ...(await auth0.listUsers(q ?? '', page - 1, 20)), page }))
    },
  )

  server.registerTool(
    'user_get',
    {
      title: 'Konto użytkownika (admin)',
      description:
        'Pełne dane konta z Auth0 (z e-mailem, rolami, blocked, lastLogin). include dodaje sekcje: classes (klasy, do których należy), attempts (łącznie i 20 ostatnich podejść bez odpowiedzi), reviews (stan powtórek, liczba słabych czasowników i 8 najsłabszych). Id z user_list, user_search albo attempt_list.',
      inputSchema: {
        userId: auth0UserId,
        include: z.array(z.enum(['attempts', 'classes', 'reviews'])).max(3).default([]),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ userId, include }) => {
      if (!admin) return needAdmin()
      return refusing(async () => {
        const user = await accountOrNull(userId)
        if (!user) return failure('Nie znaleziono użytkownika.')
        const result: Record<string, unknown> = { ...user }
        if (include.includes('classes')) result.classes = await classes.classesOfMember(userId)
        if (include.includes('attempts')) {
          const [latest, total] = await Promise.all([classes.allAttempts(userId, 20), classes.countAttempts(userId)])
          result.attempts = { total, hasMore: total > latest.length, latest: attemptRows(latest, false, new Map()) }
        }
        if (include.includes('reviews')) {
          const [summary, weakCount, weakVerbs] = await Promise.all([
            reviews.getReviewSummary(userId),
            reviews.weakVerbCount(userId),
            weakVerbDetails(userId, 8),
          ])
          result.reviews = { ...summary, weakVerbCount: weakCount, weakVerbs }
        }
        return text(result)
      })
    },
  )

  server.registerTool(
    'user_search',
    {
      title: 'Szukaj konta w aplikacji (admin)',
      description:
        'Szuka kont w bazie aplikacji po imieniu, e-mailu lub identyfikatorze Auth0 (min. 2 znaki, do 25 wyników, domyślnie 8). Celowo różni się od student_search: nie wymaga klasy, pokazuje pełny e-mail i nie maskuje go, a limit i minimalna długość są inne. Znajduje tylko osoby, które logowały się do aplikacji. Zwraca userId, name, email, lastActiveDay, attempts.',
      inputSchema: {
        q: z.string().trim().min(2).max(100),
        limit: z.number().int().min(1).max(25).default(8),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ q, limit }) => {
      if (!admin) return needAdmin()
      return text(await classes.searchUsers(q, limit))
    },
  )

  server.registerTool(
    'user_roles_set',
    {
      title: 'Ustaw role użytkownika (admin)',
      description:
        'Ustawia dokładnie podany zestaw ról zarządzanych (admin, teacher, student); pozostałe role Auth0 zostają. Nie można odebrać sobie roli admin ani jej ostatniemu adminowi. Zmiana działa po ponownym zalogowaniu użytkownika. Wymaga confirm=true. Zapisuje wpis audytu.',
      inputSchema: { userId: auth0UserId, roles: rolesInput.shape.roles, confirm },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ userId, roles }) => {
      if (!admin) return needAdmin()
      return refusing(async () => {
        const change = await setUserRoles(ctx.userId, userId, roles)
        await audit(ctx, 'user_roles_set', { id: userId, label: change.target.email ?? change.target.name ?? userId }, { userId, from: change.from, to: change.to })
        return text({ userId, roles: change.to })
      })
    },
  )

  server.registerTool(
    'user_block',
    {
      title: 'Zablokuj lub odblokuj konto (admin)',
      description:
        'Blokuje (blocked=true) albo odblokowuje (blocked=false) konto w Auth0. Nie można zablokować siebie ani ostatniego admina. Dane wyników zostają. Wymaga confirm=true. Zapisuje wpis audytu.',
      inputSchema: { userId: auth0UserId, blocked: blockedInput.shape.blocked, confirm },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ userId, blocked }) => {
      if (!admin) return needAdmin()
      return refusing(async () => {
        const change = await setUserBlocked(ctx.userId, userId, blocked)
        await audit(ctx, 'user_block', { id: userId, label: change.target.email ?? change.target.name ?? userId }, { userId, from: change.wasBlocked, to: blocked })
        return text({ userId, blocked })
      })
    },
  )
}
