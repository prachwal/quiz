import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Auth0Provider } from '@auth0/auth0-react'
import { MemoryRouter } from 'react-router-dom'
import RequireRole from './RequireRole'

describe('RequireRole', () => {
  afterEach(() => cleanup())
  it('shows 403 when role missing', () => {
    render(
      <Auth0Provider domain="example.com" clientId="client" authorizationParams={{ redirect_uri: window.location.origin }}>
        <ConfigProvider>
          <MemoryRouter>
            <RequireRole role="admin">
              <div>secret</div>
            </RequireRole>
          </MemoryRouter>
        </ConfigProvider>
      </Auth0Provider>,
    )
    expect(screen.getByText('Brak dostępu')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })
})
