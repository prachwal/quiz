import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { Auth0Provider } from '@auth0/auth0-react'
import { useAuth } from './useAuth'

describe('useAuth', () => {
  afterEach(() => cleanup())
  it('works without configured auth (anonymous)', () => {
    const wrapper = ({ children }: any) => (
      <Auth0Provider domain="example.com" clientId="client" authorizationParams={{ redirect_uri: window.location.origin }}>
        {children}
      </Auth0Provider>
    )
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.roles).toEqual([])
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isTeacher).toBe(false)
  })
})
