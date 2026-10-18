import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseStudentKey, studentKey } from '../src/features/classes/studentKey.ts'

test('student keys round-trip, also for Auth0 ids containing separators', () => {
  const classId = '3f9b6a0e-0000-4000-8000-000000000001'
  for (const userId of ['google-oauth2|123', 'auth0|abc.def', 'discord|9::9']) {
    assert.deepEqual(parseStudentKey(studentKey(classId, userId)), { classId, userId })
  }
})
