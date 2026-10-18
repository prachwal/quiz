import assert from 'node:assert/strict'
import { test } from 'node:test'
import { devAuthEnabled, devIdentity, parseDevRoles } from '../server/devAuth.ts'

const dev = { NETLIFY_DEV: 'true', DEV_AUTH_TOKEN: 'local-secret-token-123' }

test('the bypass is only on under `netlify dev` with a long enough token', () => {
  assert.equal(devAuthEnabled(dev), true)
  assert.equal(devAuthEnabled({ ...dev, CONTEXT: 'dev' }), true)
  assert.equal(devAuthEnabled({ ...dev, NETLIFY_DEV: undefined }), false)
  assert.equal(devAuthEnabled({ ...dev, NETLIFY_DEV: 'false' }), false)
  assert.equal(devAuthEnabled({ ...dev, DEV_AUTH_TOKEN: 'short' }), false)
  assert.equal(devAuthEnabled({ ...dev, DEV_AUTH_TOKEN: undefined }), false)
})

test('the bypass is off in every deployed context, even when the variables leak into it', () => {
  for (const CONTEXT of ['production', 'deploy-preview', 'branch-deploy']) {
    assert.equal(devAuthEnabled({ ...dev, CONTEXT }), false, CONTEXT)
  }
  assert.equal(devAuthEnabled({ ...dev, NODE_ENV: 'production' }), false)
  assert.equal(devIdentity({ DEV_AUTH_TOKEN: dev.DEV_AUTH_TOKEN }, dev.DEV_AUTH_TOKEN), null)
})

test('only the exact token gets an identity', () => {
  assert.equal(devIdentity(dev, undefined), null)
  assert.equal(devIdentity(dev, ''), null)
  assert.equal(devIdentity(dev, 'local-secret-token-124'), null)
  assert.equal(devIdentity(dev, 'local-secret-token-12'), null)
  assert.equal(devIdentity(dev, 'local-secret-token-1234'), null)
  assert.notEqual(devIdentity(dev, dev.DEV_AUTH_TOKEN), null)
})

test('defaults to an admin + teacher called dev|local', () => {
  const id = devIdentity(dev, dev.DEV_AUTH_TOKEN)!
  assert.equal(id.userId, 'dev|local')
  assert.deepEqual(id.roles, ['admin', 'teacher'])
  assert.deepEqual([...id.permissions].sort(), ['manage:classes', 'manage:users', 'write:quizzes'])
})

test('roles and user id are configurable; unknown roles are ignored', () => {
  assert.deepEqual(parseDevRoles('teacher, student, root,teacher'), ['teacher', 'student'])
  const id = devIdentity({ ...dev, DEV_AUTH_ROLES: 'student', DEV_AUTH_USER_ID: ' discord|dev ' }, dev.DEV_AUTH_TOKEN)!
  assert.equal(id.userId, 'discord|dev')
  assert.deepEqual(id.permissions, [])
  const none = devIdentity({ ...dev, DEV_AUTH_ROLES: 'root' }, dev.DEV_AUTH_TOKEN)!
  assert.deepEqual(none.permissions, [])
})
