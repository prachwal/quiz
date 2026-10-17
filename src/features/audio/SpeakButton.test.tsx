import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import settingsReducer from '../../features/settings/settingsSlice'
import SpeakButton from './SpeakButton'

describe('SpeakButton', () => {
  afterEach(() => cleanup())
  it('renders nothing without an English voice', () => {
    const store = configureStore({ reducer: { settings: settingsReducer } })
    const { container } = render(
      <Provider store={store}>
        <ConfigProvider>
          <SpeakButton speakKey="k" parts={['a']} />
        </ConfigProvider>
      </Provider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
