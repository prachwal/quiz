import { Alert, Card, Flex, Select, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { errorMessage, useListAdminStudentsQuery } from '../../app/api'

/**
 * Admins pick any user of the app (not only class members) to see all of their results. Lists the most
 * recently active users and filters on the server as you type (name, e-mail or Auth0 id).
 */
export default function AdminStudentPicker({ value, onChange }: { value: string | null; onChange: (userId: string | null) => void }) {
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 250)
    return () => clearTimeout(timer)
  }, [typed])
  const { data, error, isFetching } = useListAdminStudentsQuery(q.length >= 2 ? { q } : undefined)

  const options = (data ?? []).map((u) => ({ value: u.userId, label: u.name ?? u.email ?? u.userId, user: u }))
  // keep the selected user visible even when the current search does not include them
  if (value && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: value, user: { userId: value, name: null, email: null, lastActiveDay: null, attempts: 0 } })
  }

  return (
    <Card size="small" style={{ marginBottom: 24 }}>
      <Flex vertical gap={8}>
        <Typography.Text strong>Czyje wyniki pokazać? (admin: wszyscy użytkownicy, wszystkie wyniki)</Typography.Text>
        <Select<string>
          showSearch
          allowClear
          value={value ?? undefined}
          searchValue={typed}
          onSearch={setTyped}
          onChange={(next) => onChange(next ?? null)}
          filterOption={false}
          loading={isFetching}
          options={options}
          placeholder="Moje wyniki (wpisz imię, e-mail lub identyfikator Auth0)"
          notFoundContent={isFetching ? 'Szukam…' : 'Nikogo nie znaleziono'}
          style={{ width: '100%', maxWidth: 560 }}
          aria-label="Wybór użytkownika"
          optionRender={(option) => {
            const u = (option.data as { user: { userId: string; email: string | null; lastActiveDay: string | null; attempts: number } }).user
            return (
              <Flex vertical>
                <span>{option.label}</span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {u.userId}
                  {u.email ? ` · ${u.email}` : ''} · podejść: {u.attempts} · aktywność: {u.lastActiveDay ?? '—'}
                </Typography.Text>
              </Flex>
            )
          }}
        />
        {error && <Alert type="error" showIcon title={errorMessage(error)} />}
      </Flex>
    </Card>
  )
}
