import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import StreakChip from './StreakChip'

describe('StreakChip', () => {
  afterEach(() => cleanup())
  it('renders nothing without data', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: (g) => g().concat(api.middleware) })
    const { container } = render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <StreakChip />
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
