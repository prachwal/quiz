// Full local test of the MCP server: every tool, permissions, validation and the audit trail.
// Runs the real Express app in-process against DATABASE_URL; use `npm run test:mcp`
// (scripts/mcp-local-e2e.sh starts scripts/dev-server.mjs and removes it afterwards).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { createApiToken } from '../server/apiTokens'
import { createApp } from '../server/app'
import { pool } from '../server/db'
import * as repo from '../server/quizRepo'
import * as adminRepo from '../server/adminRepo'
import * as appSettings from '../server/appSettingsRepo'
import * as media from '../server/media/repo'
import { getStorage } from '../server/media/driver'
import { listVerbs } from '../server/irregularVerbs'

type Result = { err: boolean; data: any }
let passed = 0
const failures: string[] = []
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1
  else failures.push(`${name}${detail === undefined ? '' : ` -> ${JSON.stringify(detail).slice(0, 200)}`}`)
}

const P = 'mcp-e2e' // every row this test creates is keyed by this prefix, so cleanup is exact
const TEACHER = `teacher|${P}`
const OTHER = `teacher|${P}-other`
const ADMIN = `admin|${P}`
const PLAIN = `plain|${P}`
const STUDENT = `discord|${P}-student`
const STUDENT2 = `discord|${P}-student2`

// MCP_E2E_URL=http://localhost:8888/api runs the same checks through a running `npm run dev:full`
// (the real bundled function and proxy) instead of the in-process app; both use the same database.
const external = process.env.MCP_E2E_URL?.replace(/\/$/, '')
const app = external ? null : createServer(createApp()).listen(0)
const base = external ?? `http://localhost:${(app!.address() as AddressInfo).port}`

const token = async (userId: string, permissions: string[]) =>
  ((await createApiToken({ userId, name: P, permissions, expiresInDays: 30 })) as { token: string }).token

const open = async (bearer: string) => {
  const client = new Client({ name: P, version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }))
  return client
}

const call = async (client: Client, name: string, args: object): Promise<Result> => {
  try {
    const r: any = await client.callTool({ name, arguments: args })
    const text = r.content[0].text as string
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {
      // plain text (errors)
    }
    return { err: !!r.isError, data }
  } catch (e) {
    return { err: true, data: String((e as Error).message) } // protocol-level rejection (input validation)
  }
}
const ok = (name: string, r: Result, extra?: (d: any) => boolean) => check(name, !r.err && (extra ? extra(r.data) : true), r.data)
const denied = (name: string, r: Result, includes?: string) => check(name, r.err && (!includes || String(r.data).includes(includes)), r.data)

async function cleanup() {
  const db = pool()
  await db.query('DELETE FROM classes WHERE owner_id LIKE $1', [`%${P}%`])
  await db.query('DELETE FROM quiz_attempts WHERE user_id LIKE $1', [`%${P}%`])
  // media references first: media_refs has no foreign key to quizzes, and media rows are RESTRICTed while referenced
  await db.query(`DELETE FROM media_refs WHERE owner_kind = 'quiz' AND owner_id IN (SELECT id::text FROM quizzes WHERE title LIKE 'MCP E2E%')`)
  await db.query('DELETE FROM media_refs WHERE media_id IN (SELECT id FROM media WHERE owner_id LIKE $1)', [`%${P}%`])
  await db.query('DELETE FROM media WHERE owner_id LIKE $1', [`%${P}%`])
  // lesson intros: references first, then the throwaway course (its lessons and lesson_verbs cascade)
  await db.query(
    `DELETE FROM media_refs WHERE owner_kind = 'lesson' AND owner_id IN (SELECT id::text FROM lessons WHERE title LIKE $1 OR course_id IN (SELECT id FROM courses WHERE slug LIKE $1))`,
    [`${P}%`],
  )
  await db.query('DELETE FROM courses WHERE slug LIKE $1', [`${P}%`])
  await db.query('DELETE FROM lessons WHERE title LIKE $1', [`${P}%`])
  await db.query("DELETE FROM quizzes WHERE title LIKE 'MCP E2E%'")
  await db.query('DELETE FROM user_profiles WHERE user_id LIKE $1', [`%${P}%`])
  await db.query('DELETE FROM api_tokens WHERE user_id LIKE $1', [`%${P}%`])
  await db.query('DELETE FROM admin_audit_log WHERE actor_id LIKE $1', [`%${P}%`])
  await db.query('DELETE FROM feedback WHERE user_id LIKE $1', [`%${P}%`])
}

const textQuestion = (n: number) => ({ type: 'text', prompt: `P${n}`, explanation: `e${n}`, points: 1, options: [{ text: `a${n}`, isCorrect: true }] })

