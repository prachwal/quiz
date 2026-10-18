import { FieldTimeOutlined, RiseOutlined, TrophyOutlined } from '@ant-design/icons'
import { Alert, Card, Col, Empty, Flex, Progress, Row, Table, Tag, Typography, theme } from 'antd'
import type { TableColumnsType } from 'antd'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage, useListAttemptsQuery } from '../app/api'
import { PHONE_QUERY, useMediaQuery } from '../app/useMediaQuery'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../features/auth/useAuth'
import StudentPicker from '../features/classes/StudentPicker'
import { parseStudentKey } from '../features/classes/studentKey'
import StudentResultsView from '../features/classes/StudentResultsView'
import DailyGoalCard from '../features/progress/DailyGoalCard'
import WeakVerbs from '../features/progress/WeakVerbs'
import type { AttemptSummary } from '../shared/quiz/types'

const formatDate = (value: string) =>
  new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })

const typeTag = (a: AttemptSummary) =>
  a.courseId ? (
    <Tag color={a.passed ? 'success' : 'error'}>{a.passed ? 'Egzamin: zaliczony' : 'Egzamin: niezaliczony'}</Tag>
  ) : (
    <Tag>Quiz</Tag>
  )

const columns: TableColumnsType<AttemptSummary> = [
  {
    title: 'Data',
    dataIndex: 'createdAt',
    render: (value: string) => (
      <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
        {formatDate(value)}
      </Typography.Text>
    ),
  },
  { title: 'Quiz', dataIndex: 'quizTitle', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  {
    title: 'Typ',
    key: 'type',
    render: (_v, a) => typeTag(a),
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

/** Phones: one card-like row per attempt instead of a five-column table. */
const phoneColumns: TableColumnsType<AttemptSummary> = [
  {
    key: 'attempt',
    render: (_v, a) => (
      <Flex vertical gap={6}>
        <Flex justify="space-between" align="flex-start" gap={12}>
          <Typography.Text strong style={{ fontSize: 16, minWidth: 0, wordBreak: 'break-word' }}>
            {a.quizTitle}
          </Typography.Text>
          <Typography.Text
            strong
            type={a.percent >= 50 ? 'success' : 'danger'}
            style={{ flex: 'none', fontSize: 18, fontVariantNumeric: 'tabular-nums' }}
          >
            {a.percent}%
          </Typography.Text>
        </Flex>
        <Progress
          percent={a.percent}
          showInfo={false}
          size="small"
          status={a.percent >= 50 ? 'success' : 'exception'}
          style={{ margin: 0 }}
        />
        <Flex wrap gap={6} align="center">
          {typeTag(a)}
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            {a.score} / {a.maxScore} pkt · {formatDate(a.createdAt)}
          </Typography.Text>
        </Flex>
      </Flex>
    ),
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
  const { isTeacher, isAdmin } = useAuth()
  // ?student=<classId>::<auth0 id> shows a student's results (teachers and admins), the link can be shared
  const [params, setParams] = useSearchParams()
  const picked = isTeacher || isAdmin ? params.get('student') : null
  const choose = (key: string | null) => setParams(key ? { student: key } : {}, { replace: true })

  if (picked) {
    const { classId, userId } = parseStudentKey(picked)
    return (
      <>
        <PageHeader title="Wyniki ucznia" subtitle="Podgląd wyników z zadań przydzielonych w klasie." />
        <StudentPicker value={picked} onChange={choose} />
        <StudentResultsView classId={classId} userId={userId} />
      </>
    )
  }
  return <OwnResults picker={isTeacher || isAdmin ? <StudentPicker value={null} onChange={choose} /> : null} />
}

function OwnResults({ picker }: { picker: ReactNode }) {
  const { data, error, isLoading } = useListAttemptsQuery()
  const { token } = theme.useToken()
  const phone = useMediaQuery(PHONE_QUERY)
  const average = data?.length ? Math.round(data.reduce((sum, a) => sum + a.percent, 0) / data.length) : null
  const passedExams = data?.filter((a) => a.courseId && a.passed).length ?? 0

  return (
    <>
      <PageHeader title="Historia wyników" subtitle="Wszystkie Twoje podejścia do quizów i egzaminów." />
      {picker}
      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      <div style={{ marginBottom: 24 }}>
        <DailyGoalCard />
      </div>
      <div style={{ marginBottom: 24 }}>
        <WeakVerbs />
      </div>
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
          columns={phone ? phoneColumns : columns}
          showHeader={!phone}
          className={phone ? 'card-rows' : undefined}
          dataSource={data}
          pagination={{
            pageSize: 15,
            showSizeChanger: false,
            simple: phone ? { readOnly: true } : false,
            style: { paddingInline: 16 },
          }}
          scroll={phone ? undefined : { x: 'max-content' }}
          locale={{ emptyText: <Empty description="Brak zapisanych wyników" style={{ paddingBlock: 24 }} /> }}
        />
      </Card>
    </>
  )
}
