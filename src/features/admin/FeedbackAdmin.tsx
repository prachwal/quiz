import { Alert, Card, Empty, Flex, Segmented, Select, Skeleton, Tag, Typography, App as AntdApp } from 'antd'
import { useState } from 'react'
import { errorMessage } from '../../app/api'
import { useListAdminFeedbackQuery, useSetFeedbackStatusMutation } from './api'
import type { FeedbackItem, FeedbackKind, FeedbackStatus } from '../../shared/quiz/types'

const KIND: Record<FeedbackKind, { label: string; color: string }> = {
  bug: { label: 'Błąd', color: 'red' },
  idea: { label: 'Pomysł', color: 'blue' },
  other: { label: 'Inne', color: 'default' },
}

const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: 'new', label: 'Nowe' },
  { value: 'in_progress', label: 'W toku' },
  { value: 'done', label: 'Zrobione' },
]

const formatDate = (value: string) =>
  new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })

function Item({ item }: { item: FeedbackItem }) {
  const [setStatus, { isLoading }] = useSetFeedbackStatusMutation()
  const { message } = AntdApp.useApp()
  const c = item.context

  const change = async (status: FeedbackStatus) => {
    try {
      await setStatus({ id: item.id, status }).unwrap()
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <Card size="small">
      <Flex vertical gap={10}>
        <Flex justify="space-between" align="flex-start" wrap gap={8}>
          <Flex gap={6} wrap align="center">
            <Tag color={KIND[item.kind].color}>{KIND[item.kind].label}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {item.userLabel ?? item.userId} · {formatDate(item.createdAt)}
            </Typography.Text>
          </Flex>
          <Select<FeedbackStatus>
            value={item.status}
            options={STATUS_OPTIONS}
            loading={isLoading}
            onChange={change}
            style={{ minWidth: 140 }}
            aria-label="Status zgłoszenia"
          />
        </Flex>
        <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 16 }}>
          {item.message}
        </Typography.Paragraph>
        <Typography.Text type="secondary" style={{ fontSize: 13, wordBreak: 'break-word' }}>
          {[
            c.route && `strona: ${c.route}`,
            c.appVersion && `wersja: ${c.appVersion}`,
            c.viewport && `ekran: ${c.viewport}`,
            c.sentryEventId && `sentry: ${c.sentryEventId}`,
            c.requestId && `request: ${c.requestId}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography.Text>
        {c.userAgent && (
          <Typography.Text type="secondary" ellipsis={{ tooltip: c.userAgent }} style={{ fontSize: 12 }}>
            {c.userAgent}
          </Typography.Text>
        )}
      </Flex>
    </Card>
  )
}

export default function FeedbackAdmin() {
  const [status, setStatusFilter] = useState<FeedbackStatus | 'all'>('new')
  const { data, error, isLoading } = useListAdminFeedbackQuery(status === 'all' ? undefined : status)

  return (
    <Flex vertical gap="middle">
      <Segmented
        value={status}
        onChange={setStatusFilter}
        options={[{ value: 'all', label: 'Wszystkie' }, ...STATUS_OPTIONS]}
        style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}
      />
      {error ? (
        <Alert type="error" showIcon title={errorMessage(error)} />
      ) : isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : data.length === 0 ? (
        <Empty description="Brak zgłoszeń w tym widoku" />
      ) : (
        data.map((item) => <Item key={item.id} item={item} />)
      )}
    </Flex>
  )
}