try {
  await cleanup()
  await pool().query(
    `INSERT INTO user_profiles (user_id, display_name, email) VALUES
       ($1, 'Ewa Nauczycielka', 'ewa@szkola.pl'), ($2, 'Ala Uczennica', 'ala.uczennica@szkola.pl'), ($3, 'Alan Drugi', 'alan@szkola.pl')`,
    [TEACHER, STUDENT, STUDENT2],
  )
  const tTeacher = await open(await token(TEACHER, ['manage:classes']))
  const tAdminWrite = await open(await token(`${ADMIN}-w`, ['write:quizzes']))
  const tAdmin = await open(await token(ADMIN, ['manage:users']))
  const tOther = await open(await token(OTHER, ['manage:classes']))
  const tPlain = await open(await token(PLAIN, []))

  // ---- transport and authentication ------------------------------------------------------
  const anonymous = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  check('anonymous POST /mcp -> 401', anonymous.status === 401, anonymous.status)
  const get = await fetch(`${base}/mcp`, { headers: { Authorization: 'Bearer nope' } })
  check('bad token GET /mcp -> 401', get.status === 401, get.status)
  const getOk = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${await token(PLAIN, [])}` } })
  check('GET /mcp -> 405', getOk.status === 405, getOk.status)
  const names = (await tPlain.listTools()).tools.map((t) => t.name).sort()
  check('51 tools listed', names.length === 51, names.length)
  for (const required of ['quiz_create', 'class_create', 'student_search', 'student_add', 'class_analyze', 'assignment_create', 'attempt_list', 'attempt_get', 'quiz_stats', 'user_results', 'user_analysis', 'user_list', 'user_get', 'user_search', 'user_roles_set', 'user_block', 'class_transfer', 'audit_list', 'feedback_list', 'feedback_update', 'settings_get', 'settings_set', 'system_stats', 'media_upload', 'media_upload_from_url', 'media_create_upload', 'media_complete', 'media_list', 'media_get', 'media_delete', 'lesson_get', 'lesson_update'])
    check(`tool ${required} exists`, names.includes(required))

  // ---- quizzes ---------------------------------------------------------------------------
  ok('quiz_schema', await call(tPlain, 'quiz_schema', {}), (d) => d.title === 'Quiz' && !!d.$defs?.question)
  ok('verbs_list (limit)', await call(tPlain, 'verbs_list', { limit: 5 }), (d) => Array.isArray(d) && d.length === 5)
  ok('verbs_list (filter)', await call(tPlain, 'verbs_list', { pattern: 'AAA', limit: 100 }), (d) => d.length > 0 && d.every((v: any) => v.pattern === 'AAA'))

  const quiz = {
    title: 'MCP E2E quiz',
    description: 'test',
    difficulty: 'easy',
    subject: 'math',
    shuffleQuestions: true,
    shuffleOptions: true,
    sampleSize: 10,
    questions: [
      { type: 'single', prompt: '2+2?', explanation: '', points: 2, options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] },
      { type: 'multiple', prompt: 'Parzyste', explanation: '', points: 1, options: [{ text: '2', isCorrect: true }, { text: '4', isCorrect: true }, { text: '3', isCorrect: false }] },
      { type: 'truefalse', prompt: 'Ziemia jest płaska', explanation: '', points: 1, options: [{ text: 'Prawda', isCorrect: false }, { text: 'Fałsz', isCorrect: true }] },
      textQuestion(1),
    ],
  }
  const created = await call(tAdminWrite, 'quiz_create', { quiz })
  ok('quiz_create (all 4 types + settings)', created, (d) => d.questions.length === 4 && d.sampleSize === 10 && d.subject === 'math' && d.shuffleOptions === true && d.shuffleQuestions === true)
  const quizId: string = created.data.id
  denied('quiz_create without write', await call(tPlain, 'quiz_create', { quiz }), 'write:quizzes')
  denied('quiz_create invalid (no questions)', await call(tAdminWrite, 'quiz_create', { quiz: { title: 'MCP E2E bad', questions: [] } }))
  denied('quiz_create invalid (single with 2 correct)', await call(tAdminWrite, 'quiz_create', { quiz: { title: 'MCP E2E bad', questions: [{ type: 'single', prompt: 'p', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] }] } }))
  ok('quiz_list', await call(tPlain, 'quiz_list', {}), (d) => d.some((q: any) => q.id === quizId && q.sampleSize === 10 && q.questionCount === 4))
  ok('quiz_list (subject filter)', await call(tPlain, 'quiz_list', { subject: 'math' }), (d) => d.some((q: any) => q.id === quizId && q.subject === 'math'))
  ok('quiz_list (other subject excludes it)', await call(tPlain, 'quiz_list', { subject: 'chemistry' }), (d) => !d.some((q: any) => q.id === quizId))
  ok('quiz_list (difficulty filter)', await call(tPlain, 'quiz_list', { difficulty: 'easy' }), (d) => d.some((q: any) => q.id === quizId))
  ok('quiz_get (player view hides answers)', await call(tPlain, 'quiz_get', { id: quizId }), (d) => d.questions.every((q: any) => q.options.every((o: any) => o.isCorrect === undefined)) && d.questions.find((q: any) => q.type === 'text').options.length === 0)
  denied('quiz_get withAnswers without write', await call(tPlain, 'quiz_get', { id: quizId, withAnswers: true }), 'write:quizzes')
  const full = await call(tAdminWrite, 'quiz_get', { id: quizId, withAnswers: true })
  ok('quiz_get withAnswers', full, (d) => d.questions.find((q: any) => q.type === 'text').options[0].isCorrect === true && d.sampleSize === 10)
  denied('quiz_get unknown id', await call(tPlain, 'quiz_get', { id: '00000000-0000-4000-8000-000000000000' }), 'Nie znaleziono')
  denied('quiz_get bad id', await call(tPlain, 'quiz_get', { id: 'abc' }))
  ok('quiz_update (settings change)', await call(tAdminWrite, 'quiz_update', { id: quizId, quiz: { ...quiz, title: 'MCP E2E quiz 2', sampleSize: null, shuffleQuestions: null, shuffleOptions: false } }), (d) => d.title === 'MCP E2E quiz 2' && d.sampleSize === null && d.shuffleQuestions === null && d.shuffleOptions === false)
  denied('quiz_update without write', await call(tPlain, 'quiz_update', { id: quizId, quiz }), 'write:quizzes')
  denied('quiz_update unknown id', await call(tAdminWrite, 'quiz_update', { id: '00000000-0000-4000-8000-000000000000', quiz }), 'Nie znaleziono')
  const doomed = (await call(tAdminWrite, 'quiz_create', { quiz: { ...quiz, title: 'MCP E2E doomed' } })).data.id as string
  denied('quiz_delete without confirm', await call(tAdminWrite, 'quiz_delete', { id: doomed, confirm: false }))
  denied('quiz_delete without write', await call(tPlain, 'quiz_delete', { id: doomed, confirm: true }), 'write:quizzes')
  ok('quiz_delete', await call(tAdminWrite, 'quiz_delete', { id: doomed, confirm: true }), (d) => d.ok === true)
  denied('quiz_delete twice', await call(tAdminWrite, 'quiz_delete', { id: doomed, confirm: true }), 'Nie znaleziono')

  // ---- images in quiz text (Media-Storage-Plan M2): references, refusals, cleanup ---------
  const mediaRow = async (id: string, status: 'ready' | 'pending') => {
    await media.createPending({ id, key: `media/2026/${id}.png`, contentType: 'image/png', sizeBytes: 1200, sha256: createHash('sha256').update(id).digest('hex'), source: 'script', ownerId: `admin|${P}-media` })
    if (status === 'ready') await media.markReady(id, { width: 800, height: 450 })
  }
  const readyId = randomUUID()
  const explainId = randomUUID() // used only in the explanation: it must not reach the player view
  const pendingId = randomUUID()
  await mediaRow(readyId, 'ready')
  await mediaRow(explainId, 'ready')
  await mediaRow(pendingId, 'pending')
  const img = (alt: string, id: string) => `![${alt}](media:${id})`
  const withImage = (prompt: string, explanation: string, optionText: string) => ({
    title: 'MCP E2E media',
    difficulty: 'easy',
    questions: [
      { type: 'single', prompt, explanation, points: 1, options: [{ text: optionText, isCorrect: true }, { text: '5', isCorrect: false }] },
    ],
  })
  const refsOf = async (quizId: string) =>
    (await pool().query<{ id: string }>(`SELECT media_id::text AS id FROM media_refs WHERE owner_kind = 'quiz' AND owner_id = $1`, [quizId])).rows.map((r) => r.id)

  const imageQuiz = withImage(`Co pokazuje ${img('Mapa Polski', readyId)}?`, `Patrz ${img('Schemat', explainId)}.`, img('Kot', readyId))
  const imageCreated = await call(tAdminWrite, 'quiz_create', { quiz: imageQuiz })
  ok('quiz_create with a ready image in prompt, explanation and option', imageCreated, (d) => d.questions[0].prompt === imageQuiz.questions[0].prompt)
  const imageQuizId: string = imageCreated.data.id
  ok('quiz_get returns the image syntax unchanged', await call(tAdminWrite, 'quiz_get', { id: imageQuizId, withAnswers: true }), (d) =>
    d.questions[0].prompt === imageQuiz.questions[0].prompt && d.questions[0].explanation === imageQuiz.questions[0].explanation && d.questions[0].options[0].text === imageQuiz.questions[0].options[0].text)
  check('media_refs: one reference per file', JSON.stringify((await refsOf(imageQuizId)).sort()) === JSON.stringify([readyId, explainId].sort()), await refsOf(imageQuizId))
  denied('quiz_create with an unknown media id', await call(tAdminWrite, 'quiz_create', { quiz: withImage(`P ${img('x', randomUUID())}`, '', 'a') }), 'nieistniejące')
  denied('quiz_create with a pending media id', await call(tAdminWrite, 'quiz_create', { quiz: withImage(`P ${img('x', pendingId)}`, '', 'a') }), 'jeszcze niewysłane')
  denied('quiz_create with an external https image', await call(tAdminWrite, 'quiz_create', { quiz: withImage(`P ![x](https://example.com/a.png)`, '', 'a') }), 'media_upload')
  denied('quiz_create with an image in a text option', await call(tAdminWrite, 'quiz_create', { quiz: { title: 'MCP E2E media text', questions: [{ type: 'text', prompt: 'P', options: [{ text: img('x', readyId), isCorrect: true }] }] } }), 'odpowiedziach tekstowych')
  denied('quiz_create with an empty alt', await call(tAdminWrite, 'quiz_create', { quiz: withImage(`P ${img('', readyId)}`, '', 'a') }), 'wymaga opisu')
  check('refused quizzes left no references', (await pool().query("SELECT COUNT(*)::int AS n FROM media_refs WHERE owner_id IN (SELECT id::text FROM quizzes WHERE title LIKE 'MCP E2E media%' AND id <> $1)", [imageQuizId])).rows[0].n === 0)

  ok('quiz_update removing the image clears the reference', await call(tAdminWrite, 'quiz_update', { id: imageQuizId, quiz: withImage('Co pokazuje?', 'Patrz.', 'Kot') }), (d) => d.questions[0].prompt === 'Co pokazuje?')
  check('media_refs cleared by quiz_update', (await refsOf(imageQuizId)).length === 0, await refsOf(imageQuizId))
  ok('quiz_update adding the image back', await call(tAdminWrite, 'quiz_update', { id: imageQuizId, quiz: imageQuiz }))
  check('media_refs restored by quiz_update', JSON.stringify((await refsOf(imageQuizId)).sort()) === JSON.stringify([readyId, explainId].sort()))

  // ---- media map in the REST responses (Media-Storage-Plan M3) -----------------------------
  const mediaOf = (d: any) => d.media as Record<string, { url: string; width: number | null; height: number | null }> | undefined
  const expectedUrl = `https://media.test/media/2026/${readyId}.png`
  const rest = async (path: string, init: RequestInit & { bearer: string }) => {
    const { bearer, ...rest } = init
    const response = await fetch(`${base}${path}`, { ...rest, headers: { 'content-type': 'application/json', Authorization: `Bearer ${bearer}` } })
    return { status: response.status, body: await response.json().catch(() => null) as any }
  }
  const plainBearer = await token(PLAIN, [])
  const playerView = await rest(`/quizzes/${imageQuizId}`, { method: 'GET', bearer: plainBearer })
  check('GET quiz (player view) -> 200', playerView.status === 200, playerView.status)
  check('GET quiz (player view) has the map of the prompt and option images', mediaOf(playerView.body)?.[readyId]?.url === expectedUrl && mediaOf(playerView.body)?.[readyId]?.width === 800 && mediaOf(playerView.body)?.[readyId]?.height === 450, playerView.body?.media)
  check('GET quiz (player view) never maps the explanation image', mediaOf(playerView.body)?.[explainId] === undefined, playerView.body?.media)
  check('GET quiz (player view) does not carry explanations', !('explanation' in (playerView.body?.questions?.[0] ?? {})))
  const editorView = await rest(`/quizzes/${imageQuizId}?include=answers`, { method: 'GET', bearer: await token(`${ADMIN}-w`, ['write:quizzes']) })
  check('GET quiz (?include=answers) maps the explanation image too', mediaOf(editorView.body)?.[explainId]?.url === `https://media.test/media/2026/${explainId}.png`, editorView.body?.media)
  const plainQuiz = await rest(`/quizzes/${quizId}`, { method: 'GET', bearer: plainBearer })
  check('GET quiz without images has no media key (JSON unchanged)', plainQuiz.status === 200 && !('media' in plainQuiz.body), Object.keys(plainQuiz.body ?? {}))

  const questionOf = playerView.body.questions[0]
  const graded = await rest(`/quizzes/${imageQuizId}/grade`, {
    method: 'POST',
    bearer: await token(STUDENT, []),
    body: JSON.stringify({ answers: { [questionOf.id]: { optionIds: [questionOf.options[0].id] } } }),
  })
  check('grade with an explanation image -> the response maps it', graded.status === 200 && mediaOf(graded.body)?.[explainId]?.url === `https://media.test/media/2026/${explainId}.png`, graded.body)
  check('grade response maps the image of the chosen option too', mediaOf(graded.body)?.[readyId]?.url === expectedUrl, graded.body?.media)
  // a helper quiz without images, made and removed through the repository (no audit entries, no list changes)
  const plainId = await repo.createQuiz({ title: 'MCP E2E plain grade', description: '', shuffleOptions: false, questions: [textQuestion(7)] } as never, { kind: 'manual', ownerId: null })
  const gradedPlain = await rest(`/quizzes/${plainId}/grade`, { method: 'POST', bearer: plainBearer, body: JSON.stringify({ answers: {} }) })
  check('grade of a quiz without images has no media key (JSON unchanged)', gradedPlain.status === 200 && !('media' in gradedPlain.body), Object.keys(gradedPlain.body ?? {}))
  await repo.deleteQuiz(plainId)
  check('REST create with an unknown image -> 400 with the ids', (await rest('/quizzes', { method: 'POST', bearer: await token(`${ADMIN}-w`, ['write:quizzes']), body: JSON.stringify({ ...withImage(`P ${img('x', randomUUID())}`, '', 'a') }) })).status === 400)

  ok('quiz_delete', await call(tAdminWrite, 'quiz_delete', { id: imageQuizId, confirm: true }), (d) => d.ok === true)
  check('media_refs cleared by quiz_delete', (await refsOf(imageQuizId)).length === 0, await refsOf(imageQuizId))

  // ---- classes ---------------------------------------------------------------------------
  const cls = await call(tTeacher, 'class_create', { name: 'MCP E2E klasa' })
  ok('class_create', cls, (d) => d.name === 'MCP E2E klasa' && /^[A-Z0-9]{6}$/.test(d.joinCode) && d.joiningOpen === true && d.ownerId === TEACHER)
  const classId: string = cls.data.id
  denied('class_create invalid name', await call(tTeacher, 'class_create', { name: 'x' }))
  denied('class_create as plain', await call(tPlain, 'class_create', { name: 'Nope nope' }), 'nauczyciela')
  denied('class_create as admin without teacher role', await call(tAdmin, 'class_create', { name: 'Admin klasa' }), 'nauczyciela')
  ok('class_list (own)', await call(tTeacher, 'class_list', {}), (d) => d.length === 1 && d[0].id === classId && d[0].ownerName === 'Ewa Nauczycielka')
  ok('class_list (admin own = none)', await call(tAdmin, 'class_list', {}), (d) => d.length === 0)
  ok('class_list (admin all)', await call(tAdmin, 'class_list', { scope: 'all' }), (d) => d.some((c: any) => c.id === classId))
  ok('class_list (other teacher sees none)', await call(tOther, 'class_list', { scope: 'all' }), (d) => d.length === 0)
  denied('class_list plain', await call(tPlain, 'class_list', {}), 'nauczyciela')
  ok('class_update (name + closed)', await call(tTeacher, 'class_update', { classId, name: 'MCP E2E klasa 2', joiningOpen: false }), (d) => d.name === 'MCP E2E klasa 2' && d.joiningOpen === false)
  denied('class_update nothing', await call(tTeacher, 'class_update', { classId }), 'name lub joiningOpen')
  denied('class_update by other teacher', await call(tOther, 'class_update', { classId, name: 'hacked' }), 'Nie znaleziono klasy')
  denied('class_update by admin (read-only)', await call(tAdmin, 'class_update', { classId, name: 'hacked' }), 'nauczyciela')
  const code = await call(tTeacher, 'class_regenerate_code', { classId, confirm: true })
  ok('class_regenerate_code', code, (d) => /^[A-Z0-9]{6}$/.test(d.joinCode) && d.joinCode !== cls.data.joinCode)
  denied('class_regenerate_code without confirm', await call(tTeacher, 'class_regenerate_code', { classId, confirm: false }))

  // ---- students --------------------------------------------------------------------------
  denied('student_search too short', await call(tTeacher, 'student_search', { classId, query: 'al' }))
  ok('student_search by name (both Ala and Alan match "ala")', await call(tTeacher, 'student_search', { classId, query: 'ala' }), (d) => d.length === 2 && d.every((s: any) => s.emailMasked === 'al***@szkola.pl' && !('email' in s) && s.inClass === false))
  ok('student_search by name (narrower)', await call(tTeacher, 'student_search', { classId, query: 'uczennica' }), (d) => d.length === 1 && d[0].userId === STUDENT)
  ok('student_search by id', await call(tTeacher, 'student_search', { classId, query: 'student2' }), (d) => d.length === 1 && d[0].userId === STUDENT2)
  ok('student_search never returns the teacher', await call(tTeacher, 'student_search', { classId, query: 'ewa' }), (d) => d.length === 0)
  ok('student_search wildcard is literal', await call(tTeacher, 'student_search', { classId, query: '%%%' }), (d) => d.length === 0)
  denied('student_search other teacher', await call(tOther, 'student_search', { classId, query: 'ala' }), 'Nie znaleziono klasy')
  ok('student_add', await call(tTeacher, 'student_add', { classId, userId: STUDENT }), (d) => d.status === 'added' && d.name === 'Ala Uczennica' && d.email === 'ala.uczennica@szkola.pl')
  ok('student_add again = already', await call(tTeacher, 'student_add', { classId, userId: STUDENT }), (d) => d.status === 'already')
  ok('student_add 2nd', await call(tTeacher, 'student_add', { classId, userId: STUDENT2 }), (d) => d.status === 'added')
  denied('student_add malformed id', await call(tTeacher, 'student_add', { classId, userId: 'nonsense' }), 'Niepoprawny identyfikator')
  denied('student_add unknown account', await call(tTeacher, 'student_add', { classId, userId: `google-oauth2|${P}-nobody` }), 'Nie znaleziono użytkownika')
  denied('student_add by other teacher', await call(tOther, 'student_add', { classId, userId: STUDENT }), 'Nie znaleziono klasy')
  denied('student_add by admin', await call(tAdmin, 'student_add', { classId, userId: STUDENT }), 'nauczyciela')
  ok('student_search flags members', await call(tTeacher, 'student_search', { classId, query: 'ala' }), (d) => d.length === 2 && d.every((s: any) => s.inClass === true))
  ok('student_list (class)', await call(tTeacher, 'student_list', { classId }), (d) => d.length === 2 && d.every((s: any) => s.classes[0].id === classId))
  ok('student_list (all own)', await call(tTeacher, 'student_list', {}), (d) => d.length === 2)
  ok('student_list (admin all)', await call(tAdmin, 'student_list', { scope: 'all' }), (d) => d.some((s: any) => s.userId === STUDENT))
  denied('student_list other teacher', await call(tOther, 'student_list', { classId }), 'Nie znaleziono klasy')
  ok('class_get', await call(tTeacher, 'class_get', { classId }), (d) => d.members.length === 2 && d.memberCount === 2 && d.assignments.length === 0)
  ok('class_get (admin read)', await call(tAdmin, 'class_get', { classId }), (d) => d.members.length === 2)
  denied('class_get other teacher', await call(tOther, 'class_get', { classId }), 'Nie znaleziono klasy')

  // ---- assignments -----------------------------------------------------------------------
  ok('course_list', await call(tTeacher, 'course_list', {}), (d) => d.length > 0 && !!d[0].id)
  const assignCourseId = (await call(tTeacher, 'course_list', {})).data[0].id as string
  const quizAssignment = await call(tTeacher, 'assignment_create', { classId, kind: 'quiz', targetId: quizId, dueAt: '2026-01-01T00:00:00Z' })
  ok('assignment_create (quiz, overdue)', quizAssignment, (d) => d.kind === 'quiz' && d.title === 'MCP E2E quiz 2')
  ok('assignment_create (course)', await call(tTeacher, 'assignment_create', { classId, kind: 'course', targetId: assignCourseId }), (d) => d.kind === 'course' && d.dueAt === null)
  denied('assignment_create unknown quiz', await call(tTeacher, 'assignment_create', { classId, kind: 'quiz', targetId: '00000000-0000-4000-8000-000000000000' }), 'Nie znaleziono')
  denied('assignment_create by other teacher', await call(tOther, 'assignment_create', { classId, kind: 'quiz', targetId: quizId }), 'Nie znaleziono klasy')
  const assignmentId: string = quizAssignment.data.id
  ok('assignment_update_due', await call(tTeacher, 'assignment_update_due', { classId, assignmentId, dueAt: '2031-01-01T00:00:00Z' }), (d) => d.ok === true)
  ok('assignment_update_due (clear)', await call(tTeacher, 'assignment_update_due', { classId, assignmentId, dueAt: null }), (d) => d.ok === true)
  denied('assignment_update_due unknown', await call(tTeacher, 'assignment_update_due', { classId, assignmentId: '00000000-0000-4000-8000-000000000000', dueAt: null }), 'Nie znaleziono zadania')

  // ---- results and analysis (a student answers the quiz twice, badly then well) ----------
  const gradable = (await repo.getQuiz(quizId, true))!
  const textQ = gradable.questions.find((q) => q.type === 'text')!
  const singleQ = gradable.questions.find((q) => q.type === 'single')!
  const save = async (answers: Record<string, { text?: string; optionIds?: string[] }>, correct: number) => {
    const { gradeQuiz } = await import('../src/shared/quiz/engine')
    const result = gradeQuiz(repo.toGradable(gradable), answers)
    check(`graded ${correct} correct`, result.results.filter((r) => r.correct).length === correct, result)
    await repo.saveAttempt({ quizId, quizTitle: gradable.title, userId: STUDENT, courseId: null, passed: null, answers, result })
  }
  await save({ [textQ.id]: { text: 'zle' }, [singleQ.id]: { optionIds: [singleQ.options.find((o) => o.text === '5')!.id] } }, 0)
  await save({ [textQ.id]: { text: 'a1' }, [singleQ.id]: { optionIds: [singleQ.options.find((o) => o.text === '4')!.id] } }, 2)
  const results = await call(tTeacher, 'student_results', { classId, userId: STUDENT })
  ok('student_results', results, (d) => d.attempts.length === 2 && d.attempts[0].questions.length === 4 && d.assignments.some((a: any) => a.status === 'done'))
  ok('student_results (admin read)', await call(tAdmin, 'student_results', { classId, userId: STUDENT }), (d) => d.attempts.length === 2)
  denied('student_results not a member', await call(tTeacher, 'student_results', { classId, userId: `discord|${P}-nobody` }), 'Nie znaleziono ucznia')
  denied('student_results other teacher', await call(tOther, 'student_results', { classId, userId: STUDENT }), 'Nie znaleziono klasy')
  ok('student_analyze', await call(tTeacher, 'student_analyze', { classId, userId: STUDENT }), (d) => d.analysis.attempts.count === 2 && d.analysis.attempts.latestPercent > d.analysis.attempts.averagePercent - 1 && d.analysis.hardestQuestions.length > 0 && Array.isArray(d.weakVerbs))
  ok('class_report', await call(tTeacher, 'class_report', { classId }), (d) => d.rows.length === 2 && d.assignments.length === 2)
  ok('class_analyze', await call(tTeacher, 'class_analyze', { classId }), (d) => d.students === 2 && d.assignments.length === 2 && d.needsAttention.some((s: any) => s.userId === STUDENT2) && d.summary.averageBestPercent !== null)
  ok('class_analyze (admin read)', await call(tAdmin, 'class_analyze', { classId }), (d) => d.students === 2)
  denied('class_analyze plain', await call(tPlain, 'class_analyze', { classId }), 'nauczyciela')

  // ---- admin read path: attempts of any quiz, no class membership needed ------------------
  const listed = await call(tAdmin, 'attempt_list', { quizId })
  ok('attempt_list by quiz', listed, (d) => d.total === 2 && d.attempts.length === 2 && d.attempts[0].userId === STUDENT && d.attempts[0].source === 'manual' && d.attempts[0].userName === 'Ala Uczennica' && d.hasMore === false)
  ok('attempt_list paging', await call(tAdmin, 'attempt_list', { quizId, limit: 1 }), (d) => d.total === 2 && d.attempts.length === 1 && d.hasMore === true)
  ok('attempt_list by user and percent', await call(tAdmin, 'attempt_list', { userId: STUDENT, maxPercent: 10 }), (d) => d.total === 1 && d.attempts[0].percent === 0)
  ok('attempt_list by title (LIKE wildcards are literal)', await call(tAdmin, 'attempt_list', { title: 'E2E quiz%' }), (d) => d.total === 0)
  ok('attempt_list by title', await call(tAdmin, 'attempt_list', { title: 'e2e QUIZ' }), (d) => d.total === 2)
  denied('attempt_list bad date', await call(tAdmin, 'attempt_list', { from: 'yesterday' }))
  denied('attempt_list as teacher', await call(tTeacher, 'attempt_list', {}), 'admina')
  denied('attempt_list as plain', await call(tPlain, 'attempt_list', {}), 'admina')
  const attemptId: string = listed.data.attempts[0].id
  ok('attempt_get', await call(tAdmin, 'attempt_get', { attemptId }), (d) => d.quiz?.id === quizId && d.user.email === 'ala.uczennica@szkola.pl' && d.questions.length === 4 && d.questions.some((q: any) => q.type === 'text' && q.prompt === 'P1'))
  denied('attempt_get unknown', await call(tAdmin, 'attempt_get', { attemptId: '00000000-0000-4000-8000-000000000000' }), 'Nie znaleziono')
  denied('attempt_get as teacher', await call(tTeacher, 'attempt_get', { attemptId }), 'admina')

  // ---- item statistics: per question, from the attempts (snapshot first, current questions for old rows) ----
  const stats = await call(tAdmin, 'quiz_stats', { quizId })
  ok('quiz_stats', stats, (d) => d.attempts === 2 && d.unattributedAttempts === 0 && d.questions.length === 4 && d.total === 4 && d.hasMore === false && d.questions.every((r: any) => r.attempts === 2 && r.inCurrentQuiz === true && r.flag === 'insufficient-data'))
  ok('quiz_stats (limit and hasMore)', await call(tAdmin, 'quiz_stats', { quizId, limit: 1 }), (d) => d.questions.length === 1 && d.total === 4 && d.hasMore === true)
  ok('quiz_stats (quiz order first: text is the last question)', stats, (d) => d.questions[0].type === 'single' && d.questions[0].points === 2 && d.questions[0].accuracy === 0.5 && d.questions[0].topAnswers.some((t: any) => t.text === '4'))
  await save({ [textQ.id]: { text: 'a1' } }, 1) // this attempt was graded on a snapshot
  const { gradeQuiz: grade } = await import('../src/shared/quiz/engine')
  const { buildQuestionsSnapshot } = await import('../src/shared/quiz/questionsSnapshot')
  await repo.saveAttempt({ quizId, quizTitle: gradable.title, userId: STUDENT, courseId: null, passed: null, answers: {}, result: grade(repo.toGradable(gradable), {}), questionsSnapshot: buildQuestionsSnapshot(gradable.questions) })
  ok('quiz_stats counts snapshot attempts too', await call(tAdmin, 'quiz_stats', { quizId }), (d) => d.attempts === 4 && d.unattributedAttempts === 0 && d.questions.every((r: any) => r.attempts === 4))
  denied('quiz_stats unknown quiz', await call(tAdmin, 'quiz_stats', { quizId: '00000000-0000-4000-8000-000000000000' }), 'Nie znaleziono quizu')
  denied('quiz_stats as teacher', await call(tTeacher, 'quiz_stats', { quizId }), 'admina')
  denied('quiz_stats as plain', await call(tPlain, 'quiz_stats', { quizId }), 'admina')

  // ---- a user's whole history (no class needed) -----------------------------------------------
  ok('user_results', await call(tAdmin, 'user_results', { userId: STUDENT }), (d) => d.name === 'Ala Uczennica' && d.email === 'ala.uczennica@szkola.pl' && d.total >= 2 && d.hasMore === false && d.attempts.length === d.total && d.attempts.every((a: any) => !('questions' in a)) && d.classes.some((c: any) => c.id === classId))
  ok('user_results (limit)', await call(tAdmin, 'user_results', { userId: STUDENT, limit: 1 }), (d) => d.attempts.length === 1 && d.hasMore === true && d.total >= 2)
  ok('user_results (includeAnswers)', await call(tAdmin, 'user_results', { userId: STUDENT, limit: 2, includeAnswers: true }), (d) => d.attempts.length === 2 && d.attempts.every((a: any) => a.questions.length === 4 && a.questions.some((q: any) => q.type === 'text' && q.prompt === 'P1')))
  denied('user_results unknown user', await call(tAdmin, 'user_results', { userId: `discord|${P}-nobody` }), 'Nie znaleziono użytkownika')
  denied('user_results as teacher', await call(tTeacher, 'user_results', { userId: STUDENT }), 'admina')
  denied('user_results as plain', await call(tPlain, 'user_results', { userId: STUDENT }), 'admina')
  ok('user_analysis', await call(tAdmin, 'user_analysis', { userId: STUDENT }), (d) => d.user.email === 'ala.uczennica@szkola.pl' && d.analysis.attempts.count >= 2 && d.analysis.hardestQuestions.length > 0 && typeof d.weakVerbCount === 'number' && Array.isArray(d.weakVerbs))
  denied('user_analysis unknown user', await call(tAdmin, 'user_analysis', { userId: `discord|${P}-nobody` }), 'Nie znaleziono użytkownika')
  denied('user_analysis as teacher', await call(tTeacher, 'user_analysis', { userId: STUDENT }), 'admina')
  denied('user_analysis as plain', await call(tPlain, 'user_analysis', { userId: STUDENT }), 'admina')

  // ---- user administration: only reads and refusals here (Auth0 writes are never reached) -----
  ok('user_search (app directory, unmasked e-mail)', await call(tAdmin, 'user_search', { q: 'uczennica' }), (d) => d.length === 1 && d[0].userId === STUDENT && d[0].email === 'ala.uczennica@szkola.pl')
  ok('user_search (limit)', await call(tAdmin, 'user_search', { q: 'szkola.pl', limit: 2 }), (d) => d.length === 2)
  denied('user_search too short', await call(tAdmin, 'user_search', { q: 'a' }))
  denied('user_search as teacher', await call(tTeacher, 'user_search', { q: 'uczennica' }), 'admina')
  denied('user_list as teacher', await call(tTeacher, 'user_list', {}), 'admina')
  denied('user_list as plain', await call(tPlain, 'user_list', {}), 'admina')
  denied('user_get as teacher', await call(tTeacher, 'user_get', { userId: STUDENT }), 'admina')
  denied('user_get unknown account', await call(tAdmin, 'user_get', { userId: `discord|${P}-nobody` }))
  denied('user_roles_set as teacher', await call(tTeacher, 'user_roles_set', { userId: STUDENT, roles: ['student'], confirm: true }), 'admina')
  denied('user_roles_set without confirm', await call(tAdmin, 'user_roles_set', { userId: STUDENT, roles: [], confirm: false }))
  denied('user_roles_set cannot demote yourself (before Auth0)', await call(tAdmin, 'user_roles_set', { userId: ADMIN, roles: ['student'], confirm: true }), 'odebrać sobie')
  denied('user_roles_set unknown account', await call(tAdmin, 'user_roles_set', { userId: `discord|${P}-nobody`, roles: ['student'], confirm: true }))
  denied('user_block as plain', await call(tPlain, 'user_block', { userId: STUDENT, blocked: true, confirm: true }), 'admina')
  denied('user_block without confirm', await call(tAdmin, 'user_block', { userId: STUDENT, blocked: true, confirm: false }))
  denied('user_block cannot block yourself (before Auth0)', await call(tAdmin, 'user_block', { userId: ADMIN, blocked: true, confirm: true }), 'zablokować własnego')
  denied('user_block unknown account', await call(tAdmin, 'user_block', { userId: `discord|${P}-nobody`, blocked: true, confirm: true }))

  // ---- class transfer: refusals only (no successful transfer in the test) -----------------------
  denied('class_transfer as teacher', await call(tTeacher, 'class_transfer', { classId, newOwnerId: OTHER, confirm: true }), 'admina')
  denied('class_transfer without confirm', await call(tAdmin, 'class_transfer', { classId, newOwnerId: OTHER, confirm: false }))
  denied('class_transfer unknown class', await call(tAdmin, 'class_transfer', { classId: '00000000-0000-4000-8000-000000000000', newOwnerId: OTHER, confirm: true }), 'Nie znaleziono klasy')
  denied('class_transfer to the current owner', await call(tAdmin, 'class_transfer', { classId, newOwnerId: TEACHER, confirm: true }), 'już jest właścicielem')
  denied('class_transfer to an unknown account', await call(tAdmin, 'class_transfer', { classId, newOwnerId: `teacher|${P}-nobody`, confirm: true }))

  // ---- removals and archiving --------------------------------------------------------------
  denied('student_remove without confirm', await call(tTeacher, 'student_remove', { classId, userId: STUDENT2, confirm: false }))
  denied('student_remove by other teacher', await call(tOther, 'student_remove', { classId, userId: STUDENT2, confirm: true }), 'Nie znaleziono klasy')
  ok('student_remove', await call(tTeacher, 'student_remove', { classId, userId: STUDENT2, confirm: true }), (d) => d.ok === true)
  denied('student_remove twice', await call(tTeacher, 'student_remove', { classId, userId: STUDENT2, confirm: true }), 'Nie znaleziono ucznia')
  ok('assignment_delete', await call(tTeacher, 'assignment_delete', { classId, assignmentId, confirm: true }), (d) => d.ok === true)
  denied('assignment_delete twice', await call(tTeacher, 'assignment_delete', { classId, assignmentId, confirm: true }), 'Nie znaleziono zadania')
  denied('class_archive without confirm', await call(tTeacher, 'class_archive', { classId, confirm: false }))
  denied('class_archive by other teacher', await call(tOther, 'class_archive', { classId, confirm: true }), 'Nie znaleziono klasy')
  ok('class_archive', await call(tTeacher, 'class_archive', { classId, confirm: true }), (d) => d.ok === true)
  denied('class_transfer archived class', await call(tAdmin, 'class_transfer', { classId, newOwnerId: OTHER, confirm: true }), 'Zarchiwizowanej')
  ok('class_list after archive', await call(tTeacher, 'class_list', {}), (d) => d.length === 0)
  ok('archived class is gone from the admin overview', await call(tAdmin, 'class_list', { scope: 'all' }), (d) => d.every((c: any) => c.id !== classId))

  // ---- images uploaded through MCP (Media-Storage-Plan M5): upload, reuse, refusals, references, cleanup --
  // The bytes are checked in the other process too: MEDIA_MEMORY_DIR (set by scripts/mcp-local-e2e.sh) makes the
  // memory driver write files, so getStorage() here sees exactly what the server stored or removed.
  if (!process.env.MEDIA_MEMORY_DIR) throw new Error('MEDIA_MEMORY_DIR must be set (scripts/mcp-local-e2e.sh sets it)')
  const storage = getStorage()
  const writer2 = await open(await token(`${ADMIN}-w2`, ['write:quizzes']))
  const quotaClient = await open(await token(`${ADMIN}-quota`, ['write:quizzes']))
  const adminBoth = await open(await token(`${ADMIN}-both`, ['manage:users', 'write:quizzes']))
  const pngBytes = (width: number, height: number, padding = 0) => {
    const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
    const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), ...Array.from('IHDR', (c) => c.charCodeAt(0)), ...u32(width), ...u32(height), 8, 2, 0, 0, 0]
    return Buffer.from([...head, ...new Array<number>(padding).fill(0)])
  }
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  const keyOf = async (id: string) => (await media.get(id))?.key ?? null
  const small = pngBytes(3, 2)
  const smallB64 = small.toString('base64')

  const up = await call(tAdminWrite, 'media_upload', { dataBase64: smallB64, alt: 'Mały kwadrat' })
  ok('media_upload (PNG: size and markdown from the bytes)', up, (d) => d.width === 3 && d.height === 2 && d.size === small.length && d.reused === false && d.markdown === `![Mały kwadrat](media:${d.mediaId})` && d.url.endsWith(`/${d.mediaId}.png`))
  const mediaId: string = up.data.mediaId
  check('media_upload wrote the object', (await storage.head((await keyOf(mediaId)) ?? '')) !== null)
  ok('media_upload the same bytes again -> reused', await call(tAdminWrite, 'media_upload', { dataBase64: smallB64, alt: 'Inny opis' }), (d) => d.reused === true && d.mediaId === mediaId && d.markdown === `![Inny opis](media:${mediaId})`)
  ok('media_upload of the same bytes by another author is not reused', await call(writer2, 'media_upload', { dataBase64: smallB64, alt: 'Cudzy' }), (d) => d.reused === false && d.mediaId !== mediaId)
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')
  denied('media_upload SVG refused', await call(tAdminWrite, 'media_upload', { dataBase64: svg, alt: 'Wektor' }), 'PNG, JPEG i WebP')
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20)]).toString('base64')
  denied('media_upload GIF refused', await call(tAdminWrite, 'media_upload', { dataBase64: gif, alt: 'Animacja' }), 'PNG, JPEG i WebP')
  denied('media_upload oversize (over MEDIA_MAX_BYTES) refused', await call(tAdminWrite, 'media_upload', { dataBase64: Buffer.concat([pngBytes(1, 1), Buffer.alloc(2_097_152)]).toString('base64'), alt: 'Duży' }), 'za duży')
  denied('media_upload over the base64 limit refused by the schema', await call(tAdminWrite, 'media_upload', { dataBase64: 'A'.repeat(2_800_001), alt: 'Za długi' }))
  denied('media_upload bad base64 refused', await call(tAdminWrite, 'media_upload', { dataBase64: 'not base64!', alt: 'Zły' }), 'base64')
  denied('media_upload alt with a bracket refused', await call(tAdminWrite, 'media_upload', { dataBase64: smallB64, alt: 'a]b' }), 'znaku "]"')
  denied('media_upload without write', await call(tPlain, 'media_upload', { dataBase64: smallB64, alt: 'x' }), 'write:quizzes')
  denied('media_create_upload without write', await call(tPlain, 'media_create_upload', { contentType: 'image/png', size: small.length, sha256: sha(small), alt: 'x' }), 'write:quizzes')
  denied('media_complete without write', await call(tPlain, 'media_complete', { mediaId }), 'write:quizzes')
  denied('media_get without write', await call(tPlain, 'media_get', { mediaId }), 'write:quizzes')
  denied('media_delete without write', await call(tPlain, 'media_delete', { mediaId, confirm: true }), 'write:quizzes')

  const mediaQuiz = await call(tAdminWrite, 'quiz_create', {
    quiz: { title: 'MCP E2E media upload', difficulty: 'easy', questions: [{ type: 'single', prompt: `Co to? ${up.data.markdown}`, explanation: '', points: 1, options: [{ text: 'Kwadrat', isCorrect: true }, { text: 'Koło', isCorrect: false }] }] },
  })
  ok('quiz_create with the markdown from media_upload', mediaQuiz, (d) => d.questions[0].prompt === `Co to? ${up.data.markdown}`)
  const mediaQuizId: string = mediaQuiz.data.id
  ok('media_get shows the referencing quiz', await call(tAdminWrite, 'media_get', { mediaId }), (d) =>
    d.referencedBy.length === 1 && d.referencedBy[0].kind === 'quiz' && d.referencedBy[0].title === 'MCP E2E media upload' && d.status === 'ready' && d.width === 3 && d.sha256 === sha(small))
  ok('media_get by an admin of another author', await call(adminBoth, 'media_get', { mediaId }), (d) => d.mediaId === mediaId)
  denied('media_get by another author is refused like a missing file', await call(writer2, 'media_get', { mediaId }), 'Nie znaleziono pliku')
  denied('media_delete while referenced names the quiz', await call(tAdminWrite, 'media_delete', { mediaId, confirm: true }), 'MCP E2E media upload')
  denied('media_delete without confirm', await call(tAdminWrite, 'media_delete', { mediaId, confirm: false }))
  check('refused delete kept the row and the object', (await media.get(mediaId)) !== null && (await storage.head((await keyOf(mediaId)) ?? '')) !== null)
  ok('quiz_delete (the referencing quiz)', await call(tAdminWrite, 'quiz_delete', { id: mediaQuizId, confirm: true }), (d) => d.ok === true)
  const removedKey = await keyOf(mediaId)
  ok('media_delete after the quiz is gone', await call(tAdminWrite, 'media_delete', { mediaId, confirm: true }), (d) => d.ok === true)
  check('media_delete removed the object from the storage', removedKey !== null && (await storage.head(removedKey)) === null)
  check('media_delete removed the row', (await media.get(mediaId)) === null)

  denied('media_upload_from_url is off without MEDIA_URL_FETCH=true', await call(tAdminWrite, 'media_upload_from_url', { url: 'https://images.example.org/a.png', alt: 'Z sieci' }), 'MEDIA_URL_FETCH')
  denied('media_upload_from_url without write', await call(tPlain, 'media_upload_from_url', { url: 'https://images.example.org/a.png', alt: 'Z sieci' }), 'write:quizzes')

  const declared = pngBytes(5, 4)
  const started = await call(tAdminWrite, 'media_create_upload', { contentType: 'image/png', size: declared.length, sha256: sha(declared), alt: 'Pięć na cztery' })
  ok('media_create_upload returns a presigned PUT and the markdown', started, (d) => typeof d.uploadUrl === 'string' && d.uploadUrl.startsWith('memory://put/') && d.expiresInSeconds === 900 && d.markdown.startsWith('![Pięć na cztery](media:') && d.reused === false && Object.keys(d.headers).length > 0)
  const startedId: string = started.data.mediaId
  denied('media_complete before the bytes are uploaded', await call(tAdminWrite, 'media_complete', { mediaId: startedId }), 'nie został jeszcze wysłany')
  await storage.put((await keyOf(startedId)) as string, declared, { contentType: 'image/png' }) // what the browser PUT does
  ok('media_complete (the bytes match) -> ready', await call(tAdminWrite, 'media_complete', { mediaId: startedId }), (d) => d.status === 'ready' && d.width === 5 && d.height === 4)
  denied('media_complete twice', await call(tAdminWrite, 'media_complete', { mediaId: startedId }), 'już gotowy')
  denied('media_complete by another author', await call(writer2, 'media_complete', { mediaId: startedId }), 'Nie znaleziono pliku')
  ok('media_create_upload of the same bytes -> reused', await call(tAdminWrite, 'media_create_upload', { contentType: 'image/png', size: declared.length, sha256: sha(declared), alt: 'Ponownie' }), (d) => d.reused === true && d.mediaId === startedId)

  const lying = pngBytes(6, 6, 10)
  const lied = await call(tAdminWrite, 'media_create_upload', { contentType: 'image/png', size: lying.length - 1, sha256: sha(lying), alt: 'Zły rozmiar' })
  const liedId: string = lied.data.mediaId
  await storage.put((await keyOf(liedId)) as string, lying, { contentType: 'image/png' })
  const liedKey = (await keyOf(liedId)) as string
  denied('media_complete with the wrong size is refused and cleaned up', await call(tAdminWrite, 'media_complete', { mediaId: liedId }), 'Rozmiar')
  check('rejected upload left no row and no object', (await media.get(liedId)) === null && (await storage.head(liedKey)) === null)

  const typedBytes = pngBytes(7, 7)
  const typed = await call(tAdminWrite, 'media_create_upload', { contentType: 'image/jpeg', size: typedBytes.length, sha256: sha(typedBytes), alt: 'Zły typ' })
  const typedId: string = typed.data.mediaId
  await storage.put((await keyOf(typedId)) as string, typedBytes, { contentType: 'image/jpeg' })
  denied('media_complete with a different type is refused', await call(tAdminWrite, 'media_complete', { mediaId: typedId }), 'image/png')
  check('type mismatch left no row', (await media.get(typedId)) === null)

  ok('media_list (own, paged)', await call(tAdminWrite, 'media_list', { limit: 1 }), (d) => d.items.length === 1 && d.total >= 1 && typeof d.hasMore === 'boolean')
  ok('media_list (unreferenced, own only)', await call(tAdminWrite, 'media_list', { unreferenced: true, limit: 200 }), (d) => d.items.every((i: any) => i.ownerId === `${ADMIN}-w` && i.mediaId !== mediaId) && d.items.some((i: any) => i.mediaId === startedId))
  denied('media_list with ownerId as author', await call(tAdminWrite, 'media_list', { ownerId: `${ADMIN}-w` }), 'tylko admin')
  ok('media_list (admin with ownerId)', await call(adminBoth, 'media_list', { ownerId: `${ADMIN}-w`, limit: 200 }), (d) => d.items.length > 0 && d.items.every((i: any) => i.ownerId === `${ADMIN}-w`))
  denied('media_list without write', await call(tPlain, 'media_list', {}), 'write:quizzes')

  // daily limit: 100 files of this author today (pre-inserted rows, not uploads)
  for (let i = 0; i < 100; i++) {
    await media.createPending({ id: randomUUID(), key: `media/2026/${randomUUID()}.png`, contentType: 'image/png', sizeBytes: 1, sha256: createHash('sha256').update(`quota${i}`).digest('hex'), source: 'script', ownerId: `${ADMIN}-quota` })
  }
  denied('media_upload over the daily file limit', await call(quotaClient, 'media_upload', { dataBase64: smallB64, alt: 'Limit' }), 'Dzienny limit')
  denied('media_create_upload over the daily file limit', await call(quotaClient, 'media_create_upload', { contentType: 'image/png', size: 40, sha256: sha(pngBytes(9, 9)), alt: 'Limit' }), 'Dzienny limit')

  check('media audit never holds the bytes', (await pool().query("SELECT COUNT(*)::int AS n FROM admin_audit_log WHERE details::text LIKE $1", [`%${smallB64.slice(0, 24)}%`])).rows[0].n === 0)

  // ---- lesson intro with images (Media-Storage-Plan L1): a throwaway course and lesson, never seeded rows ----
  const courseRow = await pool().query<{ id: string }>(
    'INSERT INTO courses (slug, title, description) VALUES ($1, $2, $3) RETURNING id',
    [`${P}-course-${randomUUID()}`, `${P} kurs`, 'test'],
  )
  const courseId = courseRow.rows[0].id
  const lessonRow = await pool().query<{ id: string }>(
    "INSERT INTO lessons (course_id, position, title, intro) VALUES ($1, 1, $2, '') RETURNING id",
    [courseId, `${P} lekcja`],
  )
  const lessonId = lessonRow.rows[0].id
  const [firstVerb] = (await listVerbs()).slice(0, 1)
  await pool().query('INSERT INTO lesson_verbs (lesson_id, verb_id, position) VALUES ($1, $2, 1)', [lessonId, firstVerb.id])
  const lessonImgId = randomUUID()
  await mediaRow(lessonImgId, 'ready')
  const lessonPath = `/courses/${courseId}/lessons/${lessonId}`
  const lessonRefs = async () =>
    (await pool().query<{ id: string }>(`SELECT media_id::text AS id FROM media_refs WHERE owner_kind = 'lesson' AND owner_id = $1`, [lessonId])).rows.map((r) => r.id)
  const lessonIntro = `Dziś o czasownikach. ${img('Tabela form', lessonImgId)} Zapamiętaj trzy formy.`

  denied('lesson_get without write', await call(tPlain, 'lesson_get', { courseId, lessonId }), 'write:quizzes')
  denied('lesson_update without write', await call(tPlain, 'lesson_update', { courseId, lessonId, title: 'x' }), 'write:quizzes')
  ok('lesson_update intro with a ready image', await call(tAdminWrite, 'lesson_update', { courseId, lessonId, intro: lessonIntro }), (d) =>
    d.intro === lessonIntro && d.referencedMedia.length === 1 && d.referencedMedia[0] === lessonImgId && d.title === `${P} lekcja`)
  ok('lesson_get shows the intro, the verb and the referenced image', await call(tAdminWrite, 'lesson_get', { courseId, lessonId }), (d) =>
    d.intro === lessonIntro && d.referencedMedia.includes(lessonImgId) && d.verbs.length === 1 && d.verbs[0].id === firstVerb.id && typeof d.verbs[0].base === 'string')
  check('media_refs: the lesson holds the image reference', JSON.stringify(await lessonRefs()) === JSON.stringify([lessonImgId]), await lessonRefs())
  const restLesson = await rest(lessonPath, { method: 'GET', bearer: plainBearer })
  check('GET lesson -> 200 with the media map (url, width, height)', restLesson.status === 200 && mediaOf(restLesson.body)?.[lessonImgId]?.url === `https://media.test/media/2026/${lessonImgId}.png` && mediaOf(restLesson.body)?.[lessonImgId]?.width === 800 && mediaOf(restLesson.body)?.[lessonImgId]?.height === 450, restLesson.body)
  check('GET lesson keeps the intro as stored', restLesson.body?.intro === lessonIntro, restLesson.body?.intro)
  ok('course_list lists the lesson ids', await call(tAdmin, 'course_list', {}), (d) => Array.isArray(d) && d.some((c: any) => c.id === courseId && c.lessonList.some((l: any) => l.id === lessonId)))

  denied('lesson_update with an unknown media id', await call(tAdminWrite, 'lesson_update', { courseId, lessonId, intro: `x ${img('y', randomUUID())}` }), 'nieistniejące')
  denied('lesson_update with a pending media id', await call(tAdminWrite, 'lesson_update', { courseId, lessonId, intro: `x ${img('y', pendingId)}` }), 'jeszcze niewysłane')
  denied('lesson_update with an external https image', await call(tAdminWrite, 'lesson_update', { courseId, lessonId, intro: 'x ![y](https://example.com/a.png)' }), 'zewnętrznego adresu')
  denied('lesson_update with no fields', await call(tAdminWrite, 'lesson_update', { courseId, lessonId }), 'Podaj')
  denied('lesson_update intro over 2000 characters', await call(tAdminWrite, 'lesson_update', { courseId, lessonId, intro: 'a'.repeat(2001) }), 'najwyżej 2000')
  check('refused updates left the intro and the references alone', JSON.stringify(await lessonRefs()) === JSON.stringify([lessonImgId]))

  ok('lesson_update intro without images clears the references', await call(tAdminWrite, 'lesson_update', { courseId, lessonId, intro: 'Krótki wstęp bez obrazów.' }), (d) => d.referencedMedia.length === 0)
  check('media_refs: the lesson row is gone after the update without the image', (await lessonRefs()).length === 0, await lessonRefs())
  const restPlain = await rest(lessonPath, { method: 'GET', bearer: plainBearer })
  check('GET lesson without images has no media key (JSON unchanged)', restPlain.status === 200 && !('media' in restPlain.body) && restPlain.body?.intro === 'Krótki wstęp bez obrazów.', Object.keys(restPlain.body ?? {}))
  ok('lesson_update title only', await call(tAdminWrite, 'lesson_update', { courseId, lessonId, title: `${P} lekcja 2` }), (d) => d.title === `${P} lekcja 2` && d.intro === 'Krótki wstęp bez obrazów.')
  denied('lesson_update title over 120 characters', await call(tAdminWrite, 'lesson_update', { courseId, lessonId, title: 'x'.repeat(121) }))
  denied('lesson_update of a lesson outside the course', await call(tAdminWrite, 'lesson_update', { courseId: randomUUID(), lessonId, title: 'x' }), 'Nie znaleziono lekcji')

  // ---- audit trail: every successful change is logged, reads and refusals are not ---------
  const audit = await pool().query<{ tool: string }>(
    "SELECT details->>'tool' AS tool FROM admin_audit_log WHERE action = 'mcp.call' AND actor_id LIKE $1 ORDER BY created_at",
    [`%${P}%`],
  )
  const logged = audit.rows.map((r) => r.tool)
  const expected = [
    'quiz_create', 'quiz_update', 'quiz_create', 'quiz_delete', 'quiz_create', 'quiz_update', 'quiz_update', 'quiz_delete', 'class_create', 'class_update', 'class_regenerate_code',
    'student_add', 'student_add', 'assignment_create', 'assignment_create', 'assignment_update_due', 'assignment_update_due',
    'student_remove', 'assignment_delete', 'class_archive',
    // media section: uploads and changes only (reuse, refusals and reads are not changes); a rejected completion
    // removes the row, so it is a change too
    'media_upload', 'media_upload', 'quiz_create', 'quiz_delete', 'media_delete', 'media_create_upload', 'media_complete',
    'media_create_upload', 'media_complete', 'media_create_upload', 'media_complete',
    // lesson section: successful updates only (intro with image, intro without images, title)
    'lesson_update', 'lesson_update', 'lesson_update',
  ]
  check('audit log has exactly the successful changes', JSON.stringify(logged) === JSON.stringify(expected), { logged })

  // ---- browser upload routes (Media-Storage-Plan M6, server side): REST, memory driver ---------
  // The owner's browser flow: POST /media/uploads -> PUT the bytes to upload.url -> POST /media/:id/complete,
  // then the id goes into quiz_create. Same storage as the MCP tools; the audit rows are media.upload.
  const restOrigin = new URL(base).origin // base may end in /api (MCP_E2E_URL): the upload URL carries its own /api
  const restBearer = {
    writer: await token(`${ADMIN}-rest-w`, ['write:quizzes']),
    writer2: await token(`${ADMIN}-rest-w2`, ['write:quizzes']),
    admin: await token(`${ADMIN}-rest-admin`, ['manage:users', 'write:quizzes']),
    plain: await token(PLAIN, []),
  }
  const send = (method: string, path: string, bearer: string | null, body?: BodyInit, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...headers }, body })
  const withJson = async (response: Response) => ({ status: response.status, body: (await response.json().catch(() => null)) as any })
  const startUpload = (bearer: string, input: object) => send('POST', '/media/uploads', bearer, JSON.stringify(input), { 'content-type': 'application/json' }).then(withJson)
  const putBytes = (url: string, bearer: string | null, bytes: Buffer, type = 'image/png') =>
    fetch(`${restOrigin}${url}`, { method: 'PUT', headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'content-type': type }, body: bytes }).then(withJson)
  const completeUpload = (bearer: string, id: string) => send('POST', `/media/${id}/complete`, bearer).then(withJson)
  const uploadTarget = (d: any) => d?.upload as { url: string; method: string; headers: Record<string, string> } | undefined
  const maxBytes = Number(process.env.MEDIA_MAX_BYTES || 2_097_152)

  // refusals of the start route
  check('REST upload start without a token -> 401', (await send('POST', '/media/uploads', null, '{}', { 'content-type': 'application/json' })).status === 401)
  check('REST upload start without write:quizzes -> 403', (await startUpload(restBearer.plain, { contentType: 'image/png', size: 40, sha256: sha(small) })).status === 403)
  check('REST upload start with GIF -> 400', (await startUpload(restBearer.writer, { contentType: 'image/gif', size: 40, sha256: sha(small) })).status === 400)
  check('REST upload start with size 0 -> 400', (await startUpload(restBearer.writer, { contentType: 'image/png', size: 0, sha256: sha(small) })).status === 400)
  check('REST upload start over MEDIA_MAX_BYTES -> 400', (await startUpload(restBearer.writer, { contentType: 'image/png', size: maxBytes + 1, sha256: sha(small) })).status === 400)
  check('REST upload start with a bad sha256 -> 400', (await startUpload(restBearer.writer, { contentType: 'image/png', size: 40, sha256: 'XYZ' })).status === 400)
  check('REST upload start with a bracket in alt -> 400', (await startUpload(restBearer.writer, { contentType: 'image/png', size: 40, sha256: sha(small), alt: 'a]b' })).status === 400)

  // the happy path: start -> PUT -> complete -> a quiz that uses the id
  const restImg = pngBytes(4, 3)
  const restStarted = await startUpload(restBearer.writer, { contentType: 'image/png', size: restImg.length, sha256: sha(restImg), alt: 'Cztery na trzy' })
  const restTarget = uploadTarget(restStarted.body)
  check('REST upload start: pending, same-origin PUT target with headers', restStarted.status === 200 && restStarted.body?.status === 'pending' && restStarted.body?.reused === false && restTarget?.url === `/api/media/${restStarted.body?.mediaId}/content` && restTarget?.method === 'PUT' && Object.keys(restTarget?.headers ?? {}).length > 0, restStarted.body)
  const restId: string = restStarted.body.mediaId
  const restKey = async (id: string) => (await media.get(id))?.key ?? ''
  check('REST upload start wrote nothing yet', (await storage.head(await restKey(restId))) === null)
  const restPut = await putBytes(restTarget!.url, restBearer.writer, restImg)
  check('REST PUT content -> ok and the bytes are stored', restPut.status === 200 && restPut.body?.ok === true && (await storage.head(await restKey(restId)))?.size === restImg.length, restPut)
  const restDone = await completeUpload(restBearer.writer, restId)
  check('REST complete -> ready with size and pixel dimensions', restDone.status === 200 && restDone.body?.mediaId === restId && restDone.body?.width === 4 && restDone.body?.height === 3 && restDone.body?.size === restImg.length && String(restDone.body?.url).endsWith(`/${restId}.png`), restDone.body)
  check('REST complete answer has no markdown (alt is not stored)', restDone.body !== null && !('markdown' in restDone.body))
  const restQuiz = await call(tAdminWrite, 'quiz_create', { quiz: { title: 'MCP E2E rest upload', difficulty: 'easy', questions: [{ type: 'single', prompt: `Co to? ![Cztery na trzy](media:${restId})`, explanation: '', points: 1, options: [{ text: 'Prostokąt', isCorrect: true }, { text: 'Koło', isCorrect: false }] }] } })
  ok('quiz_create with the id from the browser upload', restQuiz, (d) => d.questions[0].prompt.includes(`media:${restId}`))
  const shown = await rest(`/quizzes/${restQuiz.data.id}`, { method: 'GET', bearer: restBearer.plain })
  check('the uploaded image is in the quiz media map', mediaOf(shown.body)?.[restId]?.width === 4 && String(mediaOf(shown.body)?.[restId]?.url).endsWith(`/${restId}.png`), shown.body?.media)

  // the same bytes again: the author's ready copy is reused, nothing to upload
  const again = await startUpload(restBearer.writer, { contentType: 'image/png', size: restImg.length, sha256: sha(restImg), alt: 'Ponownie' })
  check('REST upload start of the same bytes -> reused, ready, no PUT target', again.status === 200 && again.body?.reused === true && again.body?.mediaId === restId && again.body?.status === 'ready' && again.body?.upload === undefined && String(again.body?.url).endsWith(`/${restId}.png`), again.body)

  // refusals of the PUT (the row stays pending)
  const lenDeclared = pngBytes(7, 5) // fresh bytes: the picture above is ready, so its hash would be reused
  const lenRow = await startUpload(restBearer.writer, { contentType: 'image/png', size: lenDeclared.length, sha256: sha(lenDeclared) })
  check('REST upload start for fresh bytes asks for a PUT', uploadTarget(lenRow.body) !== undefined, lenRow.body)
  const lenUrl = uploadTarget(lenRow.body)!.url
  check('REST PUT with the wrong length -> 400', (await putBytes(lenUrl, restBearer.writer, pngBytes(4, 3, 5))).status === 400)
  check('REST PUT with a non-image content type -> 400', (await putBytes(lenUrl, restBearer.writer, restImg, 'text/plain')).status === 400)
  check('REST PUT over MEDIA_MAX_BYTES -> 400', (await putBytes(lenUrl, restBearer.writer, Buffer.alloc(maxBytes + 1, 1))).status === 400)
  check('REST PUT without a token -> 401', (await putBytes(lenUrl, null, restImg)).status === 401)
  check('REST PUT by another author -> 404', (await putBytes(lenUrl, restBearer.writer2, restImg)).status === 404)
  check('REST PUT by a plain viewer -> 403', (await putBytes(lenUrl, restBearer.plain, restImg)).status === 403)
  check('REST complete by a plain viewer -> 403', (await completeUpload(restBearer.plain, lenRow.body.mediaId)).status === 403)
  check('REST complete by another author -> 404', (await completeUpload(restBearer.writer2, lenRow.body.mediaId)).status === 404)

  // a mismatch: the declared hash is of one picture, the bytes are another one of the same length
  const declaredA = pngBytes(8, 8)
  const bytesB = pngBytes(8, 9)
  const mismatch = await startUpload(restBearer.writer, { contentType: 'image/png', size: declaredA.length, sha256: sha(declaredA), alt: 'Zły' })
  const mismatchId: string = mismatch.body.mediaId
  const mismatchKey = await restKey(mismatchId)
  check('REST PUT of other bytes of the same size is stored', (await putBytes(uploadTarget(mismatch.body)!.url, restBearer.writer, bytesB)).status === 200)
  const refused = await completeUpload(restBearer.writer, mismatchId)
  check('REST complete with mismatching bytes -> 400 with the hash reason', refused.status === 400 && String(refused.body?.error).includes('Skrót'), refused.body)
  check('REST refused completion removed the row and the object', (await media.get(mismatchId)) === null && (await storage.head(mismatchKey)) === null)
  check('REST complete of a file that is already ready -> 400', (await completeUpload(restBearer.writer, restId)).status === 400)
  check('REST PUT for a ready file -> 409', (await putBytes(restTarget!.url, restBearer.writer, restImg)).status === 409)

  // the admin may finish another author's upload
  const adminUp = pngBytes(2, 2)
  const adminStarted = await startUpload(restBearer.writer, { contentType: 'image/png', size: adminUp.length, sha256: sha(adminUp), alt: 'Admin' })
  check('REST PUT by an admin of another author -> ok', (await putBytes(uploadTarget(adminStarted.body)!.url, restBearer.admin, adminUp)).status === 200)
  check('REST complete by an admin of another author -> ready', (await completeUpload(restBearer.admin, adminStarted.body.mediaId)).status === 200)

  // audit: one row per completion (ready or rejected); the reuse and the refused starts write nothing
  const uploadAudit = await pool().query<{ outcome: string; source: string; sha: string; actor: string }>(
    `SELECT details->>'outcome' AS outcome, details->>'source' AS source, details->>'sha256' AS sha, actor_id AS actor
       FROM admin_audit_log WHERE action = 'media.upload' AND actor_id LIKE $1 ORDER BY created_at, id`,
    [`%${P}%`],
  )
  check('audit: media.upload rows are ready, rejected, rejected, ready in order', JSON.stringify(uploadAudit.rows.map((r) => r.outcome)) === JSON.stringify(['ready', 'rejected', 'rejected', 'ready']), uploadAudit.rows)
  check('audit: browser uploads record source browser and a 12-character hash prefix', uploadAudit.rows.every((r) => r.source === 'browser' && r.sha.length === 12), uploadAudit.rows)
  check('audit: the mismatch is attributed to its author', uploadAudit.rows.filter((r) => r.outcome === 'rejected').every((r) => r.actor === `${ADMIN}-rest-w`), uploadAudit.rows)
  check('the ready file is still ready after the refusals', (await media.get(restId))?.status === 'ready')

  // ---- operations: audit trail, feedback, settings and system counts (changes restored afterwards) -----
  denied('audit_list as teacher', await call(tTeacher, 'audit_list', {}), 'admina')
  denied('audit_list bad date', await call(tAdmin, 'audit_list', { from: 'yesterday' }))
  ok('audit_list (actor and action filter)', await call(tAdmin, 'audit_list', { actorId: `${ADMIN}-w`, action: 'mcp.call' }), (d) => d.entries.length > 0 && d.entries.every((e: any) => e.actorId === `${ADMIN}-w` && e.action === 'mcp.call'))
  ok('audit_list (paging: hasMore)', await call(tAdmin, 'audit_list', { actorId: `${ADMIN}-w`, action: 'mcp.call', limit: 1 }), (d) => d.entries.length === 1 && d.hasMore === true)
  ok('audit_list (target filter)', await call(tAdmin, 'audit_list', { targetId: STUDENT, limit: 5 }), (d) => d.entries.length >= 1 && d.entries.every((e: any) => e.targetId === STUDENT))

  const feedbackId = await adminRepo.createFeedback({ userId: `${PLAIN}-feedback`, kind: 'bug', message: `${P} feedback marker`, context: {} })
  denied('feedback_list as plain', await call(tPlain, 'feedback_list', {}), 'admina')
  ok('feedback_list (status filter, limit)', await call(tAdmin, 'feedback_list', { status: 'new', limit: 5 }), (d) => Array.isArray(d.items) && d.items.length <= 5 && d.items.every((i: any) => i.status === 'new'))
  denied('feedback_update without confirm', await call(tAdmin, 'feedback_update', { id: feedbackId, status: 'done', confirm: false }))
  denied('feedback_update as teacher', await call(tTeacher, 'feedback_update', { id: feedbackId, status: 'done', confirm: true }), 'admina')
  denied('feedback_update unknown id', await call(tAdmin, 'feedback_update', { id: '00000000-0000-4000-8000-000000000000', status: 'done', confirm: true }), 'Feedback not found')
  ok('feedback_update', await call(tAdmin, 'feedback_update', { id: feedbackId, status: 'in_progress', confirm: true }), (d) => d.id === feedbackId && d.status === 'in_progress')

  denied('settings_get as teacher', await call(tTeacher, 'settings_get', {}), 'admina')
  const originalSettings = (await call(tAdmin, 'settings_get', {})).data as { scoreThresholds: { low: number; high: number } }
  check('settings_get returns thresholds', typeof originalSettings?.scoreThresholds?.low === 'number')
  denied('settings_set low >= high', await call(tAdmin, 'settings_set', { scoreThresholds: { low: 90, high: 40 }, confirm: true }), 'niższy')
  denied('settings_set without confirm', await call(tAdmin, 'settings_set', { scoreThresholds: { low: 40, high: 90 }, confirm: false }))
  try {
    ok('settings_set', await call(tAdmin, 'settings_set', { scoreThresholds: { low: 40, high: 90 }, confirm: true }), (d) => d.scoreThresholds.low === 40 && d.scoreThresholds.high === 90)
    ok('settings_get reflects the change', await call(tAdmin, 'settings_get', {}), (d) => d.scoreThresholds.low === 40 && d.scoreThresholds.high === 90)
  } finally {
    await appSettings.saveAppSettings(originalSettings as any, ADMIN)
    const restored = await appSettings.getAppSettings()
    check('settings restored', restored.scoreThresholds.low === originalSettings.scoreThresholds.low && restored.scoreThresholds.high === originalSettings.scoreThresholds.high, restored)
  }

  denied('system_stats as teacher', await call(tTeacher, 'system_stats', {}), 'admina')
  ok('system_stats', await call(tAdmin, 'system_stats', {}), (d) =>
    typeof d.users === 'number' && typeof d.classes === 'number' && typeof d.attempts === 'number' && typeof d.activeTokens === 'number' &&
    typeof d.weakVerbRows === 'number' && d.db.migrationsApplied > 0 && typeof d.db.latestMigration === 'string' && typeof d.db.schemaCurrent === 'boolean' &&
    (d.appVersion === null || typeof d.appVersion === 'string'))

  const ops = await pool().query<{ tool: string }>(
    "SELECT details->>'tool' AS tool FROM admin_audit_log WHERE action = 'mcp.call' AND actor_id = $1 AND details->>'tool' IN ('feedback_update', 'settings_set') ORDER BY created_at",
    [ADMIN],
  )
  check('audit: feedback_update and settings_set are logged as mcp.call', JSON.stringify(ops.rows.map((r) => r.tool)) === JSON.stringify(['feedback_update', 'settings_set']), ops.rows)

  // ==== media cleanup (Media-Storage-Plan S1, request path) — own section, keep it together on merges =========
  // A stale pending row (older than an hour) of the same author disappears, with its object, when that author starts
  // a new upload; a fresh pending row and another author's stale row stay. Uploads go through the browser route.
  const uploadOf = (bytes: Buffer) => ({ contentType: 'image/png', size: bytes.length, sha256: sha(bytes) })
  const backdate = (id: string) => pool().query(`UPDATE media SET created_at = now() - interval '2 hours' WHERE id = $1::uuid`, [id])
  const cleanA = await token(`${ADMIN}-clean-a`, ['write:quizzes'])
  const cleanB = await token(`${ADMIN}-clean-b`, ['write:quizzes'])
  const staleA = await startUpload(cleanA, uploadOf(pngBytes(21, 21, 1)))
  check('S1 upload start (author A, first stale candidate) is pending', staleA.status === 200 && staleA.body.status === 'pending', staleA.body)
  await storage.put((await keyOf(staleA.body.mediaId)) as string, pngBytes(21, 21, 1), { contentType: 'image/png' })
  const staleB = await startUpload(cleanB, uploadOf(pngBytes(22, 22, 1)))
  check('S1 upload start (author B) is pending', staleB.status === 200 && staleB.body.status === 'pending', staleB.body)
  await storage.put((await keyOf(staleB.body.mediaId)) as string, pngBytes(22, 22, 1), { contentType: 'image/png' })
  const staleAKey = (await keyOf(staleA.body.mediaId)) as string
  const staleBKey = (await keyOf(staleB.body.mediaId)) as string
  await backdate(staleA.body.mediaId)
  await backdate(staleB.body.mediaId)
  const freshA = await startUpload(cleanA, uploadOf(pngBytes(23, 23, 1)))
  check('S1 a new upload of author A starts', freshA.status === 200 && freshA.body.status === 'pending', freshA.body)
  check('S1 stale pending row of the same author is removed', (await media.get(staleA.body.mediaId)) === null)
  check('S1 stale pending object of the same author is removed from storage', (await storage.head(staleAKey)) === null)
  check("S1 another author's stale pending row stays", (await media.get(staleB.body.mediaId)) !== null)
  check("S1 another author's stale object stays in storage", (await storage.head(staleBKey)) !== null)
  check('S1 the fresh pending row of author A stays', (await media.get(freshA.body.mediaId)) !== null)
  await storage.put((await keyOf(freshA.body.mediaId)) as string, pngBytes(23, 23, 1), { contentType: 'image/png' })
  const nextA = await startUpload(cleanA, uploadOf(pngBytes(24, 24, 1)))
  check('S1 a second upload start keeps the fresh pending row', nextA.status === 200 && (await media.get(freshA.body.mediaId)) !== null)

  for (const c of [tTeacher, tAdminWrite, tAdmin, tOther, tPlain, writer2, quotaClient, adminBoth]) await c.close()
} catch (error) {
  failures.push(`test crashed: ${(error as Error).stack ?? error}`)
} finally {
  await cleanup().catch((e) => failures.push(`cleanup failed: ${e}`))
  app?.close()
}

console.log(`\nMCP local e2e (${external ? `via ${external}` : 'in-process app'}): ${passed} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  FAIL ${f}`)
process.exit(failures.length ? 1 : 0)
