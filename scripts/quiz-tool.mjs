#!/usr/bin/env node
// Quiz tool: convert docs/lista.md -> JSON, build a quiz JSON from it, upload a quiz JSON through the API
// or download an existing quiz to JSON.
//
//   node scripts/quiz-tool.mjs list-to-json [docs/lista.md] [data/lista-verbs.json]
//   node scripts/quiz-tool.mjs build-choice [data/lista-verbs.json] [data/quiz-lista-choice.json]
//   node scripts/quiz-tool.mjs build-elements [data/pierwiastki.json] [data/quiz-pierwiastki.json]   # symbol <-> name, 1 of 4
//   node --env-file=.env scripts/quiz-tool.mjs upload data/quiz-lista-choice.json   # creates, or replaces the quiz with the same title
//   node --env-file=.env scripts/quiz-tool.mjs download <quiz id | title> [file.json]
//
// Quiz files follow data/quiz.schema.json (JSON Schema 2020-12).
//
// Env: PROD_API = personal API token with write access (admin), API_URL (default: the production site,
// e.g. http://localhost:8888 for `netlify dev`). Add --dry-run to `upload` to only validate the file.
import { readFile, writeFile } from 'node:fs/promises'

const BASE = (process.env.API_URL ?? 'https://fabulous-dieffenbachia.netlify.app').replace(/\/$/, '') + '/api'
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const dryRun = process.argv.includes('--dry-run')
const [command, ...rest] = args

const SCHEMA_REF = './quiz.schema.json' // data/quiz.schema.json - editors use it for hints and validation

const writeJson = (file, data) => writeFile(file, `${JSON.stringify(data, null, 2)}\n`)
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

// ---- docs/lista.md -> verbs json ---------------------------------------------------------

// typos in the source list -> correct forms
const FIXES = { 'de-al': 'deal', 'de-alt': 'dealt' }

const parseLine = (line) => {
  const m = line.trim().match(/^(.+?)\s+[—–-]\s+(.+?)\.?$/)
  if (!m) return null
  const forms = m[2].split(',').map((f) => FIXES[f.trim().toLowerCase()] ?? f.trim().toLowerCase())
  return forms.length === 3 && forms.every(Boolean) ? { pl: m[1].trim(), forms } : null
}

async function listToJson(src = 'docs/lista.md', out = 'data/lista-verbs.json') {
  const rows = (await readFile(src, 'utf8')).split('\n').filter((l) => l.trim())
  const verbs = rows.map(parseLine)
  const bad = rows.filter((_, i) => !verbs[i])
  if (bad.length) throw new Error(`Nie udało się sparsować linii:\n${bad.join('\n')}`)
  await writeJson(out, verbs)
  console.log(`${verbs.length} czasowników -> ${out}`)
}

// ---- verbs json -> quiz json (1 of 4) ----------------------------------------------------

const QUIZ_TITLE = 'Czasowniki nieregularne – wybór 1 z 4 (lista)'

