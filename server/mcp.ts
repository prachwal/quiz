import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Request, RequestHandler, Response } from 'express'
import { z } from 'zod'
import quizFileSchema from '../data/quiz.schema.json' with { type: 'json' }
import { DIFFICULTIES, POPULARITIES, quizInput } from '../src/shared/quiz/schema'
import { currentUserId, hasPermission, WRITE_QUIZZES } from './auth'
import { listVerbs } from './irregularVerbs'
import * as repo from './quizRepo'

/**
 * Model Context Protocol endpoint (`POST /api/mcp`, Streamable HTTP, stateless, JSON responses).
 * It sits behind the normal authentication, so a client authenticates with `Authorization: Bearer qz_...`
 * (a personal API token) and gets exactly the permissions of that token: reading for everybody,
 * writing quizzes only with `write:quizzes`.
 */

const text = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})
const failure = (message: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: message }] })

const uuid = z.string().uuid().describe('Id quizu (UUID)')

function buildServer(req: Request) {
  const canWrite = hasPermission(req, WRITE_QUIZZES)
  const needWrite = () => failure('Ta operacja wymaga uprawnienia write:quizzes (token administratora z prawem zapisu).')

  const server = new McpServer({ name: 'quiz', version: '1.0.0' })

  server.registerTool(
    'list_quizzes',
    {
      title: 'Lista quizów',
      description: 'Zwraca ręcznie utworzone quizy (id, tytuł, liczba pytań, ile pytań losuje się z puli, liczba podejść).',
      inputSchema: { difficulty: z.enum(DIFFICULTIES).optional(), sort: z.enum(['recent', 'popular']).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ difficulty, sort }) => text(await repo.listQuizzes({ difficulty, sort }, canWrite)),
  )

  server.registerTool(
    'get_quiz',
    {
      title: 'Pobierz quiz',
      description:
        'Zwraca quiz z pytaniami. Z withAnswers=true także poprawne odpowiedzi, wyjaśnienia i ustawienia gry w formacie, który przyjmuje create_quiz/update_quiz (wymaga write:quizzes).',
      inputSchema: { id: uuid, withAnswers: z.boolean().default(false) },
      annotations: { readOnlyHint: true },
    },
    async ({ id, withAnswers }) => {
      if (withAnswers && !canWrite) return needWrite()
      const quiz = await repo.getQuiz(id, withAnswers, canWrite)
      return quiz ? text(quiz) : failure('Nie znaleziono quizu')
    },
  )

  server.registerTool(
    'get_quiz_schema',
    {
      title: 'Schemat quizu',
      description: 'JSON Schema (2020-12) obiektu quizu przyjmowanego przez create_quiz i update_quiz, z regułami dla każdego typu pytania.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => text(quizFileSchema),
  )

  server.registerTool(
    'list_irregular_verbs',
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
    'create_quiz',
    {
      title: 'Utwórz quiz',
      description:
        'Tworzy quiz. Typy pytań: single (jedna poprawna), multiple, truefalse, text (opcje to akceptowane odpowiedzi). Ustawienia: shuffleQuestions (null=ustawienie gracza), shuffleOptions, sampleSize (10/20/30 pytań losowanych z puli lub null). Schemat: get_quiz_schema.',
      inputSchema: { quiz: quizInput },
    },
    async ({ quiz }) => {
      if (!canWrite) return needWrite()
      const id = await repo.createQuiz(quiz, { kind: 'manual', difficulty: quiz.difficulty, ownerId: currentUserId(req) })
      return text(await repo.getQuiz(id, true, true))
    },
  )

  server.registerTool(
    'update_quiz',
    {
      title: 'Zastąp quiz',
      description:
        'Zastępuje całą zawartość quizu i jego ustawienia (id pytań i opcji się zmieniają). Pobierz najpierw get_quiz z withAnswers=true i zmodyfikuj wynik.',
      inputSchema: { id: uuid, quiz: quizInput },
      annotations: { idempotentHint: true, destructiveHint: true },
    },
    async ({ id, quiz }) => {
      if (!canWrite) return needWrite()
      if (!(await repo.replaceQuiz(id, quiz))) return failure('Nie znaleziono quizu')
      return text(await repo.getQuiz(id, true, true))
    },
  )

  server.registerTool(
    'delete_quiz',
    {
      title: 'Usuń quiz',
      description: 'Trwale usuwa quiz (historia podejść zostaje). Wymaga confirm=true.',
      inputSchema: { id: uuid, confirm: z.literal(true).describe('Musi być true') },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      if (!canWrite) return needWrite()
      return (await repo.deleteQuiz(id)) ? text({ ok: true }) : failure('Nie znaleziono quizu')
    },
  )

  return server
}

/**
 * Stateless: a fresh server + transport per request, which is what a serverless function needs.
 * Uses the web-standard transport - the Node one reads raw headers that the serverless adapter's fake
 * request does not provide - and copies the resulting `Response` to Express.
 */
export const mcpHandler: RequestHandler = async (req: Request, res: Response) => {
  const server = buildServer(req)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    // clients must send both Accept types; be lenient so that simple HTTP clients work too
    const webRequest = new Request(`https://${req.headers.host ?? 'localhost'}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    })
    const response = await transport.handleRequest(webRequest, { parsedBody: req.body })
    res.status(response.status)
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.send(await response.text())
  } finally {
    void transport.close()
    void server.close()
  }
}

export const mcpNotAllowed: RequestHandler = (_req, res) => {
  res
    .status(405)
    .set('Allow', 'POST')
    .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST (stateless server).' }, id: null })
}
