import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { api } from '../../app/api'
import WeakMark from './WeakMark'

describe('WeakMark', () => {
  afterEach(() => cleanup())
  it('renders nothing when no weak verbs loaded', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: (g) => g().concat(api.middleware) })
    const { container } = render(
      <Provider store={store}>
        <ConfigProvider>
          <WeakMark verbId={1} />
        </ConfigProvider>
      </Provider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
