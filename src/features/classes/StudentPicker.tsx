import { Alert, Card, Flex, Select, Typography } from 'antd'
import { useMemo } from 'react'
import { errorMessage, useListStudentsQuery } from '../../app/api'
import { useAuth } from '../auth/useAuth'
import { studentKey } from './studentKey'

/**
 * Teachers and admins can look at the results of a student instead of their own. Teachers pick from the
 * students of their classes, admins from everybody (read-only overview).
 */
export default function StudentPicker({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  const { isAdmin } = useAuth()
  const { data, error, isLoading } = useListStudentsQuery({ scope: isAdmin ? 'all' : 'own' })

  const options = useMemo(
    () =>
      (data ?? []).flatMap((s) =>
        s.classes.map((c) => ({
          value: studentKey(c.id, s.userId),
          label: `${s.name ?? s.email ?? s.userId} — ${c.name}`,
          // searchable by name, e-mail, Auth0 id and class
          search: `${s.name ?? ''} ${s.email ?? ''} ${s.userId} ${c.name}`.toLowerCase(),
          student: s,
        })),
      ),
    [data],
  )

  return (
    <Card size="small" style={{ marginBottom: 24 }}>
      <Flex vertical gap={8}>
        <Typography.Text strong>Czyje wyniki pokazać?</Typography.Text>
        <Select<string>
          showSearch
          allowClear
          value={value ?? undefined}
          loading={isLoading}
          placeholder="Moje wyniki (wybierz ucznia, aby zobaczyć jego)"
          notFoundContent="Brak uczniów w Twoich klasach"
          onChange={(next) => onChange(next ?? null)}
          filterOption={(input, option) => (option as { search?: string } | undefined)?.search?.includes(input.toLowerCase()) ?? false}
          options={options}
          style={{ width: '100%', maxWidth: 520 }}
          aria-label="Wybór ucznia"
          optionRender={(option) => {
            const s = (option.data as { student: { userId: string; email: string | null } }).student
            return (
              <Flex vertical>
                <span>{option.label}</span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {s.userId}
                  {s.email ? ` · ${s.email}` : ''}
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
