import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeVerbImage, verbImageAudit } from '../src/shared/quiz/verbImageAudit.ts'

const IMAGE = '0b9c2f7e-7a4e-4d55-9d0a-2f6f3c1a9e11'
const OWNER = 'google-oauth2|owner-1'

test('verbImageAudit writes the verb.image action with the verb as target', () => {
  const entry = verbImageAudit({ verbId: 42, base: 'go', mediaBefore: null, mediaAfter: IMAGE, ownerId: OWNER })
  assert.equal(entry.action, 'verb.image')
  assert.equal(entry.targetId, '42')
  assert.equal(entry.targetLabel, 'go')
  assert.deepEqual(entry.details, { verbId: 42, mediaBefore: null, mediaAfter: IMAGE, source: 'script', ownerId: OWNER })
})

test('verbImageAudit keeps the previous image when a verb is replaced', () => {
  const previous = '7a1e0c3d-2b4f-4e8a-9c6d-1f2e3d4c5b6a'
  const entry = verbImageAudit({ verbId: 7, base: 'be', mediaBefore: previous, mediaAfter: IMAGE, ownerId: OWNER })
  assert.deepEqual(entry.details, { verbId: 7, mediaBefore: previous, mediaAfter: IMAGE, source: 'script', ownerId: OWNER })
})

test('describeVerbImage shows the shortened ids and the script source', () => {
  const entry = verbImageAudit({ verbId: 1, base: 'go', mediaBefore: null, mediaAfter: IMAGE, ownerId: OWNER })
  assert.equal(describeVerbImage(entry.details), '— → 0b9c2f7e (skrypt)')
  assert.equal(describeVerbImage({ mediaBefore: IMAGE, mediaAfter: null, source: 'script' }), '0b9c2f7e → — (skrypt)')
})

test('describeVerbImage tolerates details without ids', () => {
  assert.equal(describeVerbImage({}), '— → —')
  assert.equal(describeVerbImage({ mediaBefore: 42, mediaAfter: '' }), '— → —')
})
