import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { api } from '../../app/api'
import settingsReducer from '../../features/settings/settingsSlice'
import feedbackReducer from './feedbackSlice'
import ErrorFallback from './ErrorFallback'

describe('ErrorFallback', () => {
  afterEach(() => cleanup())
  it('renders error message', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer } })
    render(
      <Provider store={store}>
        <ErrorFallback eventId="abc12345" />
      </Provider>,
    )
    expect(screen.getByText('Coś poszło nie tak')).toBeInTheDocument()
  })
})
