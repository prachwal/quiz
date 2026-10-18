import assert from 'node:assert/strict'
import { test } from 'node:test'
import { metadataUrl, protectedResourceMetadata, publicOrigin } from '../server/protectedResource.ts'

test('the public origin comes from the forwarded headers, then Host', () => {
  assert.equal(publicOrigin({ host: 'internal:3000', 'x-forwarded-host': 'quiz.example', 'x-forwarded-proto': 'https' }), 'https://quiz.example')
  assert.equal(publicOrigin({ host: 'quiz.example' }), 'https://quiz.example')
  assert.equal(publicOrigin({ host: 'localhost:8888' }), 'http://localhost:8888')
  assert.equal(publicOrigin({ host: 'a.example', 'x-forwarded-proto': 'https, http' }), 'https://a.example')
})

test('a malformed or missing host gives no origin', () => {
  assert.equal(publicOrigin({}), null)
  assert.equal(publicOrigin({ host: 'evil.example"/x' }), null)
})

test('the metadata names the MCP endpoint and Auth0 as its authorization server', () => {
  const origin = 'https://quiz.example'
  assert.equal(metadataUrl(origin), 'https://quiz.example/.well-known/oauth-protected-resource/api/mcp')
  const meta = protectedResourceMetadata(origin, 'tenant.auth0.com')
  assert.equal(meta.resource, 'https://quiz.example/api/mcp')
  assert.deepEqual(meta.authorization_servers, ['https://tenant.auth0.com/'])
})
