import { ProfileOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useListMyAssignmentsQuery } from '../../app/api'
import { formatDue } from './formatDue'

/** Home: reminder about open assignments from the teacher (hidden when there is nothing to do). */
export default function AssignmentsHint() {
  const { data } = useListMyAssignmentsQuery()
  const open = (data ?? []).filter((a) => a.status !== 'done')
  if (open.length === 0) return null
  const overdue = open.filter((a) => a.overdue).length
  const next = open.find((a) => a.dueAt) ?? open[0]
  return (
    <Card styles={{ body: { padding: 'clamp(16px, 3vw, 22px)' } }}>
      <Flex justify="space-between" align="center" wrap gap="middle">
        <Flex align="center" gap={14} style={{ minWidth: 0 }}>
          <ProfileOutlined style={{ fontSize: 26 }} />
          <Flex vertical>
            <Typography.Text strong style={{ fontSize: 17 }}>
              Zadania od nauczyciela: {open.length}
              {overdue > 0 ? ` (po terminie: ${overdue})` : ''}
            </Typography.Text>
            <Typography.Text type="secondary">
              Najbliższe: {next.title} · {formatDue(next.dueAt)}
            </Typography.Text>
          </Flex>
        </Flex>
        <Link to="/assignments">
          <Button type="primary">Zobacz zadania</Button>
        </Link>
      </Flex>
    </Card>
  )
}
