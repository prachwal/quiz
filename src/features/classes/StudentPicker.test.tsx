import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../settings/settingsSlice'
import feedbackReducer from '../feedback/feedbackSlice'
import { server } from '../../test/msw'
import StudentPicker from './StudentPicker'

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ isAdmin: true, isTeacher: false, user: { sub: 'admin|1' } }) }))

describe('StudentPicker', () => {
  afterEach(() => cleanup())

  it('lists students per class (admins ask for all classes) and reports the chosen one', async () => {
    let scope: string | null = null
    server.use(
      http.get('/api/students', ({ request }) => {
        scope = new URL(request.url).searchParams.get('scope')
        return HttpResponse.json([
          { userId: 'discord|1', name: 'Ala Kot', email: 'ala@x.pl', classes: [{ id: 'c1', name: '3A' }, { id: 'c2', name: '3B' }] },
        ])
      }),
    )
    const onChange = vi.fn()
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer },
      middleware: (g) => g().concat(api.middleware),
    })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <AntdApp>
              <StudentPicker value={null} onChange={onChange} />
            </AntdApp>
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Wybór ucznia' }))
    expect(await screen.findByText('Ala Kot — 3B')).toBeTruthy()
    expect(scope).toBe('all')
    fireEvent.click(screen.getByText('Ala Kot — 3A'))
    expect(onChange).toHaveBeenCalledWith('c1::discord|1')
  })
})
