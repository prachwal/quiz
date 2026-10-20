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

// Naprawa 14 (5.C): server/mcp/tools/media.ts wiąże obraz z quizem przez quizRepo.
// To jedyne świadome odstępstwo od reguły media-no-domain; wyjątek ma zniknąć razem z
// naprawą (wtedy test pada z komunikatem „usuń wyjątek”).
const HARD_RULE_EXCEPTIONS: Exception[] = [{ from: 'server/mcp/tools/media.ts', to: 'server/quizRepo.ts' }]

// Dozwolone składy cykli modułów. Nowy cykl albo większy skład pada.
const EXPECTED_CYCLES = [
  ['classes', 'learning', 'media', 'progress', 'quizzes'],
  ['f-learning', 'f-progress', 'f-quizzes'],
  ['shared-quizzes', 'shared-types'],
]

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
