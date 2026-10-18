import { Alert, Card, Collapse, Descriptions, Empty, Flex, Progress, Skeleton, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { errorMessage, useGetAdminStudentResultsQuery } from '../../app/api'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import type { AdminStudentAttempt, WeakVerb } from '../../shared/quiz/types'
import { AttemptDetails } from '../classes/StudentResultsView'

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })

const SOURCE_LABELS: Record<string, string> = {
  manual: 'quiz',
  'irregular-verbs': 'losowy quiz',
  review: 'powtórka',
  weak: 'trening błędów',
  'course-exam': 'egzamin kursu',
}

const sourceTag = (a: Pick<AdminStudentAttempt, 'source' | 'passed' | 'courseId'>) => {
  if (a.courseId) return <Tag color={a.passed ? 'success' : 'error'}>{a.passed ? 'egzamin: zaliczony' : 'egzamin: niezaliczony'}</Tag>
  return <Tag>{a.source ? (SOURCE_LABELS[a.source] ?? a.source) : 'quiz usunięty'}</Tag>
}

/** Admin-only: everything a user has done in the app - progress, weak verbs and every attempt with answers. */
export default function AdminStudentResultsView({ userId }: { userId: string }) {
  const { data, error, isLoading } = useGetAdminStudentResultsQuery(userId)
  const phone = useMediaQuery(PHONE_QUERY)

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 6 }} />

  const weakColumns: TableColumnsType<WeakVerb> = [
    { title: 'Czasownik', key: 'verb', render: (_v, w) => <Typography.Text strong>{[w.verb.base, w.verb.pastSimple[0], w.verb.pastParticiple[0]].join(' – ')}</Typography.Text> },
    { title: 'Znaczenie', key: 'meaning', render: (_v, w) => w.verb.meanings.slice(0, 2).join(', ') },
    { title: 'Skuteczność', key: 'accuracy', width: 180, render: (_v, w) => <Progress percent={Math.round(w.accuracy * 100)} size="small" status="exception" /> },
    { title: 'Próby', dataIndex: 'attempts', width: 80, align: 'right' },
  ]

  return (
    <Flex vertical gap={16}>
      <Card size="small">
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2, md: 3 }}
          items={[
            {
              key: 'who',
              label: 'Uczeń',
              children: (
                <Flex vertical>
                  <Typography.Text strong>{data.name ?? data.email ?? data.userId}</Typography.Text>
                  <Typography.Text type="secondary" copyable={{ text: data.userId }} style={{ fontSize: 12 }}>
                    {data.userId}
                  </Typography.Text>
                  {data.email && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{data.email}</Typography.Text>}
                </Flex>
              ),
            },
            {
              key: 'classes',
              label: 'Klasy',
              children: data.classes.length ? (
                <Flex gap={4} wrap>
                  {data.classes.map((c) => (
                    <Tag key={c.id}>
                      {c.name}
                      {c.ownerName ? ` (${c.ownerName})` : ''}
                    </Tag>
                  ))}
                </Flex>
              ) : (
                '—'
              ),
            },
            { key: 'attempts', label: 'Podejścia', children: data.totals.attempts },
            { key: 'avg', label: 'Średni wynik', children: data.totals.averagePercent === null ? '—' : `${data.totals.averagePercent}%` },
            { key: 'exams', label: 'Zaliczone egzaminy', children: data.totals.passedExams },
            { key: 'lessons', label: 'Ukończone lekcje', children: data.lessonsCompleted },
            { key: 'streak', label: 'Seria (obecna / najdłuższa)', children: `${data.progress.currentStreak} / ${data.progress.longestStreak} dni` },
            {
              key: 'today',
              label: 'Dziś',
              children: `${data.progress.today.answered} / ${data.progress.dailyGoal} odpowiedzi (${data.progress.today.correct} poprawnych)`,
            },
            {
              key: 'week',
              label: 'Ostatnie 7 dni',
              children: `${data.progress.last7.reduce((s, d) => s + d.answered, 0)} odpowiedzi, ${data.progress.last7.filter((d) => d.answered > 0 || d.lessons > 0).length} aktywnych dni`,
            },
          ]}
        />
      </Card>

      <Card size="small" title={`Najsłabsze czasowniki (${data.weakVerbs.length})`}>
        <Table<WeakVerb>
          rowKey={(w) => String(w.verb.id)}
          columns={phone ? weakColumns.slice(0, 1).concat(weakColumns.slice(2, 3)) : weakColumns}
          dataSource={data.weakVerbs}
          pagination={false}
          size="small"
          locale={{ emptyText: 'Brak słabych czasowników' }}
        />
      </Card>

      <Card size="small" title={`Wszystkie podejścia (${data.attempts.length})`}>
        {data.attempts.length === 0 ? (
          <Empty description="Ten użytkownik nie rozwiązał jeszcze żadnego quizu" />
        ) : (
          <Collapse
            items={data.attempts.map((a) => ({
              key: a.id,
              label: (
                <Flex gap={8} wrap align="center">
                  <Typography.Text strong>{a.title}</Typography.Text>
                  {sourceTag(a)}
                  <Tag color={a.percent >= 50 ? 'success' : 'warning'}>
                    {a.percent}% ({a.score}/{a.maxScore})
                  </Tag>
                  <Typography.Text type="secondary">{formatDateTime(a.createdAt)}</Typography.Text>
                </Flex>
              ),
              children: <AttemptDetails attempt={a} />,
            }))}
          />
        )}
      </Card>
    </Flex>
  )
}
