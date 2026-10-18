import assert from 'node:assert/strict'
import { test } from 'node:test'
import { maskEmail } from '../src/shared/quiz/maskEmail.ts'

test('masks the local part of an e-mail address', () => {
  assert.equal(maskEmail('ala.kowalska@szkola.pl'), 'al***@szkola.pl')
  assert.equal(maskEmail('a@x.pl'), 'a***@x.pl')
  assert.equal(maskEmail('ab@x.pl'), 'a***@x.pl')
})

test('handles missing or malformed input', () => {
  assert.equal(maskEmail(null), null)
  assert.equal(maskEmail(''), null)
  assert.equal(maskEmail('nonsense'), '***')
})
