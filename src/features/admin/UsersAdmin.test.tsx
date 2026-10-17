import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { Auth0Provider } from '@auth0/auth0-react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../../features/settings/settingsSlice'
import feedbackReducer from '../../features/feedback/feedbackSlice'
import UsersAdmin from './UsersAdmin'

describe('UsersAdmin', () => {
  afterEach(() => cleanup())
  it('renders search input', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Auth0Provider domain="example.com" clientId="client" authorizationParams={{ redirect_uri: window.location.origin }}>
        <Provider store={store}>
          <ConfigProvider>
            <MemoryRouter>
              <AntdApp>
                <UsersAdmin />
              </AntdApp>
            </MemoryRouter>
          </ConfigProvider>
        </Provider>
      </Auth0Provider>,
    )
    expect(screen.getByPlaceholderText('Szukaj po nazwie lub e-mailu')).toBeInTheDocument()
  })
})
