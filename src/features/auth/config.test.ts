import { describe, it, expect } from 'vitest'
import { auth0Config, authEnabled } from './config'

describe('auth config', () => {
  it('exports authEnabled boolean', () => {
    expect(typeof authEnabled).toBe('boolean')
    expect(auth0Config).toBeDefined()
  })
})
