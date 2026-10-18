import { Alert, Card, Descriptions, Empty, Flex, Skeleton, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { errorMessage, useGetStudentResultsQuery } from '../../app/api'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import type { StudentAssignmentProgress } from '../../shared/quiz/types'
import AttemptsTable from '../results/AttemptsTable'
import { formatDue } from './formatDue'
import { StatusTag } from './statusTags'

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })

export default function StudentResultsView({ classId, userId }: { classId: string; userId: string }) {
  const { data, error, isLoading } = useGetStudentResultsQuery({ classId, userId })
  const phone = useMediaQuery(PHONE_QUERY)

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 6 }} />

  const columns: TableColumnsType<StudentAssignmentProgress> = [
    { title: 'Zadanie', dataIndex: 'title', render: (v: string, a) => <><Tag>{a.kind === 'course' ? 'kurs' : 'quiz'}</Tag>{v}</> },
    { title: 'Termin', dataIndex: 'dueAt', render: (v: string | null) => formatDue(v) },
    { title: 'Status', dataIndex: 'status', render: (_v, a) => <StatusTag status={a.status} /> },
    { title: 'Postęp', dataIndex: 'detail' },
  ]
  const phoneColumns: TableColumnsType<StudentAssignmentProgress> = [
    {
      key: 'card',
      render: (_v, a) => (
        <Flex vertical gap={4}>
          <Typography.Text strong>{a.title}</Typography.Text>
          <Typography.Text type="secondary">termin: {formatDue(a.dueAt)}</Typography.Text>
          <Flex gap={6} align="center" wrap>
            <StatusTag status={a.status} />
            <Typography.Text type="secondary">{a.detail}</Typography.Text>
          </Flex>
        </Flex>
      ),
    },
  ]

  return (
    <>
      <Flex vertical gap={16}>
        <Card size="small">
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, md: 4 }}
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
                  </Flex>
                ),
              },
              { key: 'joined', label: 'W klasie od', children: formatDateTime(data.joinedAt) },
              { key: 'lessons', label: 'Ukończone lekcje', children: data.lessonsCompleted },
              { key: 'last', label: 'Ostatnio aktywny', children: data.lastActiveDay ?? '—' },
              { key: 'weak', label: 'Słabe czasowniki', children: data.weakVerbs },
            ]}
          />
        </Card>

        <Card size="small" title="Zadania klasy">
          <Table<StudentAssignmentProgress>
            rowKey="assignmentId"
            columns={phone ? phoneColumns : columns}
            showHeader={!phone}
            dataSource={data.assignments}
            pagination={false}
            locale={{ emptyText: 'Klasa nie ma jeszcze zadań' }}
          />
        </Card>

        <Card size="small" title={`Podejścia (${data.attempts.length})`} styles={{ body: { padding: data.attempts.length ? 0 : undefined } }}>
          {data.attempts.length === 0 ? (
            <Empty description="Uczeń nie rozwiązał jeszcze żadnego zadania z tej klasy" />
          ) : (
            <AttemptsTable
              rows={data.attempts.map((a) => ({
                id: a.id,
                title: a.title,
                createdAt: a.createdAt,
                percent: a.percent,
                score: a.score,
                maxScore: a.maxScore,
                kind: a.passed === null ? 'Quiz' : 'Egzamin',
                kindTag:
                  a.passed === null ? <Tag>Quiz</Tag> : <Tag color={a.passed ? 'success' : 'error'}>{a.passed ? 'Egzamin zaliczony' : 'Egzamin niezaliczony'}</Tag>,
                questions: a.questions,
              }))}
            />
          )}
        </Card>
      </Flex>
    </>
  )
}
