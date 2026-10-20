import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyBlockReason, baseOfFile, planVerbImages, type VerbRef } from '../server/verbImageMatch.ts'

const verbs: VerbRef[] = [
  { id: 1, base: 'go', imageMediaId: null },
  { id: 2, base: 'be', imageMediaId: null },
  { id: 3, base: 'eat', imageMediaId: '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b' },
  { id: 4, base: 'buy', imageMediaId: null },
]

test('baseOfFile takes the base form from a .webp name, case-insensitively', () => {
  assert.equal(baseOfFile('go.webp'), 'go')
  assert.equal(baseOfFile('Go.WEBP'), 'go')
  assert.equal(baseOfFile('.webp'), null)
  assert.equal(baseOfFile('go.png'), null)
  assert.equal(baseOfFile('go.webp.bak'), null)
})

test('planVerbImages matches files to verbs by base form and plans the free verbs', () => {
  const plan = planVerbImages(['Go.webp', 'be.webp'], verbs, false)
  assert.deepEqual(plan.matches, [
    { file: 'be.webp', verbId: 2, base: 'be', action: 'set' },
    { file: 'Go.webp', verbId: 1, base: 'go', action: 'set' },
  ])
  assert.deepEqual(plan.unmatchedFiles, [])
  assert.deepEqual(plan.ambiguous, [])
})

test('a verb that already has an image is skipped unless replace is set', () => {
  const skipped = planVerbImages(['eat.webp'], verbs, false)
  assert.deepEqual(skipped.matches, [{ file: 'eat.webp', verbId: 3, base: 'eat', action: 'skip-has-image' }])
  const replaced = planVerbImages(['eat.webp'], verbs, true)
  assert.deepEqual(replaced.matches, [{ file: 'eat.webp', verbId: 3, base: 'eat', action: 'replace' }])
})

test('files without a verb are reported as unmatched, other files as ignored', () => {
  const plan = planVerbImages(['sing.webp', 'readme.txt', 'go.png', 'go.webp'], verbs, false)
  assert.deepEqual(plan.unmatchedFiles, ['sing.webp'])
  assert.deepEqual(plan.ignoredFiles, ['go.png', 'readme.txt'])
  assert.deepEqual(plan.matches.map((m) => m.file), ['go.webp'])
})

test('verbs without a file are listed by base form', () => {
  const plan = planVerbImages(['go.webp', 'eat.webp'], verbs, false)
  assert.deepEqual(plan.verbsWithoutFile, ['be', 'buy'])
})

test('two files for one verb are ambiguous and nothing is planned for them', () => {
  const plan = planVerbImages(['Go.webp', 'go.webp', 'be.webp'], verbs, false)
  assert.deepEqual(plan.ambiguous, [{ base: 'go', files: ['Go.webp', 'go.webp'] }])
  assert.deepEqual(plan.matches.map((m) => m.base), ['be'])
  assert.ok(!plan.verbsWithoutFile.includes('go'))
})

test('two verbs with the same base form are ambiguous as well', () => {
  const plan = planVerbImages(['run.webp'], [...verbs, { id: 9, base: 'Run', imageMediaId: null }, { id: 8, base: 'run', imageMediaId: null }], false)
  assert.equal(plan.matches.length, 0)
  assert.deepEqual(plan.ambiguous, [{ base: 'run', files: ['run.webp'] }])
})

test('applyBlockReason refuses the memory driver only', () => {
  assert.notEqual(applyBlockReason({ MEDIA_DRIVER: 'memory' }), null)
  assert.notEqual(applyBlockReason({ MEDIA_DRIVER: ' MEMORY ' }), null)
  assert.equal(applyBlockReason({ MEDIA_DRIVER: 's3' }), null)
  assert.equal(applyBlockReason({}), null)
})
