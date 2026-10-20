// Kanarek granic modułów. Audyt (scripts/arch-core.mjs) czyta manifest, a ta lista
// sprawdza, czy repo się nie pogorszyło: nowe naruszenie pada, wpis, który już nie
// narusza, też pada (lista tylko się kurczy), cykle nie mogą przybywać, a reguły twarde
// (media bez quizzes/learning/progress/classes, src bez server) nie zależą od listy.
// Jak czytać porażkę i regenerować listę: docs/Architecture-Audit.md, sekcja „Kanarek”.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { ALLOWLIST_FILE, auditRepo, checkArchitecture } from '../scripts/arch-core.mjs'

type Entry = { from: string; to: string; pair: string; reason: string }
type Exception = { from: string; to: string }

// Brak świadomych odstępstw od reguł twardych: media nie zna quizów (tytuły dostaje przez MediaToolDeps).
const HARD_RULE_EXCEPTIONS: Exception[] = []

// Dozwolone składy cykli modułów. Nowy cykl albo większy skład pada.
const EXPECTED_CYCLES = [['shared-quizzes', 'shared-types']]

const ROOT = process.cwd()
const audit = auditRepo(ROOT)
const allowlist: Entry[] = JSON.parse(readFileSync(join(ROOT, ALLOWLIST_FILE), 'utf8')).entries
const report = checkArchitecture(audit, { allowlist, exceptions: HARD_RULE_EXCEPTIONS, expectedCycles: EXPECTED_CYCLES })

const show = (items: { from: string; to: string; pair: string }[]) => items.map((i) => `  - ${i.from} -> ${i.to} (${i.pair})`).join('\n')

test('no new module boundary violations outside the allowlist', () => {
  assert.equal(
    report.newViolations.length,
    0,
    `Nowe naruszenia granic modułów:\n${show(report.newViolations)}\n` +
      'napraw import albo (wyjątkowo) dopisz do scripts/arch-allowlist.json z uzasadnieniem',
  )
})

test('every allowlist entry still violates (stale entries are removed)', () => {
  assert.equal(
    report.staleEntries.length,
    0,
    `Wpisy, które już nie naruszają granic:\n${show(report.staleEntries)}\nusuń z scripts/arch-allowlist.json`,
  )
  assert.equal(
    report.pairMismatches.length,
    0,
    'Pole pair nie zgadza się z aktualnym modułem pliku:\n' +
      report.pairMismatches.map((m) => `  - ${m.entry.from} -> ${m.entry.to}: wpis ${m.entry.pair}, dziś ${m.current}`).join('\n') +
      '\npopraw pole pair w scripts/arch-allowlist.json',
  )
  assert.equal(
    report.staleExceptions.length,
    0,
    `Wyjątek reguły twardej już nie narusza:\n${show(report.staleExceptions)}\nusuń wyjątek z HARD_RULE_EXCEPTIONS`,
  )
})

test('module cycles do not grow beyond the known set', () => {
  assert.equal(report.cycleCountExceeded, false, `Liczba cykli wzrosła ponad ${EXPECTED_CYCLES.length}`)
  assert.deepEqual(
    report.unexpectedCycles,
    [],
    `Nowy cykl modułów: ${report.unexpectedCycles.map((c: string[]) => c.join(', ')).join(' | ')}`,
  )
})

test('hard rule: media modules never import quizzes, learning, progress or classes', () => {
  const mediaRules = report.hardRuleViolations.filter((v: { rule: string }) => v.rule === 'media-no-domain')
  assert.equal(
    mediaRules.length,
    0,
    `Moduł media importuje domenę (reguła twarda, nie allowlist):\n${mediaRules
      .map((v: { from: string; to: string; pair: string; line: number }) => `  - ${v.from}:${v.line} -> ${v.to} (${v.pair})`)
      .join('\n')}`,
  )
})

test('hard rule: src/** never imports server/**', () => {
  const srcRules = report.hardRuleViolations.filter((v: { rule: string }) => v.rule === 'src-no-server')
  assert.equal(srcRules.length, 0, `src/ importuje server/:\n${show(srcRules)}`)
})

test('every code file belongs to a module', () => {
  assert.equal(
    report.unassigned.length,
    0,
    `plik poza modułami: dodaj regułę do scripts/arch-manifest.json\n${report.unassigned.map((file: string) => `  - ${file}`).join('\n')}`,
  )
})

test('server/ and src/ have no non-literal import() or require()', () => {
  assert.equal(
    report.nonLiteralDynamic.length,
    0,
    `Dynamiczny import albo require bez literału (cel niewidoczny dla grafu):\n${report.nonLiteralDynamic
      .map((d: { file: string; line: number; text: string }) => `  - ${d.file}:${d.line} ${d.text}(...)`)
      .join('\n')}`,
  )
})

