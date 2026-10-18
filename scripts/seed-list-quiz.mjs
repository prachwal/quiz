#!/usr/bin/env node
// Creates (or updates, matched by title) the "Czasowniki nieregularne – lista" quiz from docs/lista.md
// through the public API. Usage:
//   node --env-file=.env scripts/seed-list-quiz.mjs [--dry-run]
// Env: PROD_API (personal API token with write access), API_URL (default: production site;
// e.g. http://localhost:8888 for `netlify dev`).
import { readFile } from 'node:fs/promises'

const TITLE = 'Czasowniki nieregularne – lista z docs/lista.md'
const BASE = (process.env.API_URL ?? 'https://fabulous-dieffenbachia.netlify.app').replace(/\/$/, '') + '/api'
const dryRun = process.argv.includes('--dry-run')

// typos in the source list -> correct forms
const FIXES = { 'de-al': 'deal', 'de-alt': 'dealt' }

const parseLine = (line) => {
  const m = line.trim().match(/^(.+?)\s+[—–-]\s+(.+?)\.?$/)
  if (!m) return null
  const forms = m[2].split(',').map((f) => FIXES[f.trim().toLowerCase()] ?? f.trim().toLowerCase())
  return forms.length === 3 && forms.every(Boolean) ? { pl: m[1].trim(), forms } : null
}

const shuffled = (items) => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const triple = (forms) => forms.join(' – ')
const regularEd = (base) => (base.endsWith('e') ? `${base}d` : /[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ied` : `${base}ed`)

/** Typing: the learner writes all three forms; separators are not normalised, so list the usual ones. */
const typingQuestion = ({ pl, forms }) => {
  const [a, b, c] = forms
  const accepted = [`${a} ${b} ${c}`, `${a}, ${b}, ${c}`, `${a} - ${b} - ${c}`, `${a}-${b}-${c}`, `${a}/${b}/${c}`]
  return {
    type: 'text',
    prompt: `Wpisz trzy formy czasownika: ${pl}`,
    explanation: triple(forms),
    points: 1,
    options: accepted.map((text) => ({ text, isCorrect: true })),
  }
}

/** Choice: one correct triple among three plausible wrong ones (naive -ed form, swapped forms, mixed verbs). */
const choiceQuestion = ({ pl, forms }, others) => {
  const [a, b, c] = forms
  const pick = () => others[Math.floor(Math.random() * others.length)].forms
  const correct = triple(forms)
  const wrong = new Set()
  const add = (candidate) => candidate !== correct && wrong.add(candidate)
  add(triple([a, regularEd(a), regularEd(a)]))
  add(triple([a, c, b]))
  for (let guard = 0; wrong.size < 3 && guard < 50; guard++) {
    const x = pick()
    const y = pick()
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

const rows = (await readFile(new URL('../docs/lista.md', import.meta.url), 'utf8')).split('\n').filter((l) => l.trim())
const verbs = rows.map(parseLine)
const bad = rows.filter((_, i) => !verbs[i])
if (bad.length) throw new Error(`Nie udało się sparsować linii:\n${bad.join('\n')}`)

const body = {
  title: TITLE,
  description: `Wszystkie ${verbs.length} czasowników z listy w losowej kolejności: raz trzeba wpisać trzy formy, raz wybrać poprawne z czterech (bezokolicznik, past simple, past participle).`,
  difficulty: 'medium',
  // random half of the verbs is typed, the rest is multiple choice; the player shuffles questions and options
  questions: (() => {
    const typed = new Set(shuffled(verbs.map((_, i) => i)).slice(0, Math.ceil(verbs.length / 2)))
    return shuffled(
      verbs.map((v, i) => (typed.has(i) ? typingQuestion(v) : choiceQuestion(v, verbs.filter((o) => o !== v)))),
    )
  })(),
  shuffleQuestions: true,
  shuffleOptions: true,
  sampleSize: null,
}
console.log(`${verbs.length} pytań, API: ${BASE}`)
if (dryRun) process.exit(0)

const token = process.env.PROD_API
if (!token) throw new Error('Brak PROD_API (uruchom z --env-file=.env)')
const call = async (method, path, payload) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`)
  return data
}

const existing = (await call('GET', '/quizzes')).find((q) => q.title === TITLE)
if (existing) {
  // keep the sample size the owner chose in the quiz editor
  body.sampleSize = (await call('GET', `/quizzes/${existing.id}?include=answers`)).sampleSize
}
const saved = existing ? await call('PUT', `/quizzes/${existing.id}`, body) : await call('POST', '/quizzes', body)
console.log(`${existing ? 'Zaktualizowano' : 'Utworzono'} quiz ${saved.id}`)
