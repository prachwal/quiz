import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import ReviewCard from './ReviewCard'

describe('ReviewCard', () => {
  afterEach(() => cleanup())
  it('shows skeleton while loading', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <AntdApp>
              <ReviewCard />
            </AntdApp>
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(document.querySelector('.ant-skeleton')).not.toBeNull()
  })
})
