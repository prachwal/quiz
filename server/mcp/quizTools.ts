import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import quizFileSchema from '../../data/quiz.schema.json' with { type: 'json' }
import { DIFFICULTIES, POPULARITIES, quizInput } from '../../src/shared/quiz/schema'
import { SUBJECTS } from '../../src/shared/quiz/types'
import { listVerbs, setVerbImage } from '../irregularVerbs'
import { MediaRefError } from '../media/repo'
import * as repo from '../quizRepo'
import { audit, failure, needQuizWrite, text } from './context'
import type { Ctx } from './context'

const uuid = z.string().uuid().describe('Id quizu (UUID)')

/** quiz_*, verbs_list and verb_set_image: reading is open to everybody, changes need write:quizzes. */
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
      description:
        'JSON Schema (2020-12) obiektu quizu przyjmowanego przez quiz_create i quiz_update, z regułami i limitami dla każdego typu pytania. Zawsze aktualny (czytany przy każdym wywołaniu) - przed tworzeniem lub zmianą quizu traktuj go jako źródło prawdy, a nie opisy innych narzędzi.',
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
    'verb_set_image',
    {
      title: 'Ilustracja czasownika',
      description:
        'Ustawia ilustrację czasownika nieregularnego (verbId z verbs_list; mediaId z media_upload albo media_upload_from_url). Plik musi być gotowy (nie w stanie pending). mediaId=null usuwa ilustrację. Ilustracja pokazuje się na slajdzie lekcji i w katalogu czasowników. Zmiana trafia do audytu (poprzednie i nowe id pliku). Wymaga write:quizzes.',
      inputSchema: {
        verbId: z.number().int().positive().describe('Id czasownika z verbs_list'),
        mediaId: z.string().uuid().nullable().describe('Id gotowego pliku albo null, aby usunąć ilustrację'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ verbId, mediaId }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      let change: Awaited<ReturnType<typeof setVerbImage>>
      try {
        change = await setVerbImage(verbId, mediaId)
      } catch (error) {
        if (error instanceof MediaRefError) return failure(error.message)
        throw error
      }
      if (!change) return failure('Nie znaleziono czasownika.')
      await audit(ctx, 'verb_set_image', { id: String(verbId) }, { verbId, mediaBefore: change.before, mediaAfter: change.after })
      return text({ verbId, imageMediaId: change.after })
    },
  )

  server.registerTool(
    'quiz_create',
    {
      title: 'Utwórz quiz',
      description:
        'Tworzy quiz. NAJPIERW wywołaj quiz_schema: tylko ono jest aktualnym źródłem reguł i limitów, a ten opis jest skrócony i po zmianach serwera może być nieaktualny (klient często buforuje listę narzędzi). Typy pytań: single, multiple, truefalse, text (opcje to akceptowane odpowiedzi), numeric (config {answer, tolerance?}), ordering (config {items: [{id, text}]}), matching (config {pairs: [{id, rightId, left, right}]}), cloze (treść ze znacznikami {{1}}…{{n}} i config {gaps: [{answers: []}]}). Typy numeric/ordering/matching/cloze nie używają options. Pole subject grupuje quiz według przedmiotu, a ustawienia (shuffleQuestions, shuffleOptions, sampleSize) opisuje schemat.',
      inputSchema: { quiz: quizInput },
    },
    async ({ quiz }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      let id: string
      try {
        id = await repo.createQuiz(quiz, { kind: 'manual', difficulty: quiz.difficulty, ownerId: ctx.userId })
      } catch (error) {
        if (error instanceof MediaRefError) return failure(error.message)
        throw error
      }
      await audit(ctx, 'quiz_create', { id, label: quiz.title }, { questions: quiz.questions.length })
      return text(await repo.getQuiz(id, true, true))
    },
  )

  server.registerTool(
    'quiz_update',
    {
      title: 'Zastąp quiz',
      description:
        'Zastępuje całą zawartość quizu i jego ustawienia (id pytań i opcji się zmieniają). Pobierz najpierw quiz_get z withAnswers=true i zmodyfikuj wynik; reguły i limity pól sprawdź w quiz_schema (aktualne przy każdym wywołaniu, w odróżnieniu od tego opisu).',
      inputSchema: { id: uuid, quiz: quizInput },
      annotations: { idempotentHint: true, destructiveHint: true },
    },
    async ({ id, quiz }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      let replaced: boolean
      try {
        replaced = await repo.replaceQuiz(id, quiz)
      } catch (error) {
        if (error instanceof MediaRefError) return failure(error.message)
        throw error
      }
      if (!replaced) return failure('Nie znaleziono quizu.')
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
