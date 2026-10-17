import {
  DeleteOutlined,
  EditOutlined,
  FireOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ThunderboltFilled,
  TrophyOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Empty, Flex, Popconfirm, Segmented, Select, Skeleton, Switch, Tag, Typography, App as AntdApp, theme } from 'antd'
import { useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { Link, useNavigate } from 'react-router-dom'
import {
  errorMessage,
  useDeleteQuizMutation,
  useGenerateIrregularVerbsQuizMutation,
  useGetWeakVerbsQuery,
  useListQuizzesQuery,
} from '../app/api'
import { DifficultyTag } from '../components/GroupTags'
import { difficultyOptions, popularityOptions } from '../components/groupOptions'
import PageHeader from '../components/PageHeader'
import DailyGoalCard from '../features/progress/DailyGoalCard'
import AssignmentsHint from '../features/classes/AssignmentsHint'
import ReviewCard from '../features/progress/ReviewCard'
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
  const { token } = theme.useToken()
  const [count, setCount] = useState(10)
  const [onlyWeak, setOnlyWeak] = useState(false)
  const { data: weakVerbs } = useGetWeakVerbsQuery()
  const [difficulty, setDifficulty] = useState<DifficultyCode>()
  const [popularity, setPopularity] = useState<PopularityCode>()
  const [variant, setVariant] = useState<(typeof QUIZ_VARIANTS)[number]>('mixed')
  const [generate, { isLoading: generating }] = useGenerateIrregularVerbsQuizMutation()

  const draw = async () => {
    try {
      const quiz = await generate({ count, difficulty, popularity, variant, onlyWeak }).unwrap()
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

  const label = (text: string) => (
    <Typography.Text style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: token.colorTextSecondary }}>
      {text}
    </Typography.Text>
  )

  return (
    <>
      <PageHeader
        eyebrow="Angielski · czasowniki nieregularne"
        title="Quizy"
        subtitle="Wylosuj świeży zestaw pytań albo wybierz jeden z gotowych quizów. Każdy wynik trafia do historii."
        extra={
          isAdmin && (
            <Link to="/quizzes/new">
              <Button type="primary" size="large" icon={<PlusOutlined />}>
                Nowy quiz
              </Button>
            </Link>
          )
        }
      />

      <Flex vertical gap={16} style={{ marginBottom: 'var(--app-gap, 24px)' }}>
        <AssignmentsHint />
        <DailyGoalCard />
        <ReviewCard />
      </Flex>

      <Card
        styles={{ body: { padding: 0 } }}
        style={{
          overflow: 'hidden',
          borderColor: token.colorPrimaryBorder,
          background: `radial-gradient(120% 140% at 0% 0%, ${token.colorPrimaryBg} 0%, ${token.colorBgContainer} 60%)`,
        }}
      >
        <Flex vertical gap={24} style={{ padding: 'clamp(20px, 4vw, 32px)' }}>
          <Flex gap={16} align="flex-start">
            <span
              aria-hidden
              style={{
                flex: 'none',
                width: 48,
                height: 48,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 14,
                fontSize: 22,
                color: '#fff',
                background: `linear-gradient(135deg, ${token.colorPrimary}, #a855f7)`,
                boxShadow: `0 8px 20px -8px ${token.colorPrimary}`,
              }}
            >
              <ThunderboltFilled />
            </span>
            <div style={{ minWidth: 0 }}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                Losowy quiz z czasowników (B2)
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 16 }}>
                Wybierz grupę czasowników i wariant pytań. Wynik zapisuje się w historii.
              </Typography.Text>
            </div>
          </Flex>
          <div className="filter-grid">
            <div>
              {label('Trudność')}
              <Select
                allowClear
                placeholder="Wszystkie"
                options={difficultyOptions}
                value={difficulty}
                onChange={setDifficulty}
                disabled={onlyWeak}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              {label('Popularność')}
              <Select
                allowClear
                placeholder="Wszystkie"
                options={popularityOptions}
                value={popularity}
                onChange={setPopularity}
                disabled={onlyWeak}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              {label('Wariant pytań')}
              <Select
                value={variant}
                onChange={setVariant}
                options={QUIZ_VARIANTS.map((value) => ({ value, label: VARIANT_LABELS[value] }))}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              {label('Liczba pytań')}
              <Segmented
                block
                value={count}
                onChange={setCount}
                options={[
                  { label: '10', value: 10 },
                  { label: '20', value: 20 },
                  { label: '30', value: 30 },
                ]}
              />
            </div>
          </div>
          <Flex justify="space-between" align="center" wrap gap={12}>
            <Flex align="center" gap={10}>
              <Switch
                checked={onlyWeak}
                onChange={setOnlyWeak}
                disabled={!weakVerbs?.length}
                aria-label="Tylko moje słabe czasowniki"
              />
              <Typography.Text type={weakVerbs?.length ? undefined : 'secondary'} style={{ fontSize: 16 }}>
                Tylko moje słabe czasowniki
                {!weakVerbs?.length && ' (pojawią się po kilku quizach)'}
              </Typography.Text>
            </Flex>
            <Button
              type="primary"
              size="large"
              icon={<ThunderboltFilled />}
              loading={generating}
              onClick={() => void draw()}
              className="mobile-block"
              style={{ minWidth: 200 }}
            >
              Losuj quiz
            </Button>
          </Flex>
        </Flex>
      </Card>

      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginTop: 48, marginBottom: 20 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Gotowe quizy
        </Typography.Title>
        <Flex gap="small" wrap align="center" className="list-toolbar">
          <div className="scroll-x">
            <Segmented
              value={filterDifficulty}
              onChange={setFilterDifficulty}
              options={[{ label: 'Wszystkie', value: 'all' }, ...difficultyOptions]}
            />
          </div>
          <Select
            value={sort}
            onChange={setSort}
            aria-label="Sortowanie"
            options={[
              { value: 'recent', label: 'Najnowsze' },
              { value: 'popular', label: 'Najpopularniejsze' },
            ]}
            className="sort-select"
          />
        </Flex>
      </Flex>

      {error ? (
        <Alert
          type="error"
          showIcon
          title="Nie udało się pobrać quizów"
          description={`${errorMessage(error)}. Sprawdź, czy działa \`netlify dev\` i czy migracje zostały zastosowane.`}
          action={<Button onClick={refetch}>Spróbuj ponownie</Button>}
        />
      ) : isLoading || !data ? (
        <div className="quiz-grid">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <Empty description="Nie ma jeszcze żadnych quizów" style={{ paddingBlock: 24 }}>
            {isAdmin && (
              <Link to="/quizzes/new">
                <Button type="primary">Utwórz pierwszy quiz</Button>
              </Link>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="quiz-grid">
          {data.map((quiz) => (
            <Card
              key={quiz.id}
              className="lift-card"
              style={{ display: 'flex', flexDirection: 'column' }}
              styles={{ body: { flex: 1 } }}
              actions={[
                <Link key="play" to={`/quizzes/${quiz.id}/play`} style={{ fontWeight: 600 }}>
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
                        <a style={{ color: token.colorError }}>
                          <DeleteOutlined /> Usuń
                        </a>
                      </Popconfirm>,
                    ]
                  : []),
              ]}
            >
              <Flex vertical gap={10} style={{ height: '100%' }}>
                <Flex wrap gap={6} align="center">
                  <DifficultyTag value={quiz.difficulty} />
                  <Tag icon={<FireOutlined />}>{quiz.plays} podejść</Tag>
                </Flex>
                <Link to={`/quizzes/${quiz.id}/play`} className="text-link">
                  <Typography.Title level={4} style={{ margin: 0, color: 'inherit' }}>
                    {quiz.title}
                  </Typography.Title>
                </Link>
                <Typography.Paragraph
                  type="secondary"
                  ellipsis={{ rows: 2 }}
                  style={{ margin: 0, flex: 1 }}
                >
                  {quiz.description || 'Brak opisu'}
                </Typography.Paragraph>
                <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                  <QuestionCircleOutlined /> {quiz.questionCount} pytań · <TrophyOutlined /> {quiz.totalPoints} pkt
                </Typography.Text>
              </Flex>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
