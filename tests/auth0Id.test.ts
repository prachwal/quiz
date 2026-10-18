import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAuth0Id } from '../src/shared/quiz/auth0Id.ts'
import { auth0UserId } from '../src/shared/quiz/schema.ts'

const valid = ['google-oauth2|111533420077668774596', 'auth0|6a116f0f5d43612a95d0030a', 'github|1977012', 'oauth2|twitch|277819547', 'oauth2|discord|606581858758557699', 'discord|99']
const invalid = ['', 'nonsense', 'google-oauth2|', '|123', 'a b|c', 'oauth2||discord', 'x|y z']

test('accepts every Auth0 id format used by the tenant, including oauth2|provider|id', () => {
  for (const id of valid) {
    assert.equal(isAuth0Id(id), true, id)
    assert.equal(auth0UserId.safeParse(id).success, true, id)
  }
})

test('rejects malformed ids', () => {
  for (const id of invalid) {
    assert.equal(isAuth0Id(id), false, id)
    assert.equal(auth0UserId.safeParse(id).success, false, id)
  }
})
