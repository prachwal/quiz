#!/usr/bin/env node
// Creates (or updates, matched by title) the "Czasowniki nieregularne – lista" quiz from docs/lista.md
// through the public API. Usage:
//   node --env-file=.env scripts/seed-list-quiz.mjs [--dry-run]
// Env: PROD_API (personal API token with write access), API_URL (default: production site).
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

const question = ({ pl, forms }) => {
  const [a, b, c] = forms
  // answers are compared after trim + lower-case, so list the common separators explicitly
  const accepted = [`${a} ${b} ${c}`, `${a}, ${b}, ${c}`, `${a} - ${b} - ${c}`, `${a}-${b}-${c}`, `${a}/${b}/${c}`]
  return {
    type: 'text',
    prompt: `Podaj trzy formy czasownika: ${pl}`,
    explanation: `${a} – ${b} – ${c}`,
    points: 1,
    options: accepted.map((text) => ({ text, isCorrect: true })),
  }
}

const rows = (await readFile(new URL('../docs/lista.md', import.meta.url), 'utf8')).split('\n').filter((l) => l.trim())
const verbs = rows.map(parseLine)
const bad = rows.filter((_, i) => !verbs[i])
if (bad.length) throw new Error(`Nie udało się sparsować linii:\n${bad.join('\n')}`)

const body = {
  title: TITLE,
  description: `Wszystkie ${verbs.length} czasowników z listy: po polsku → trzy formy (bezokolicznik, past simple, past participle).`,
  difficulty: 'medium',
  questions: verbs.map(question),
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
const saved = existing ? await call('PUT', `/quizzes/${existing.id}`, body) : await call('POST', '/quizzes', body)
console.log(`${existing ? 'Zaktualizowano' : 'Utworzono'} quiz ${saved.id}`)
