// Full local test of the MCP server: every tool, permissions, validation and the audit trail.
// Runs the real Express app in-process against the local Netlify database; use `npm run test:mcp`
// (scripts/mcp-local-e2e.sh starts `netlify dev`, passes NETLIFY_DB_URL and removes the server afterwards).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApiToken } from '../server/apiTokens'
import { createApp } from '../server/app'
import { pool } from '../server/quizRepo'
import * as repo from '../server/quizRepo'

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

// MCP_E2E_URL=http://localhost:8888/api runs the same checks through a running `netlify dev` (the real function,
// Lambda adapter and dev proxy) instead of the in-process app; both use the same local database.
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
  await db.query("DELETE FROM quizzes WHERE title LIKE 'MCP E2E%'")
  await db.query('DELETE FROM user_profiles WHERE user_id LIKE $1', [`%${P}%`])
  await db.query('DELETE FROM api_tokens WHERE user_id LIKE $1', [`%${P}%`])
  await db.query('DELETE FROM admin_audit_log WHERE actor_id LIKE $1', [`%${P}%`])
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
  check('25 tools listed', names.length === 25, names.length)
  for (const required of ['quiz_create', 'class_create', 'student_search', 'student_add', 'class_analyze', 'assignment_create'])
    check(`tool ${required} exists`, names.includes(required))

  // ---- quizzes ---------------------------------------------------------------------------
  ok('quiz_schema', await call(tPlain, 'quiz_schema', {}), (d) => d.title === 'Quiz' && !!d.$defs?.question)
  ok('verbs_list (limit)', await call(tPlain, 'verbs_list', { limit: 5 }), (d) => Array.isArray(d) && d.length === 5)
  ok('verbs_list (filter)', await call(tPlain, 'verbs_list', { pattern: 'AAA', limit: 100 }), (d) => d.length > 0 && d.every((v: any) => v.pattern === 'AAA'))

  const quiz = {
    title: 'MCP E2E quiz',
    description: 'test',
    difficulty: 'easy',
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
  ok('quiz_create (all 4 types + settings)', created, (d) => d.questions.length === 4 && d.sampleSize === 10 && d.shuffleOptions === true && d.shuffleQuestions === true)
  const quizId: string = created.data.id
  denied('quiz_create without write', await call(tPlain, 'quiz_create', { quiz }), 'write:quizzes')
  denied('quiz_create invalid (no questions)', await call(tAdminWrite, 'quiz_create', { quiz: { title: 'MCP E2E bad', questions: [] } }))
  denied('quiz_create invalid (single with 2 correct)', await call(tAdminWrite, 'quiz_create', { quiz: { title: 'MCP E2E bad', questions: [{ type: 'single', prompt: 'p', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] }] } }))
  ok('quiz_list', await call(tPlain, 'quiz_list', {}), (d) => d.some((q: any) => q.id === quizId && q.sampleSize === 10 && q.questionCount === 4))
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
  ok('class_list after archive', await call(tTeacher, 'class_list', {}), (d) => d.length === 0)
  ok('archived class is gone from the admin overview', await call(tAdmin, 'class_list', { scope: 'all' }), (d) => d.every((c: any) => c.id !== classId))

  // ---- audit trail: every successful change is logged, reads and refusals are not ---------
  const audit = await pool().query<{ tool: string }>(
    "SELECT details->>'tool' AS tool FROM admin_audit_log WHERE action = 'mcp.call' AND actor_id LIKE $1 ORDER BY created_at",
    [`%${P}%`],
  )
  const logged = audit.rows.map((r) => r.tool)
  const expected = [
    'quiz_create', 'quiz_update', 'quiz_create', 'quiz_delete', 'class_create', 'class_update', 'class_regenerate_code',
    'student_add', 'student_add', 'assignment_create', 'assignment_create', 'assignment_update_due', 'assignment_update_due',
    'student_remove', 'assignment_delete', 'class_archive',
  ]
  check('audit log has exactly the successful changes', JSON.stringify(logged) === JSON.stringify(expected), { logged })

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
