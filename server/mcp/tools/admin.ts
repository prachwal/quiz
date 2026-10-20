import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { auth0UserId } from '../../../src/shared/platform/schema'
import * as attempts from '../../attemptsRepo'
import { quizStats } from '../../../src/shared/quiz/quizStats'
import { analyzeStudent } from '../../../src/shared/quiz/studentAnalysis'
import { attemptRows, historyAnalysisInput } from '../../../src/shared/quiz/userHistory'
import * as classes from '../../classesRepo'
import * as reviews from '../../reviewsRepo'
import { adminStudentResults, weakVerbDetails } from '../../userResults'
import { transferClass } from '../../userAdmin'
import { audit, failure, needAdmin, refusing, text } from '../context'
import type { Ctx } from '../context'
import { confirm } from './shared'

/** Admin-only tools (`manage:users`, OAuth login only - personal tokens never carry that permission). */

export const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Data w formacie ISO, np. 2026-10-19 albo 2026-10-19T12:00:00Z')
  .describe('Data ISO, np. 2026-10-19')

const percent = z.number().min(0).max(100)

export function registerAdminTools(server: McpServer, ctx: Ctx) {
  const admin = ctx.viewer.admin

  server.registerTool(
    'attempt_list',
    {
      title: 'Lista podejść (admin)',
      description:
        'Podejścia do quizów wszystkich użytkowników, od najnowszego, z łącznym total. Filtry: quizId, userId, courseId, title (fragment tytułu zapisanego przy podejściu - znajdzie też usunięte quizy), source, zakres procentów i dat. source: manual, irregular-verbs, review, weak, course-exam; dla usuniętego quizu jest null i filtr source takich podejść nie zwraca. Zwraca score/maxScore/percent (nie "ocenę") - szczegóły odpowiedzi daje attempt_get po id.',
      inputSchema: {
        quizId: z.string().uuid().optional(),
        userId: auth0UserId.optional(),
        courseId: z.string().uuid().optional(),
        title: z.string().trim().min(1).max(100).optional(),
        source: z.enum(['manual', 'irregular-verbs', 'course-exam', 'review', 'weak']).optional(),
        minPercent: percent.optional(),
        maxPercent: percent.optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.number().int().min(1).max(200).default(25),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    async (filter) => {
      if (!admin) return needAdmin()
      const { total, attempts: items } = await attempts.listAttemptsFiltered(filter)
      return text({ total, offset: filter.offset, hasMore: filter.offset + items.length < total, attempts: items })
    },
  )

  server.registerTool(
    'quiz_stats',
    {
      title: 'Statystyka pytań quizu (admin)',
      description:
        'Analiza pytań quizu na podstawie wszystkich podejść: dla każdego pytania liczba odpowiedzi (attempts), poprawne (correct), accuracy 0..1 (zdobyte punkty / wszystkie punkty, więc punkty częściowe się liczą), earnedPercent, topAnswers (najczęstsze odpowiedzi tekstem) i flag. Pytania: najpierw w kolejności quizu, potem usunięte przy edycji (inCurrentQuiz=false); pytania bez żadnej odpowiedzi nie są wymienione. Zwraca liczby z quizu: attempts, avgPercent, minPercent, maxPercent (null, gdy quiz nie ma podejść), sampleSize, total, hasMore oraz unattributedAttempts (podejścia z pytaniem nieznanym ani z migawki, ani z aktualnego quizu). Ograniczenia: quiz z sampleSize losuje pytania, więc attempts per pytanie jest mniejsze niż liczba podejść; flag insufficient-data (poniżej 10 odpowiedzi) oznacza, że nie wolno wyciągać wniosków; topAnswers może być puste dla podejść zapisanych przed zapisem tekstu odpowiedzi; edycja quizu tworzy nowe id pytań (podejścia z migawką dalej liczą się poprawnie, bez migawki trafiają do unattributedAttempts). flag ambiguous jest tylko dla pytań wyboru.',
      inputSchema: {
        quizId: z.string().uuid().describe('Id quizu (UUID) z quiz_list'),
        limit: z.number().int().min(1).max(200).default(50).describe('Ile pytań zwrócić (domyślnie 50, maks. 200)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ quizId, limit }) => {
      if (!admin) return needAdmin()
      const [quiz, rows] = await Promise.all([attempts.quizForStats(quizId), attempts.attemptsOfQuiz(quizId)])
      if (!quiz && rows.length === 0) return failure('Nie znaleziono quizu.')
      return text(
        quizStats({
          quiz: quiz ?? { title: null, sampleSize: null, questions: [] },
          attempts: rows.map((r) => ({ percent: r.percent, results: r.results, questionsSnapshot: r.questionsSnapshot })),
          limit,
        }),
      )
    },
  )

  server.registerTool(
    'user_results',
    {
      title: 'Wyniki użytkownika (admin)',
      description:
        'Wszystkie podejścia jednego użytkownika, także spoza klas i bez ograniczenia do zadań: profil z pełnym e-mailem, classes (aktywne klasy), lessonsCompleted, lastActiveDay, weakVerbs (liczba czasowników słabych), total i hasMore oraz attempts od najnowszego (id, quizId, quizTitle, percent, score, maxScore, passed, source, createdAt; source jest null dla usuniętego quizu). includeAnswers=true dodaje do każdego podejścia questions z odpowiedzią na każde pytanie (może być bardzo długie - w razie wątpliwości zostaw false). Zwraca najwyżej limit podejść (domyślnie 50, maks. 200). Id użytkownika (Auth0) z attempt_list albo student_search. Pytania usunięte przy edycji quizu mają prompt i type null.',
      inputSchema: {
        userId: auth0UserId,
        limit: z.number().int().min(1).max(200).default(50),
        includeAnswers: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ userId, limit, includeAnswers }) => {
      if (!admin) return needAdmin()
      const results = await adminStudentResults(userId, limit)
      if (!results) return failure('Nie znaleziono użytkownika.')
      const [lastActiveDay, total, weakCount] = await Promise.all([
        classes.lastActiveDayOf(userId),
        classes.countAttempts(userId),
        reviews.weakVerbCount(userId),
      ])
      const types = includeAnswers
        ? await attempts.questionTypesOf(results.attempts.flatMap((a) => a.questions.map((q) => q.questionId)))
        : new Map<string, string>()
      return text({
        userId,
        name: results.name,
        email: results.email,
        classes: results.classes,
        lessonsCompleted: results.lessonsCompleted,
        lastActiveDay,
        weakVerbs: weakCount,
        total,
        hasMore: total > results.attempts.length,
        attempts: attemptRows(results.attempts, includeAnswers, types),
      })
    },
  )

  server.registerTool(
    'user_analysis',
    {
      title: 'Analiza użytkownika (admin)',
      description:
        'Gotowa analiza jednego użytkownika po jego całej historii (najnowsze 200 podejść, także spoza klas): średnia, najlepszy i ostatni wynik, trend, pytania najczęściej błędne, dni bez aktywności, wyniki per quiz i ostrzeżenia. Sekcja assignments jest pusta (brak zadań poza klasami). Osobno weakVerbCount (wszystkie słabe czasowniki) i weakVerbs (8 najsłabszych, z formami i znaczeniami). Analiza liczy się z podejść, więc przy quizach z losowaniem pytań liczby per pytanie są mniejsze niż liczba podejść. Na tej podstawie napisz wnioski.',
      inputSchema: { userId: auth0UserId },
      annotations: { readOnlyHint: true },
    },
    async ({ userId }) => {
      if (!admin) return needAdmin()
      const results = await adminStudentResults(userId, 200)
      if (!results) return failure('Nie znaleziono użytkownika.')
      const [lastActiveDay, weakCount, weakVerbs] = await Promise.all([
        classes.lastActiveDayOf(userId),
        reviews.weakVerbCount(userId),
        weakVerbDetails(userId, 8),
      ])
      return text({
        user: { userId, name: results.name, email: results.email },
        lessonsCompleted: results.lessonsCompleted,
        weakVerbCount: weakCount,
        weakVerbs,
        analysis: analyzeStudent(historyAnalysisInput(results.attempts, lastActiveDay)),
      })
    },
  )

  server.registerTool(
    'class_transfer',
    {
      title: 'Przekaż klasę (admin)',
      description:
        'Zmienia właściciela klasy na innego nauczyciela albo admina (newOwnerId = id Auth0 konta, które ma rolę teacher lub admin). Członkowie, zadania i wyniki zostają. Nie przekażesz klasy zarchiwizowanej ani klasy właścicielowi, który już nią jest. Admin nie zmienia klas inaczej niż przez to narzędzie. Wymaga confirm=true. Zapisuje wpis audytu ze starym i nowym właścicielem.',
      inputSchema: {
        classId: z.string().uuid().describe('Id klasy (UUID) z class_list scope=all'),
        newOwnerId: auth0UserId.describe('Identyfikator Auth0 nowego właściciela (nauczyciela albo admina)'),
        confirm,
      },
      annotations: { destructiveHint: true },
    },
    async ({ classId, newOwnerId }) => {
      if (!admin) return needAdmin()
      return refusing(async () => {
        const result = await transferClass(classId, newOwnerId)
        await audit(ctx, 'class_transfer', { id: classId, label: result.name }, { classId, from: result.from, to: result.to })
        return text({ classId, ownerId: result.to })
      })
    },
  )

  server.registerTool(
    'attempt_get',
    {
      title: 'Podejście z odpowiedziami (admin)',
      description:
        'Jedno podejście: wynik (score z maxScore i percent), autor (z e-mailem), quiz oraz odpowiedź na każde pytanie (type, points, earned, correct, answer, correctAnswers). prompt i type są null, gdy pytanie usunięto przy edycji quizu. Id podejścia pochodzi z attempt_list.',
      inputSchema: { attemptId: z.string().uuid().describe('Id podejścia (UUID) z attempt_list') },
      annotations: { readOnlyHint: true },
    },
    async ({ attemptId }) => {
      if (!admin) return needAdmin()
      const attempt = await attempts.getAttempt(attemptId)
      return attempt ? text(attempt) : { isError: true, content: [{ type: 'text', text: 'Nie znaleziono podejścia.' }] }
    },
  )
}
