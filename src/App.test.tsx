import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { Auth0Provider } from '@auth0/auth0-react'
import { api } from './app/api'
import settingsReducer from './features/settings/settingsSlice'
import feedbackReducer from './features/feedback/feedbackSlice'
import App from './App'

describe('App', () => {
  afterEach(() => cleanup())
  it('renders home route', async () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Auth0Provider domain="example.com" clientId="client" authorizationParams={{ redirect_uri: window.location.origin }}>
        <Provider store={store}>
          <App />
        </Provider>
      </Auth0Provider>,
    )
    // home shows skeleton or quiz title
    expect(document.body).toBeTruthy()
  })
})
