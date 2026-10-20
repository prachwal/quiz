import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classTransferBlocker,
  newOwnerRoleRefusal,
  lastAdminBlockRefusal,
  lastAdminRoleRefusal,
  LAST_ADMIN_BLOCK_REFUSAL,
  LAST_ADMIN_ROLE_REFUSAL,
  selfBlockRefusal,
  selfRoleRefusal,
  SELF_BLOCK_REFUSAL,
  SELF_ROLE_REFUSAL,
} from '../server/userAdminPure.ts'

test('self role: the actor may not drop admin from themselves, other changes are fine', () => {
  assert.equal(selfRoleRefusal('admin|1', 'admin|1', ['student']), SELF_ROLE_REFUSAL)
  assert.equal(selfRoleRefusal('admin|1', 'admin|1', []), SELF_ROLE_REFUSAL)
  assert.equal(selfRoleRefusal('admin|1', 'admin|1', ['admin', 'teacher']), null)
  assert.equal(selfRoleRefusal('admin|1', 'student|2', []), null)
})

test('last admin: removing admin is refused only when it is the last one', () => {
  assert.equal(lastAdminRoleRefusal(['admin'], [], 1), LAST_ADMIN_ROLE_REFUSAL)
  assert.equal(lastAdminRoleRefusal(['admin'], [], 2), null)
  assert.equal(lastAdminRoleRefusal(['teacher'], [], 1), null, 'not an admin: nothing to protect')
  assert.equal(lastAdminRoleRefusal(['admin'], ['admin'], 1), null, 'keeping admin is always fine')
})

test('self block: blocking yourself is refused, unblocking is not', () => {
  assert.equal(selfBlockRefusal('admin|1', 'admin|1', true), SELF_BLOCK_REFUSAL)
  assert.equal(selfBlockRefusal('admin|1', 'admin|1', false), null)
  assert.equal(selfBlockRefusal('admin|1', 'student|2', true), null)
})

test('last admin block: blocking the last admin is refused, blocking a student or unblocking is not', () => {
  assert.equal(lastAdminBlockRefusal(['admin'], true, 1), LAST_ADMIN_BLOCK_REFUSAL)
  assert.equal(lastAdminBlockRefusal(['admin'], true, 2), null)
  assert.equal(lastAdminBlockRefusal(['student'], true, 1), null)
  assert.equal(lastAdminBlockRefusal(['admin'], false, 1), null)
})

test('class transfer: active class and a different new owner, then the new owner needs teacher or admin', () => {
  assert.match(classTransferBlocker({ archived: true, ownerId: 'teacher|1', newOwnerId: 'teacher|2' }) ?? '', /Zarchiwizowanej/)
  assert.match(classTransferBlocker({ archived: false, ownerId: 'teacher|1', newOwnerId: 'teacher|1' }) ?? '', /już jest właścicielem/)
  assert.equal(classTransferBlocker({ archived: false, ownerId: 'teacher|1', newOwnerId: 'teacher|2' }), null)
  assert.equal(newOwnerRoleRefusal(['teacher']), null)
  assert.equal(newOwnerRoleRefusal(['admin', 'student']), null)
  assert.match(newOwnerRoleRefusal(['student']) ?? '', /nauczyciela albo admina/)
  assert.match(newOwnerRoleRefusal([]) ?? '', /nauczyciela albo admina/)
  assert.match(newOwnerRoleRefusal(null) ?? '', /Nie znaleziono użytkownika/)
})
