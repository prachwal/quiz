import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTokenGetter, getAccessToken } from '../src/features/auth/token.ts'

test('getAccessToken returns null when no getter', async () => {
  setTokenGetter(null)
  assert.equal(await getAccessToken(), null)
})

test('getAccessToken returns token from getter', async () => {
  setTokenGetter(async () => 'tok')
  assert.equal(await getAccessToken(), 'tok')
})

test('getAccessToken swallows errors', async () => {
  setTokenGetter(async () => { throw new Error('boom') })
  assert.equal(await getAccessToken(), null)
  setTokenGetter(null)
})
