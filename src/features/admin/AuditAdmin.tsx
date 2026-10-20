import { Alert, Flex, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { errorMessage } from '../../app/api'
import { useListAuditQuery } from './api'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import type { AuditEntry } from '../../shared/quiz/types'

const ACTIONS: Record<AuditEntry['action'], string> = {
  'roles.update': 'Zmiana ról',
  'user.block': 'Blokada konta',
  'user.unblock': 'Odblokowanie konta',
  'feedback.status': 'Status uwagi',
  'mcp.call': 'Zmiana przez MCP',
  'settings.update': 'Ustawienia aplikacji',
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })

const describe = (entry: AuditEntry) => {
  const d = entry.details as { from?: string[]; to?: string[]; status?: string }
  if (entry.action === 'roles.update') return `${(d.from ?? []).join(', ') || '—'} → ${(d.to ?? []).join(', ') || '—'}`
  if (entry.action === 'feedback.status') return `status: ${d.status}`
  if (entry.action === 'mcp.call' || entry.action === 'settings.update') return JSON.stringify(entry.details)
  return ''
}

export default function AuditAdmin() {
  const { data, error, isFetching } = useListAuditQuery()
  const phone = useMediaQuery(PHONE_QUERY)

  const columns: TableColumnsType<AuditEntry> = [
    { title: 'Kiedy', dataIndex: 'createdAt', render: formatDate },
    { title: 'Kto', dataIndex: 'actorLabel', render: (v: string | null, e) => v ?? e.actorId },
    { title: 'Akcja', dataIndex: 'action', render: (a: AuditEntry['action']) => <Tag>{ACTIONS[a]}</Tag> },
    { title: 'Dotyczy', dataIndex: 'targetLabel', render: (v: string | null, e) => v ?? e.targetId ?? '—' },
    { title: 'Szczegóły', key: 'details', render: (_v, e) => describe(e) },
  ]

  const phoneColumns: TableColumnsType<AuditEntry> = [
    {
      key: 'entry',
      render: (_v, e) => (
        <Flex vertical gap={4}>
          <Flex gap={8} wrap align="center">
            <Tag style={{ marginInlineEnd: 0 }}>{ACTIONS[e.action]}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {formatDate(e.createdAt)}
            </Typography.Text>
          </Flex>
          <Typography.Text>
            {e.actorLabel ?? e.actorId} → {e.targetLabel ?? e.targetId ?? '—'}
          </Typography.Text>
          {describe(e) && <Typography.Text type="secondary">{describe(e)}</Typography.Text>}
        </Flex>
      ),
    },
  ]

  return (
    <Flex vertical gap="middle">
      {error && <Alert type="error" showIcon title={errorMessage(error)} />}
      <Table<AuditEntry>
        rowKey="id"
        loading={isFetching}
        columns={phone ? phoneColumns : columns}
        showHeader={!phone}
        dataSource={data}
        scroll={phone ? undefined : { x: 'max-content' }}
        pagination={{ pageSize: 15, showSizeChanger: false, simple: phone }}
        locale={{ emptyText: 'Brak wpisów' }}
      />
    </Flex>
  )
}
