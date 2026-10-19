import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listVerbs } from '../../server/irregularVerbs.ts'

const hasDb = Boolean(process.env.DATABASE_URL)
const run = hasDb ? test : test.skip

run('integration: listVerbs returns seeded verbs', async () => {
  const verbs = await listVerbs()
  assert.ok(Array.isArray(verbs))
  assert.ok(verbs.length > 0)
  assert.ok(verbs[0].base.length > 0)
})
