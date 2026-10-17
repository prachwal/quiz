import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Flex, Popconfirm, Segmented, Select, Skeleton, Tag, Typography, App as AntdApp } from 'antd'
import { useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { Link, useNavigate } from 'react-router-dom'
import {
  errorMessage,
  useDeleteQuizMutation,
  useGenerateIrregularVerbsQuizMutation,
  useListQuizzesQuery,
} from '../app/api'
import { DifficultyTag } from '../components/GroupTags'
import { difficultyOptions, popularityOptions } from '../components/groupOptions'
import { QUIZ_VARIANTS } from '../shared/quiz/schema'
import type { DifficultyCode, PopularityCode } from '../shared/quiz/types'

const VARIANT_LABELS: Record<(typeof QUIZ_VARIANTS)[number], string> = {
  mixed: 'Mieszany',
  typing: 'Wpisywanie',
  choice: 'Wybór odpowiedzi',
  translation: 'Tłumaczenie PL → EN',
}

export default function Home() {
  const [filterDifficulty, setFilterDifficulty] = useState<DifficultyCode | 'all'>('all')
  const [sort, setSort] = useState<'recent' | 'popular'>('recent')
  const { data, error, isLoading, refetch } = useListQuizzesQuery({
    difficulty: filterDifficulty === 'all' ? undefined : filterDifficulty,
    sort,
  })
  const [deleteQuiz, { isLoading: deleting }] = useDeleteQuizMutation()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState<DifficultyCode>()
  const [popularity, setPopularity] = useState<PopularityCode>()
  const [variant, setVariant] = useState<(typeof QUIZ_VARIANTS)[number]>('mixed')
  const [generate, { isLoading: generating }] = useGenerateIrregularVerbsQuizMutation()

  const draw = async () => {
    try {
      const quiz = await generate({ count, difficulty, popularity, variant }).unwrap()
      navigate(`/quizzes/${quiz.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteQuiz(id).unwrap()
      void message.success('Quiz usunięty')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <>
      <Flex justify="space-between" align="center" wrap gap="small">
        <Typography.Title style={{ margin: 0 }}>Quizy</Typography.Title>
        {isAdmin && (
          <Link to="/quizzes/new">
            <Button type="primary" icon={<PlusOutlined />}>
              Nowy quiz
            </Button>
          </Link>
        )}
      </Flex>

      <Card style={{ marginTop: 24 }}>
        <Flex vertical gap="middle">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Czasowniki nieregularne (B2) – losowy quiz
            </Typography.Title>
            <Typography.Text type="secondary">
              Wybierz grupę czasowników i wariant pytań. Wynik zapisuje się w historii.
            </Typography.Text>
          </div>
          <Flex gap="small" align="center" wrap>
            <Select
              allowClear
              placeholder="Trudność: wszystkie"
              options={difficultyOptions}
              value={difficulty}
              onChange={setDifficulty}
              style={{ width: 180 }}
            />
            <Select
              allowClear
              placeholder="Popularność: wszystkie"
              options={popularityOptions}
              value={popularity}
              onChange={setPopularity}
              style={{ width: 200 }}
            />
            <Select
              value={variant}
              onChange={setVariant}
              options={QUIZ_VARIANTS.map((value) => ({ value, label: VARIANT_LABELS[value] }))}
              style={{ width: 200 }}
            />
            <Segmented
              value={count}
              onChange={setCount}
              options={[
                { label: '10', value: 10 },
                { label: '20', value: 20 },
                { label: '30', value: 30 },
              ]}
            />
            <Button type="primary" loading={generating} onClick={() => void draw()}>
              Losuj quiz
            </Button>
          </Flex>
        </Flex>
      </Card>

      <Flex gap="small" wrap align="center" style={{ marginTop: 24 }}>
        <Segmented
          value={filterDifficulty}
          onChange={setFilterDifficulty}
          options={[{ label: 'Wszystkie', value: 'all' }, ...difficultyOptions]}
        />
        <Select
          value={sort}
          onChange={setSort}
          options={[
            { value: 'recent', label: 'Najnowsze' },
            { value: 'popular', label: 'Najpopularniejsze' },
          ]}
          style={{ width: 190 }}
        />
      </Flex>

      <div style={{ marginTop: 16 }}>
        {error ? (
          <Alert
            type="error"
            showIcon
            title="Nie udało się pobrać quizów"
            description={`${errorMessage(error)}. Sprawdź, czy działa \`netlify dev\` i czy migracje zostały zastosowane.`}
            action={<Button onClick={refetch}>Spróbuj ponownie</Button>}
          />
        ) : isLoading || !data ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : data.length === 0 ? (
          <Empty description="Nie ma jeszcze żadnych quizów">
            {isAdmin && (
              <Link to="/quizzes/new">
                <Button type="primary">Utwórz pierwszy quiz</Button>
              </Link>
            )}
          </Empty>
        ) : (
          <Flex vertical gap="middle">
            {data.map((quiz) => (
              <Card
                key={quiz.id}
                title={quiz.title}
                extra={
                  <Flex gap="small" wrap>
                    <DifficultyTag value={quiz.difficulty} />
                    <Tag>{quiz.questionCount} pytań</Tag>
                    <Tag>{quiz.totalPoints} pkt</Tag>
                    <Tag>{quiz.plays} podejść</Tag>
                  </Flex>
                }
                actions={[
                  <Link key="play" to={`/quizzes/${quiz.id}/play`}>
                    <PlayCircleOutlined /> Graj
                  </Link>,
                  ...(quiz.canEdit
                    ? [
                        <Link key="edit" to={`/quizzes/${quiz.id}/edit`}>
                          <EditOutlined /> Edytuj
                        </Link>,
                        <Popconfirm
                          key="delete"
                          title="Usunąć ten quiz?"
                          description="Tej operacji nie można cofnąć."
                          okText="Usuń"
                          cancelText="Anuluj"
                          okButtonProps={{ danger: true, loading: deleting }}
                          onConfirm={() => remove(quiz.id)}
                        >
                          <a style={{ color: '#ff4d4f' }}>
                            <DeleteOutlined /> Usuń
                          </a>
                        </Popconfirm>,
                      ]
                    : []),
                ]}
              >
                <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                  {quiz.description || 'Brak opisu'}
                </Typography.Paragraph>
              </Card>
            ))}
          </Flex>
        )}
      </div>
    </>
  )
}
