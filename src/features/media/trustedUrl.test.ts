import { describe, it, expect } from 'vitest'
import { isTrustedMediaUrl } from './trustedUrl'

const prod = { dev: false }
const dev = { dev: true }

describe('isTrustedMediaUrl', () => {
  it('accepts https without a configured base', () => {
    expect(isTrustedMediaUrl('https://cdn.example.com/a/b.png', prod)).toBe(true)
  })
  it('rejects http outside development', () => {
    expect(isTrustedMediaUrl('http://cdn.example.com/a.png', prod)).toBe(false)
    expect(isTrustedMediaUrl('http://localhost:9000/a.png', prod)).toBe(false)
  })
  it('accepts http://localhost only in development', () => {
    expect(isTrustedMediaUrl('http://localhost:9000/a.png', dev)).toBe(true)
    expect(isTrustedMediaUrl('http://evil.localhost/a.png', dev)).toBe(false)
  })
  it('rejects data:, javascript: and blob: addresses', () => {
    expect(isTrustedMediaUrl('data:image/png;base64,AAAA', dev)).toBe(false)
    expect(isTrustedMediaUrl('javascript:alert(1)', dev)).toBe(false)
    expect(isTrustedMediaUrl('blob:https://x.example/1', prod)).toBe(false)
  })
  it('rejects malformed addresses and credentials in the URL', () => {
    expect(isTrustedMediaUrl('not a url', prod)).toBe(false)
    expect(isTrustedMediaUrl('https://user:pw@cdn.example.com/a.png', prod)).toBe(false)
  })
  it('accepts only addresses under the configured base', () => {
    const policy = { base: 'https://media.example.com/bucket', dev: false }
    expect(isTrustedMediaUrl('https://media.example.com/bucket/x/1.png', policy)).toBe(true)
    expect(isTrustedMediaUrl('https://media.example.com/other/1.png', policy)).toBe(false)
    expect(isTrustedMediaUrl('https://evil.example.com/bucket/1.png', policy)).toBe(false)
    // a sibling directory that only shares the prefix is not inside the base
    expect(isTrustedMediaUrl('https://media.example.com/bucket-evil/1.png', policy)).toBe(false)
  })
  it('treats a base with a trailing slash the same way', () => {
    const policy = { base: 'https://media.example.com/bucket/', dev: false }
    expect(isTrustedMediaUrl('https://media.example.com/bucket/1.png', policy)).toBe(true)
    expect(isTrustedMediaUrl('https://media.example.com/bucket-evil/1.png', policy)).toBe(false)
  })
  it('rejects every address when the configured base is malformed', () => {
    expect(isTrustedMediaUrl('https://media.example.com/a.png', { base: 'nie url', dev: false })).toBe(false)
  })
})
