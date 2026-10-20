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
  check('42 tools listed', names.length === 42, names.length)
  for (const required of ['quiz_create', 'class_create', 'student_search', 'student_add', 'class_analyze', 'assignment_create', 'attempt_list', 'attempt_get', 'quiz_stats', 'user_results', 'user_analysis', 'user_list', 'user_get', 'user_search', 'user_roles_set', 'user_block', 'class_transfer', 'audit_list', 'feedback_list', 'feedback_update', 'settings_get', 'settings_set', 'system_stats'])
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
  const pendingId = randomUUID()
  await mediaRow(readyId, 'ready')
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

  const imageQuiz = withImage(`Co pokazuje ${img('Mapa Polski', readyId)}?`, `Patrz ${img('Schemat', readyId)}.`, img('Kot', readyId))
  const imageCreated = await call(tAdminWrite, 'quiz_create', { quiz: imageQuiz })
  ok('quiz_create with a ready image in prompt, explanation and option', imageCreated, (d) => d.questions[0].prompt === imageQuiz.questions[0].prompt)
  const imageQuizId: string = imageCreated.data.id
  ok('quiz_get returns the image syntax unchanged', await call(tAdminWrite, 'quiz_get', { id: imageQuizId, withAnswers: true }), (d) =>
    d.questions[0].prompt === imageQuiz.questions[0].prompt && d.questions[0].explanation === imageQuiz.questions[0].explanation && d.questions[0].options[0].text === imageQuiz.questions[0].options[0].text)
  check('media_refs: one reference for the quiz', JSON.stringify(await refsOf(imageQuizId)) === JSON.stringify([readyId]), await refsOf(imageQuizId))
  denied('quiz_create with an unknown media id', await call(tAdminWrite, 'quiz_create', { quiz: withImage(`P ${img('x', randomUUID())}`, '', 'a') }), 'nieistniejące')
  denied('quiz_create with a pending media id', await call(tAdminWrite, 'quiz_create', { quiz: withImage(`P ${img('x', pendingId)}`, '', 'a') }), 'jeszcze niewysłane')
  denied('quiz_create with an external https image', await call(tAdminWrite, 'quiz_create', { quiz: withImage(`P ![x](https://example.com/a.png)`, '', 'a') }), 'media_upload')
  denied('quiz_create with an image in a text option', await call(tAdminWrite, 'quiz_create', { quiz: { title: 'MCP E2E media text', questions: [{ type: 'text', prompt: 'P', options: [{ text: img('x', readyId), isCorrect: true }] }] } }), 'odpowiedziach tekstowych')
  denied('quiz_create with an empty alt', await call(tAdminWrite, 'quiz_create', { quiz: withImage(`P ${img('', readyId)}`, '', 'a') }), 'wymaga opisu')
  check('refused quizzes left no references', (await pool().query("SELECT COUNT(*)::int AS n FROM media_refs WHERE owner_id IN (SELECT id::text FROM quizzes WHERE title LIKE 'MCP E2E media%' AND id <> $1)", [imageQuizId])).rows[0].n === 0)

  ok('quiz_update removing the image clears the reference', await call(tAdminWrite, 'quiz_update', { id: imageQuizId, quiz: withImage('Co pokazuje?', 'Patrz.', 'Kot') }), (d) => d.questions[0].prompt === 'Co pokazuje?')
  check('media_refs cleared by quiz_update', (await refsOf(imageQuizId)).length === 0, await refsOf(imageQuizId))
  ok('quiz_update adding the image back', await call(tAdminWrite, 'quiz_update', { id: imageQuizId, quiz: imageQuiz }))
  check('media_refs restored by quiz_update', JSON.stringify(await refsOf(imageQuizId)) === JSON.stringify([readyId]))
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
  const courseId = (await call(tTeacher, 'course_list', {})).data[0].id as string
  const quizAssignment = await call(tTeacher, 'assignment_create', { classId, kind: 'quiz', targetId: quizId, dueAt: '2026-01-01T00:00:00Z' })
  ok('assignment_create (quiz, overdue)', quizAssignment, (d) => d.kind === 'quiz' && d.title === 'MCP E2E quiz 2')
  ok('assignment_create (course)', await call(tTeacher, 'assignment_create', { classId, kind: 'course', targetId: courseId }), (d) => d.kind === 'course' && d.dueAt === null)
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
  ]
  check('audit log has exactly the successful changes', JSON.stringify(logged) === JSON.stringify(expected), { logged })

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

  for (const c of [tTeacher, tAdminWrite, tAdmin, tOther, tPlain]) await c.close()
} catch (error) {
  failures.push(`test crashed: ${(error as Error).stack ?? error}`)
} finally {
  await cleanup().catch((e) => failures.push(`cleanup failed: ${e}`))
  app?.close()
}

console.log(`\nMCP local e2e (${external ? `via ${external}` : 'in-process app'}): ${passed} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  FAIL ${f}`)
process.exit(failures.length ? 1 : 0)
