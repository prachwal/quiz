import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import { Alert, Card, Collapse, Descriptions, Empty, Flex, Skeleton, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { errorMessage, useGetStudentResultsQuery } from '../../app/api'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import type { StudentAssignmentProgress, StudentAttempt } from '../../shared/quiz/types'
import { formatDue } from './formatDue'
import { StatusTag } from './statusTags'

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })

export function AttemptDetails({ attempt }: { attempt: Pick<StudentAttempt, 'questions'> }) {
  return (
    <Flex vertical gap={10}>
      {attempt.questions.map((q, i) => (
        <Flex key={q.questionId} gap={10} align="flex-start">
          {q.correct ? (
            <CheckCircleFilled style={{ color: 'var(--ant-color-success, #52c41a)', marginTop: 4 }} aria-label="poprawnie" />
          ) : (
            <CloseCircleFilled style={{ color: 'var(--ant-color-error, #ff4d4f)', marginTop: 4 }} aria-label="błędnie" />
          )}
          <Flex vertical style={{ minWidth: 0 }}>
            <Typography.Text strong>
              {i + 1}. {q.prompt ?? 'Pytanie usunięte z quizu'}
            </Typography.Text>
            <Typography.Text type="secondary">
              Odpowiedź ucznia: {q.answer.trim() ? q.answer : <em>brak</em>}
            </Typography.Text>
            {!q.correct && q.correctAnswers.length > 0 && (
              <Typography.Text type="secondary">Poprawnie: {q.correctAnswers.slice(0, 3).join(' / ')}</Typography.Text>
            )}
          </Flex>
        </Flex>
      ))}
    </Flex>
  )
}

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

        <Card size="small" title={`Podejścia (${data.attempts.length})`}>
          {data.attempts.length === 0 ? (
            <Empty description="Uczeń nie rozwiązał jeszcze żadnego zadania z tej klasy" />
          ) : (
            <Collapse
              items={data.attempts.map((a) => ({
                key: a.id,
                label: (
                  <Flex gap={8} wrap align="center">
                    <Typography.Text strong>{a.title}</Typography.Text>
                    <Tag color={a.percent >= 50 ? 'success' : 'warning'}>{a.percent}%</Tag>
                    {a.passed !== null && <Tag color={a.passed ? 'success' : 'error'}>{a.passed ? 'zaliczony' : 'niezaliczony'}</Tag>}
                    <Typography.Text type="secondary">{formatDateTime(a.createdAt)}</Typography.Text>
                  </Flex>
                ),
                children: <AttemptDetails attempt={a} />,
              }))}
            />
          )}
        </Card>
      </Flex>
    </>
  )
}
