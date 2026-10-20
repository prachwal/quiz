import { BookOutlined, FieldTimeOutlined, FireOutlined, RiseOutlined, TrophyOutlined } from '@ant-design/icons'
import { Alert, Avatar, Card, Col, Empty, Flex, Row, Skeleton, Table, Tag, Typography, theme } from 'antd'
import type { TableColumnsType } from 'antd'
import { errorMessage } from '../../app/api'
import { useGetAdminStudentResultsQuery } from './api'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import StatCard from '../../components/StatCard'
import WeekStrip from '../progress/WeekStrip'
import AttemptsTable from '../results/AttemptsTable'
import type { AttemptRow } from '../results/AttemptsTable'
import { ScoreProgress } from '../results/Score'
import { useScoreColors } from '../results/useScoreColors'
import type { AdminStudentAttempt, WeakVerb } from '../../shared/quiz/types'

const KIND: Record<string, { label: string; color?: string }> = {
  manual: { label: 'Quiz' },
  'irregular-verbs': { label: 'Losowy quiz', color: 'blue' },
  review: { label: 'Powtórka', color: 'purple' },
  weak: { label: 'Trening błędów', color: 'magenta' },
}

const kindOf = (a: AdminStudentAttempt) => {
  if (a.courseId) return a.passed ? { label: 'Egzamin zaliczony', color: 'success' } : { label: 'Egzamin niezaliczony', color: 'error' }
  if (!a.source) return { label: 'Quiz usunięty' }
  return KIND[a.source] ?? { label: a.source }
}

const toRow = (a: AdminStudentAttempt): AttemptRow => {
  const kind = kindOf(a)
  return {
    id: a.id,
    title: a.title,
    createdAt: a.createdAt,
    percent: a.percent,
    score: a.score,
    maxScore: a.maxScore,
    kind: kind.label,
    kindTag: <Tag color={kind.color}>{kind.label}</Tag>,
    questions: a.questions,
  }
}

/** Admin-only: everything a user has done in the app - progress, weak verbs and every attempt with answers. */
export default function AdminStudentResultsView({ userId }: { userId: string }) {
  const { data, error, isLoading } = useGetAdminStudentResultsQuery(userId)
  const { token } = theme.useToken()
  const { textType } = useScoreColors()
  const phone = useMediaQuery(PHONE_QUERY)

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 8 }} />

  const who = data.name ?? data.email ?? data.userId
  const average = data.totals.averagePercent

  const weakColumns: TableColumnsType<WeakVerb> = [
    {
      title: 'Czasownik',
      key: 'verb',
      render: (_v, w) => (
        <Flex vertical>
          <Typography.Text strong>{[w.verb.base, w.verb.pastSimple[0], w.verb.pastParticiple[0]].join(' – ')}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {w.verb.meanings.slice(0, 2).join(', ')}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: 'Skuteczność',
      key: 'accuracy',
      width: phone ? 120 : 200,
      sorter: (a, b) => a.accuracy - b.accuracy,
      render: (_v, w) => <ScoreProgress percent={Math.round(w.accuracy * 100)} showInfo={!phone} />,
    },
    ...(phone ? [] : [{ title: 'Próby', dataIndex: 'attempts', width: 80, align: 'right' as const }]),
  ]

  return (
    <Flex vertical gap={24}>
      <Card>
        <Flex gap={16} align="center" wrap>
          <Avatar size={56} style={{ background: token.colorPrimary, flex: 'none', fontSize: 24 }}>
            {who[0]?.toUpperCase()}
          </Avatar>
          <Flex vertical style={{ minWidth: 0, flex: '1 1 240px' }}>
            <Typography.Title level={3} style={{ margin: 0 }} ellipsis>
              {who}
            </Typography.Title>
            <Typography.Text type="secondary" copyable={{ text: data.userId }} style={{ fontSize: 13 }}>
              {data.userId}
            </Typography.Text>
            {data.email && data.email !== who && (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {data.email}
              </Typography.Text>
            )}
          </Flex>
          <Flex vertical gap={6} style={{ flex: '1 1 200px' }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Klasy
            </Typography.Text>
            {data.classes.length ? (
              <Flex gap={6} wrap>
                {data.classes.map((c) => (
                  <Tag key={c.id} color="processing">
                    {c.name}
                    {c.ownerName ? ` · ${c.ownerName}` : ''}
                  </Tag>
                ))}
              </Flex>
            ) : (
              <Typography.Text type="secondary">nie należy do żadnej klasy</Typography.Text>
            )}
          </Flex>
        </Flex>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <StatCard label="Podejścia" value={data.totals.attempts} icon={<FieldTimeOutlined />} color={token.colorPrimary} />
        </Col>
        <Col xs={12} md={8} xl={5}>
          <StatCard
            label="Średni wynik"
            value={average === null ? '—' : <Typography.Text type={textType(average)} style={{ fontSize: 'inherit' }}>{average}%</Typography.Text>}
            icon={<RiseOutlined />}
            color={token.colorInfo}
          />
        </Col>
        <Col xs={12} md={8} xl={5}>
          <StatCard label="Zaliczone egzaminy" value={data.totals.passedExams} icon={<TrophyOutlined />} color={token.colorWarning} />
        </Col>
        <Col xs={12} md={12} xl={5}>
          <StatCard
            label="Seria (obecna / rekord)"
            value={`${data.progress.currentStreak} / ${data.progress.longestStreak}`}
            icon={<FireOutlined />}
            color={token.colorError}
          />
        </Col>
        <Col xs={24} md={12} xl={5}>
          <StatCard label="Ukończone lekcje" value={data.lessonsCompleted} icon={<BookOutlined />} color={token.colorSuccess} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="Aktywność – ostatnie 7 dni" style={{ height: '100%' }}>
            <Flex vertical gap={16}>
              <WeekStrip summary={data.progress} />
              <Typography.Text type="secondary">
                Dziś {data.progress.today.answered} z {data.progress.dailyGoal} odpowiedzi celu dziennego ({data.progress.today.correct} poprawnych).
                W tygodniu: {data.progress.last7.reduce((s, d) => s + d.answered, 0)} odpowiedzi,{' '}
                {data.progress.last7.filter((d) => d.answered > 0 || d.lessons > 0).length} aktywnych dni.
              </Typography.Text>
            </Flex>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            title={`Najsłabsze czasowniki (${data.weakVerbs.length})`}
            styles={{ body: { padding: data.weakVerbs.length ? 0 : undefined } }}
            style={{ height: '100%' }}
          >
            {data.weakVerbs.length === 0 ? (
              <Flex vertical align="center" justify="center" style={{ height: '100%', minHeight: 120 }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Brak słabych czasowników – za mało prób albo wszystko idzie dobrze"
                  style={{ margin: 0 }}
                />
              </Flex>
            ) : (
            <Table<WeakVerb>
              rowKey={(w) => String(w.verb.id)}
              columns={weakColumns}
              dataSource={data.weakVerbs}
              pagination={data.weakVerbs.length > 5 ? { pageSize: 5, size: 'small', showSizeChanger: false } : false}
              size="small"
            />
            )}
          </Card>
        </Col>
      </Row>

      <Card title={`Wszystkie podejścia (${data.attempts.length})`} styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
        <AttemptsTable rows={data.attempts.map(toRow)} emptyText="Ten użytkownik nie rozwiązał jeszcze żadnego quizu" />
      </Card>
    </Flex>
  )
}
