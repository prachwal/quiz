import { FieldTimeOutlined, RiseOutlined, TrophyOutlined } from '@ant-design/icons'
import { Alert, Card, Col, Empty, Flex, Progress, Row, Table, Tag, Typography, theme } from 'antd'
import type { TableColumnsType } from 'antd'
import type { ReactNode } from 'react'
import { errorMessage, useListAttemptsQuery } from '../app/api'
import PageHeader from '../components/PageHeader'
import type { AttemptSummary } from '../shared/quiz/types'

const columns: TableColumnsType<AttemptSummary> = [
  {
    title: 'Data',
    dataIndex: 'createdAt',
    render: (value: string) => (
      <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
        {new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })}
      </Typography.Text>
    ),
  },
  { title: 'Quiz', dataIndex: 'quizTitle', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  {
    title: 'Typ',
    key: 'type',
    render: (_v, a) =>
      a.courseId ? (
        <Tag color={a.passed ? 'success' : 'error'}>{a.passed ? 'Egzamin: zaliczony' : 'Egzamin: niezaliczony'}</Tag>
      ) : (
        <Tag>Quiz</Tag>
      ),
  },
  {
    title: 'Punkty',
    key: 'points',
    render: (_v, a) => <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{a.score} / {a.maxScore}</span>,
  },
  {
    title: 'Wynik',
    dataIndex: 'percent',
    width: 200,
    render: (percent: number) => <Progress percent={percent} size="small" status={percent >= 50 ? 'success' : 'exception'} />,
  },
]

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: ReactNode; color: string }) {
  const { token } = theme.useToken()
  return (
    <Card styles={{ body: { padding: 20 } }} style={{ height: '100%' }}>
      <Flex align="center" gap={16}>
        <span
          aria-hidden
          style={{
            flex: 'none',
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 12,
            fontSize: 20,
            color,
            background: token.colorFillQuaternary,
          }}
        >
          {icon}
        </span>
        <Flex vertical>
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            {label}
          </Typography.Text>
          <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{value}</span>
        </Flex>
      </Flex>
    </Card>
  )
}

export default function Results() {
  const { data, error, isLoading } = useListAttemptsQuery()
  const { token } = theme.useToken()
  const average = data?.length ? Math.round(data.reduce((sum, a) => sum + a.percent, 0) / data.length) : null
  const passedExams = data?.filter((a) => a.courseId && a.passed).length ?? 0

  return (
    <>
      <PageHeader title="Historia wyników" subtitle="Wszystkie Twoje podejścia do quizów i egzaminów." />
      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      {data && data.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <StatCard label="Podejścia" value={data.length} icon={<FieldTimeOutlined />} color={token.colorPrimary} />
          </Col>
          <Col xs={24} sm={8}>
            <StatCard label="Średni wynik" value={`${average}%`} icon={<RiseOutlined />} color={token.colorInfo} />
          </Col>
          <Col xs={24} sm={8}>
            <StatCard label="Zaliczone egzaminy" value={passedExams} icon={<TrophyOutlined />} color={token.colorWarning} />
          </Col>
        </Row>
      )}
      <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
        <Table<AttemptSummary>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data}
          pagination={{ pageSize: 15, showSizeChanger: false, style: { paddingInline: 16 } }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="Brak zapisanych wyników" style={{ paddingBlock: 24 }} /> }}
        />
      </Card>
    </>
  )
}
