import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { App as AntdApp, ConfigProvider, Tag } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { http, HttpResponse } from 'msw'
import { api } from '../../app/api'
import settingsReducer from '../settings/settingsSlice'
import feedbackReducer from '../feedback/feedbackSlice'
import { server } from '../../test/msw'
import AttemptsTable from './AttemptsTable'
import type { AttemptRow } from './AttemptsTable'

const rows: AttemptRow[] = Array.from({ length: 12 }, (_, i) => ({
  id: `a${i}`,
  title: `Quiz ${String(i).padStart(2, '0')}`,
  createdAt: `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
  percent: [10, 55, 90][i % 3],
  score: i,
  maxScore: 12,
  kind: i % 2 ? 'Powtórka' : 'Quiz',
  kindTag: <Tag>{i % 2 ? 'Powtórka' : 'Quiz'}</Tag>,
}))

function renderTable() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer },
    middleware: (g) => g().concat(api.middleware),
  })
  render(
    <Provider store={store}>
      <ConfigProvider>
        <AntdApp>
          <AttemptsTable rows={rows} />
        </AntdApp>
      </ConfigProvider>
    </Provider>,
  )
}

const titles = () => [...document.querySelectorAll('.ant-table-tbody tr.ant-table-row')].map((r) => r.querySelector('strong')?.textContent)

describe('AttemptsTable', () => {
  afterEach(() => cleanup())

  it('paginates (10 per page) newest first and sorts by score', async () => {
    server.use(http.get('/api/settings/app', () => HttpResponse.json({ scoreThresholds: { low: 50, high: 80 } })))
    renderTable()
    expect(titles()).toHaveLength(10)
    expect(titles()[0]).toBe('Quiz 11')
    expect(screen.getByText('1–10 z 12')).toBeTruthy()
    fireEvent.click(screen.getByRole('columnheader', { name: 'Wynik' }))
    expect(titles()[0]).toMatch(/Quiz/)
    const firstRow = document.querySelector('.ant-table-tbody tr.ant-table-row') as HTMLElement
    expect(within(firstRow).getByText('10%')).toBeTruthy()
  })

  it('colours scores by the global thresholds', async () => {
    server.use(http.get('/api/settings/app', () => HttpResponse.json({ scoreThresholds: { low: 60, high: 95 } })))
    renderTable()
    // 55% is red with low=60, 90% orange with high=95 (stroke colours come from the theme tokens)
    await screen.findAllByText('55%')
    const bar = (p: string) => (screen.getAllByText(p)[0].closest('.ant-progress') as HTMLElement).querySelector('.ant-progress-bg, .ant-progress-track') as HTMLElement
    await new Promise((r) => setTimeout(r, 50))
    expect(bar('55%').style.background || bar('55%').style.backgroundColor).not.toBe(bar('90%').style.background || bar('90%').style.backgroundColor)
  })
})
