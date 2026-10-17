import { Alert, Card, Progress, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { errorMessage, useListAttemptsQuery } from '../app/api'
import type { AttemptSummary } from '../shared/quiz/types'

const columns: TableColumnsType<AttemptSummary> = [
  {
    title: 'Data',
    dataIndex: 'createdAt',
    render: (value: string) => new Date(value).toLocaleString('pl-PL'),
  },
  { title: 'Quiz', dataIndex: 'quizTitle' },
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
    render: (_v, a) => `${a.score} / ${a.maxScore}`,
  },
  {
    title: 'Wynik',
    dataIndex: 'percent',
    width: 200,
    render: (percent: number) => <Progress percent={percent} size="small" status={percent >= 50 ? 'success' : 'exception'} />,
  },
]

export default function Results() {
  const { data, error, isLoading } = useListAttemptsQuery()

  return (
    <>
      <Typography.Title>Historia wyników</Typography.Title>
      {error && <Alert type="error" showIcon title={errorMessage(error)} />}
      <Card>
        <Table<AttemptSummary>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Brak zapisanych wyników' }}
        />
      </Card>
    </>
  )
}
