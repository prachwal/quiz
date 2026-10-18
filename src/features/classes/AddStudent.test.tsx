import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../settings/settingsSlice'
import feedbackReducer from '../feedback/feedbackSlice'
import { server } from '../../test/msw'
import { AddStudent } from './ClassParts'

function renderAdd() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer },
    middleware: (g) => g().concat(api.middleware),
  })
  render(
    <Provider store={store}>
      <ConfigProvider>
        <MemoryRouter>
          <AntdApp>
            <AddStudent cls={{ id: 'c1', joinCode: 'ABC234' }} />
          </AntdApp>
        </MemoryRouter>
      </ConfigProvider>
    </Provider>,
  )
  return screen.getByRole('combobox', { name: 'Wybór ucznia do dodania' })
}

describe('AddStudent', () => {
  afterEach(() => cleanup())

  it('filters candidates as you type and adds the chosen one', async () => {
    const queries: string[] = []
    let added: unknown = null
    server.use(
      http.get('/api/classes/c1/student-candidates', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? ''
        queries.push(q)
        return HttpResponse.json([{ userId: 'discord|1', name: 'Ala Kot', emailMasked: 'al***@x.pl' }])
      }),
      http.post('/api/classes/c1/members', async ({ request }) => {
        added = await request.json()
        return HttpResponse.json({ userId: 'discord|1', status: 'added' }, { status: 201 })
      }),
    )
    const box = renderAdd()
    fireEvent.mouseDown(box)
    fireEvent.change(box, { target: { value: 'al' } })
    expect(await screen.findByText('Wpisz co najmniej 3 znaki')).toBeTruthy()
    expect(queries).toEqual([])
    fireEvent.change(box, { target: { value: 'ala' } })
    expect(await screen.findByText('Ala Kot')).toBeTruthy()
    expect(screen.getByText('discord|1 · al***@x.pl')).toBeTruthy()
    expect(queries).toEqual(['ala'])
    fireEvent.click(screen.getByText('Ala Kot'))
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj ucznia' }))
    await waitFor(() => expect(added).toEqual({ userId: 'discord|1' }))
  })

  it('offers to add a pasted complete Auth0 id that was not found', async () => {
    server.use(http.get('/api/classes/c1/student-candidates', () => HttpResponse.json([])))
    const box = renderAdd()
    fireEvent.mouseDown(box)
    fireEvent.change(box, { target: { value: 'google-oauth2|12345' } })
    expect(await screen.findByText('Dodaj po identyfikatorze: google-oauth2|12345')).toBeTruthy()
  })

  it('shows class members as "already in class" and does not let you pick them', async () => {
    server.use(
      http.get('/api/classes/c1/student-candidates', () =>
        HttpResponse.json([{ userId: 'google-oauth2|101', name: 'zrachwal00', emailMasked: 'zr***@gmail.com', inClass: true }]),
      ),
    )
    const box = renderAdd()
    fireEvent.mouseDown(box)
    fireEvent.change(box, { target: { value: 'rach' } })
    expect(await screen.findByText('już w klasie')).toBeTruthy()
    const option = screen.getByText('zrachwal00').closest('.ant-select-item-option') as HTMLElement
    expect(option.className).toContain('ant-select-item-option-disabled')
  })

  it('accepts pasted oauth2|provider|id identifiers', async () => {
    server.use(http.get('/api/classes/c1/student-candidates', () => HttpResponse.json([])))
    const box = renderAdd()
    fireEvent.mouseDown(box)
    fireEvent.change(box, { target: { value: 'oauth2|discord|606581858758557699' } })
    expect(await screen.findByText('Dodaj po identyfikatorze: oauth2|discord|606581858758557699')).toBeTruthy()
  })
})
