import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import quizFileSchema from '../../data/quiz.schema.json' with { type: 'json' }
import { DIFFICULTIES, POPULARITIES, quizInput } from '../../src/shared/quiz/schema'
import { SUBJECTS } from '../../src/shared/quiz/types'
import { listVerbs } from '../irregularVerbs'
import * as repo from '../quizRepo'
import { audit, failure, needQuizWrite, text } from './context'
import type { Ctx } from './context'

const uuid = z.string().uuid().describe('Id quizu (UUID)')

/** quiz_* and verbs_list: reading is open to everybody, changes need write:quizzes. */
export function registerQuizTools(server: McpServer, ctx: Ctx) {
  server.registerTool(
    'quiz_list',
    {
      title: 'Lista quizów',
      description: 'Zwraca ręcznie utworzone quizy (id, tytuł, przedmiot, liczba pytań, ile pytań losuje się z puli, liczba podejść).',
      inputSchema: {
        difficulty: z.enum(DIFFICULTIES).optional(),
        subject: z.enum([...SUBJECTS, 'none']).optional().describe('Przedmiot (math, physics, chemistry, biology, geography, history, polish, english, it, other) albo none = bez przedmiotu'),
        sort: z.enum(['recent', 'popular']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ difficulty, subject, sort }) => text(await repo.listQuizzes({ difficulty, subject, sort }, ctx.canWriteQuizzes, ctx.userId)),
  )

  server.registerTool(
    'quiz_get',
    {
      title: 'Pobierz quiz',
      description:
        'Zwraca quiz z pytaniami. Z withAnswers=true także poprawne odpowiedzi, wyjaśnienia i ustawienia gry w formacie, który przyjmują quiz_create i quiz_update (wymaga write:quizzes).',
      inputSchema: { id: uuid, withAnswers: z.boolean().default(false) },
      annotations: { readOnlyHint: true },
    },
    async ({ id, withAnswers }) => {
      if (withAnswers && !ctx.canWriteQuizzes) return needQuizWrite()
      const quiz = await repo.getQuiz(id, withAnswers, ctx.canWriteQuizzes)
      return quiz ? text(quiz) : failure('Nie znaleziono quizu.')
    },
  )

  server.registerTool(
    'quiz_schema',
    {
      title: 'Schemat quizu',
      description: 'JSON Schema (2020-12) obiektu quizu przyjmowanego przez quiz_create i quiz_update, z regułami dla każdego typu pytania.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => text(quizFileSchema),
  )

  server.registerTool(
    'verbs_list',
    {
      title: 'Katalog czasowników nieregularnych',
      description: 'Czasowniki nieregularne (formy, znaczenia, przykłady) - materiał do tworzenia quizów. Maksymalnie 100 wyników.',
      inputSchema: {
        difficulty: z.enum(DIFFICULTIES).optional(),
        popularity: z.enum(POPULARITIES).optional(),
        pattern: z.enum(['AAA', 'ABA', 'ABB', 'ABC']).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, ...filter }) => text((await listVerbs(filter)).slice(0, limit)),
  )

  server.registerTool(
    'quiz_create',
    {
      title: 'Utwórz quiz',
      description:
        'Tworzy quiz. Typy pytań: single (jedna poprawna), multiple, truefalse, text (opcje to akceptowane odpowiedzi). Pole subject grupuje quiz według przedmiotu (math, physics, chemistry, biology, geography, history, polish, english, it, other). Ustawienia: shuffleQuestions (null=ustawienie gracza), shuffleOptions, sampleSize (10/20/30 pytań losowanych z puli lub null). Schemat: quiz_schema.',
      inputSchema: { quiz: quizInput },
    },
    async ({ quiz }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      const id = await repo.createQuiz(quiz, { kind: 'manual', difficulty: quiz.difficulty, ownerId: ctx.userId })
      await audit(ctx, 'quiz_create', { id, label: quiz.title }, { questions: quiz.questions.length })
      return text(await repo.getQuiz(id, true, true))
    },
  )

  server.registerTool(
    'quiz_update',
    {
      title: 'Zastąp quiz',
      description:
        'Zastępuje całą zawartość quizu i jego ustawienia (id pytań i opcji się zmieniają). Pobierz najpierw quiz_get z withAnswers=true i zmodyfikuj wynik.',
      inputSchema: { id: uuid, quiz: quizInput },
      annotations: { idempotentHint: true, destructiveHint: true },
    },
    async ({ id, quiz }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      if (!(await repo.replaceQuiz(id, quiz))) return failure('Nie znaleziono quizu.')
      await audit(ctx, 'quiz_update', { id, label: quiz.title }, { questions: quiz.questions.length })
      return text(await repo.getQuiz(id, true, true))
    },
  )

  server.registerTool(
    'quiz_delete',
    {
      title: 'Usuń quiz',
      description: 'Trwale usuwa quiz (historia podejść zostaje). Wymaga confirm=true.',
      inputSchema: { id: uuid, confirm: z.literal(true).describe('Musi być true') },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      if (!(await repo.deleteQuiz(id))) return failure('Nie znaleziono quizu.')
      await audit(ctx, 'quiz_delete', { id })
      return text({ ok: true })
    },
  )
}