test('allowlist never hides a hard-rule import', () => {
  assert.equal(
    report.allowlistHardRule.length,
    0,
    `Wpis allowlisty ukrywa regułę twardą:\n${report.allowlistHardRule
      .map((h: { rule: string; entry: Entry }) => `  - ${h.entry.from} -> ${h.entry.to} (${h.rule})`)
      .join('\n')}`,
  )
})

// The canary must bite: a tiny synthetic tree with one violating import, one forbidden
// media -> quizzes import, one stale allowlist entry and one cycle.
test('canary detects violation, stale entry, hard rule and cycle in a synthetic tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-canary-'))
  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  try {
    write(
      'scripts/arch-manifest.json',
      JSON.stringify({
        version: 1,
        rules: [
          { module: 'media', match: 'src/media/' },
          { module: 'quizzes', match: 'src/quizzes/' },
        ],
        allow: { media: [], quizzes: [] },
        open: [],
        incoming: {},
      }),
    )
    // The import lines are assembled from pieces: the audit parser reads specifiers inside
    // string literals, so a literal `import ... from '...'` here would count as a real import.
    const importLine = (names: string, path: string) => ['import', names, 'from', `'${path}'`].join(' ')
    write('src/quizzes/q.ts', `${importLine('{ m }', '../media/m')}\nexport const q = m\n`)
    write('src/media/m.ts', `${importLine('{ q }', '../quizzes/q')}\nexport const m = 1\nexport const r = q\n`)

    const tree = auditRepo(dir)
    const quizToMedia = { from: 'src/quizzes/q.ts', to: 'src/media/m.ts', pair: 'quizzes -> media', reason: 'test' }
    const staleEntry = { from: 'src/quizzes/gone.ts', to: 'src/media/m.ts', pair: 'quizzes -> media', reason: 'test' }

    const found = checkArchitecture(tree, { allowlist: [quizToMedia, staleEntry], expectedCycles: [] })
    // The listed violation is accepted, the forbidden media import is new.
    assert.deepEqual(
      found.newViolations.map((v: Entry) => `${v.from} -> ${v.to}`),
      ['src/media/m.ts -> src/quizzes/q.ts'],
    )
    assert.deepEqual(
      found.staleEntries.map((v: Entry) => v.from),
      ['src/quizzes/gone.ts'],
    )
    assert.deepEqual(
      found.hardRuleViolations.map((v: { rule: string; from: string }) => [v.rule, v.from]),
      [['media-no-domain', 'src/media/m.ts']],
    )
    assert.equal(found.cycleCount, 1)
    assert.deepEqual(found.unexpectedCycles, [['media', 'quizzes']])

    // An allowlist entry for the forbidden import hides nothing: the hard rule reports it.
    const hiding = checkArchitecture(tree, {
      allowlist: [quizToMedia, { from: 'src/media/m.ts', to: 'src/quizzes/q.ts', pair: 'media -> quizzes', reason: 'test' }],
    })
    assert.equal(hiding.allowlistHardRule.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A file that no manifest rule matches is invisible to the module edge check (its edges are never judged),
// so the canary must catch it on its own. The import below would be a violation if the file had a module.
test('canary detects a file outside every module and a non-literal dynamic import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-unassigned-'))
  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  try {
    write(
      'scripts/arch-manifest.json',
      JSON.stringify({
        version: 1,
        rules: [{ module: 'quizzes', match: 'server/quizRepo.ts' }],
        allow: { quizzes: [] },
        open: [],
        incoming: {},
      }),
    )
    const importLine = (names: string, path: string) => ['import', names, 'from', `'${path}'`].join(' ')
    write('server/quizRepo.ts', 'export const repo = 1\n')
    write('server/mediaHelpers.ts', `${importLine('{ repo }', './quizRepo')}\nexport const helper = repo\n`)
    // The call is assembled from pieces so the real scanner of this test file does not see a dynamic import.
    const keyword = 'import'
    write('server/loader.ts', `export const load = (name: string) => ${keyword}(name)\nexport const old = (name: string) => require(name)\n`)
    write('src/literal.ts', `export const lazy = () => ${keyword}('./quizRepo')\n`)

    const tree = auditRepo(dir)
    const found = checkArchitecture(tree, { allowlist: [], expectedCycles: [] })
    assert.deepEqual(found.unassigned, ['server/loader.ts', 'server/mediaHelpers.ts', 'src/literal.ts'])
    // The unassigned import is not judged as a violation, which is exactly why `unassigned` must fail.
    assert.deepEqual(found.newViolations, [])
    assert.deepEqual(
      found.nonLiteralDynamic.map((d: { file: string; line: number; text: string }) => [d.file, d.line, d.text]),
      [
        ['server/loader.ts', 1, 'import'],
        ['server/loader.ts', 2, 'require'],
      ],
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
