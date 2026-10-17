import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toAdminUser, sanitizeSearchTerm, buildUserQuery } from '../server/auth0AdminPure.ts'

test('toAdminUser maps fields', () => {
  const u = toAdminUser({ user_id: 'auth0|1', email: 'a@b.pl', name: 'Anna', picture: 'p', last_login: '2026-01-01', logins_count: 5, blocked: false, identities: [{ provider: 'google', connection: 'google-oauth2' }] }, ['student'])
  assert.equal(u.id, 'auth0|1')
  assert.equal(u.email, 'a@b.pl')
  assert.equal(u.name, 'Anna')
  assert.equal(u.provider, 'google-oauth2')
  assert.equal(u.loginsCount, 5)
  assert.deepEqual(u.roles, ['student'])
})

test('sanitizeSearchTerm strips unsafe chars', () => {
  assert.equal(sanitizeSearchTerm('a@b.pl'), 'a@b.pl')
  assert.equal(sanitizeSearchTerm('x<script>'), 'x script')
})

test('buildUserQuery empty for blank', () => {
  assert.equal(buildUserQuery(''), '')
  assert.equal(buildUserQuery('   '), '')
})

test('buildUserQuery builds lucene query', () => {
  const q = buildUserQuery('anna')
  assert.ok(q.startsWith('&q='))
  assert.ok(decodeURIComponent(q).includes('email:*anna*'))
})
