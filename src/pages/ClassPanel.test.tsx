import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../app/api'
import settingsReducer from '../features/settings/settingsSlice'
import feedbackReducer from '../features/feedback/feedbackSlice'
import { server } from '../test/msw'
import ClassPanel from './ClassPanel'

const auth = vi.hoisted(() => ({ value: { isAdmin: false, isTeacher: true, user: { sub: 'teacher|1' } as { sub: string } | undefined } }))
vi.mock('../features/auth/useAuth', () => ({ useAuth: () => auth.value }))

const classRow = (over: Record<string, unknown>) => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Klasa 1',
  ownerId: 'teacher|1',
  ownerName: 'Ewa Nowak',
  joinCode: 'ABC234',
  memberCount: 3,
  assignmentCount: 2,
  joiningOpen: true,
  archived: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...over,
})

function renderPanel() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer },
    middleware: (g) => g().concat(api.middleware),
  })
  render(
    <Provider store={store}>
      <ConfigProvider>
        <MemoryRouter initialEntries={['/manage/classes']}>
          <AntdApp>
            <ClassPanel />
          </AntdApp>
        </MemoryRouter>
      </ConfigProvider>
    </Provider>,
  )
}

describe('ClassPanel', () => {
  afterEach(() => cleanup())

  it('lets a teacher create classes and shows their own classes with the code', async () => {
    auth.value = { isAdmin: false, isTeacher: true, user: { sub: 'teacher|1' } }
    server.use(http.get('/api/classes', () => HttpResponse.json([classRow({})])))
    renderPanel()
    expect(await screen.findByText('Klasa 1')).toBeTruthy()
    expect(screen.getByText('ABC234')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Nowa klasa/ })).toBeTruthy()
    expect(screen.queryByText('podgląd')).toBeNull()
  })

  it('shows every class to an admin, marks foreign ones read-only and offers no class creation', async () => {
    auth.value = { isAdmin: true, isTeacher: false, user: { sub: 'admin|1' } }
    let scope: string | null = null
    server.use(
      http.get('/api/classes', ({ request }) => {
        scope = new URL(request.url).searchParams.get('scope')
        return HttpResponse.json([classRow({}), classRow({ id: '00000000-0000-4000-8000-000000000002', name: 'Klasa 2', ownerId: 'teacher|2', ownerName: 'Jan Kos' })])
      }),
    )
    renderPanel()
    expect(await screen.findByText('Klasa 2')).toBeTruthy()
    expect(scope).toBe('all')
    expect(screen.getByText('Jan Kos')).toBeTruthy()
    expect(screen.getByText('teacher|2')).toBeTruthy()
    expect(screen.getAllByText('podgląd').length).toBe(2)
    expect(screen.queryByRole('button', { name: /Nowa klasa/ })).toBeNull()
    const row = screen.getByText('Klasa 1').closest('tr') as HTMLElement
    expect(within(row).queryByRole('button', { name: 'Archiwizuj' })).toBeNull()
    expect((within(row).getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })
})