const triple = (forms) => forms.join(' – ')
const regularEd = (base) => (base.endsWith('e') ? `${base}d` : /[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ied` : `${base}ed`)
const pickOf = (items) => items[Math.floor(Math.random() * items.length)]

/** One correct triple among three plausible wrong ones: the naive -ed form, swapped forms, forms of other verbs. */
const choiceQuestion = ({ pl, forms }, others) => {
  const [a, b, c] = forms
  const correct = triple(forms)
  const wrong = new Set()
  const add = (candidate) => candidate !== correct && wrong.add(candidate)
  add(triple([a, regularEd(a), regularEd(a)]))
  add(triple([a, c, b]))
  for (let guard = 0; wrong.size < 3 && guard < 50; guard++) {
    const x = pickOf(others).forms
    const y = pickOf(others).forms
    add(triple(guard % 2 ? [a, x[1], y[2]] : [a, b, x[2]]))
  }
  return {
    type: 'single',
    prompt: `Wybierz poprawne trzy formy czasownika: ${pl}`,
    explanation: correct,
    points: 1,
    options: [{ text: correct, isCorrect: true }, ...[...wrong].slice(0, 3).map((text) => ({ text, isCorrect: false }))],
  }
}

async function buildChoice(src = 'data/lista-verbs.json', out = 'data/quiz-lista-choice.json') {
  const verbs = await readJson(src)
  const quiz = {
    $schema: SCHEMA_REF,
    title: QUIZ_TITLE,
    description: `Wszystkie ${verbs.length} czasowników z listy: po polsku → wybierz poprawne trzy formy (bezokolicznik, past simple, past participle) spośród czterech.`,
    difficulty: 'medium',
    // the player shuffles questions and answers on every play
    shuffleQuestions: true,
    shuffleOptions: true,
    sampleSize: null,
    questions: verbs.map((v) => choiceQuestion(v, verbs.filter((o) => o !== v))),
  }
  await writeJson(out, quiz)
  console.log(`${quiz.questions.length} pytań (1 z 4) -> ${out}`)
}

// ---- elements json -> quiz json (symbol <-> name, 1 of 4) ----------------------------------

const shuffled = (items) => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Three distractors from `pool`: lookalikes first (same first letter), then random ones. */
const distractors = (pool, key, correct) => {
  const others = shuffled(pool.filter((e) => e[key] !== correct[key]))
  const similar = others.filter((e) => e[key][0].toLowerCase() === correct[key][0].toLowerCase())
  return [...new Set([...similar, ...others])].slice(0, 3).map((e) => e[key])
}

const elementQuestion = (prompt, key, element, pool) => ({
  type: 'single',
  prompt,
  explanation: `${element.symbol} – ${element.name} (liczba atomowa ${element.z})`,
  points: 1,
  options: [
    { text: element[key], isCorrect: true },
    ...distractors(pool, key, element).map((text) => ({ text, isCorrect: false })),
  ],
})

async function buildElements(src = 'data/pierwiastki.json', out = 'data/quiz-pierwiastki.json') {
  const elements = await readJson(src)
  const quiz = {
    $schema: SCHEMA_REF,
    title: 'Pierwiastki chemiczne – symbole i nazwy (1 z 4)',
    description: `${elements.length} pierwiastków w obie strony: z nazwy odgadujesz symbol i odwrotnie. Przy każdym podejściu losowane jest 20 pytań z puli.`,
    difficulty: 'easy',
    shuffleQuestions: true,
    shuffleOptions: true,
    sampleSize: 20,
    questions: elements.flatMap((e) => [
      elementQuestion(`Jaki symbol ma pierwiastek: ${e.name}?`, 'symbol', e, elements),
      elementQuestion(`Jaki pierwiastek oznacza symbol ${e.symbol}?`, 'name', e, elements),
    ]),
  }
  await writeJson(out, quiz)
  console.log(`${quiz.questions.length} pytań (${elements.length} pierwiastków × 2 kierunki) -> ${out}`)
}

// ---- API: upload / download --------------------------------------------------------------

const call = async (method, path, payload) => {
  const token = process.env.PROD_API
  if (!token) throw new Error('Brak PROD_API (uruchom z --env-file=.env)')
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`)
  return data
}

async function upload(file) {
  if (!file) throw new Error('Podaj plik quizu JSON')
  const { $schema: _schema, ...quiz } = await readJson(file)
  console.log(`${quiz.title}: ${quiz.questions?.length ?? 0} pytań, API: ${BASE}`)
  if (dryRun) return
  const existing = (await call('GET', '/quizzes')).find((q) => q.title === quiz.title)
  const saved = existing ? await call('PUT', `/quizzes/${existing.id}`, quiz) : await call('POST', '/quizzes', quiz)
  console.log(`${existing ? 'Zaktualizowano' : 'Utworzono'} quiz ${saved.id} (${saved.questions.length} pytań)`)
}

/** Writes the editor view of a quiz in the same format `upload` accepts. */
async function download(ref, file) {
  if (!ref) throw new Error('Podaj id lub tytuł quizu')
  const id = /^[0-9a-f-]{36}$/i.test(ref) ? ref : (await call('GET', '/quizzes')).find((q) => q.title === ref)?.id
  if (!id) throw new Error(`Nie znaleziono quizu: ${ref}`)
  const q = await call('GET', `/quizzes/${id}?include=answers`)
  const out = {
    $schema: SCHEMA_REF,
    title: q.title,
    description: q.description,
    difficulty: q.difficulty,
    subject: q.subject,
    shuffleQuestions: q.shuffleQuestions,
    shuffleOptions: q.shuffleOptions,
    sampleSize: q.sampleSize,
    questions: q.questions.map((x) => ({
      type: x.type,
      prompt: x.prompt,
      explanation: x.explanation ?? '',
      points: x.points,
      options: x.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect ?? false })),
      // per-type payload must survive a download/upload round-trip
      ...(x.config === undefined ? {} : { config: x.config }),
    })),
  }
  const target = file ?? `data/quiz-${id}.json`
  await writeJson(target, out)
  console.log(`${out.questions.length} pytań -> ${target}`)
}

const commands = { 'list-to-json': listToJson, 'build-choice': buildChoice, 'build-elements': buildElements, upload, download }
if (!commands[command]) {
  console.error(`Użycie: quiz-tool.mjs <${Object.keys(commands).join(' | ')}> [argumenty]  (szczegóły na górze pliku)`)
  process.exit(1)
}
await commands[command](...rest)
