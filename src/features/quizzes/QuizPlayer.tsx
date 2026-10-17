import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Progress, Result, Skeleton, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  errorMessage,
  useGenerateIrregularVerbsQuizMutation,
  useGetQuizQuery,
  useGradeQuizMutation,
  useStartExamMutation,
} from '../../app/api'
import { DifficultyTag } from '../../components/GroupTags'
import { useAppSelector } from '../../app/hooks'
import type { Answer } from '../../shared/quiz/engine'
import type { GradedAttempt, QuizDetail } from '../../shared/quiz/types'
import { isAnswered, questionRenderers } from './questionRenderers'

const shuffled = <T,>(items: T[]) => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function Runner({ quiz, onRestart }: { quiz: QuizDetail; onRestart: () => void }) {
  const { shuffleQuestions, showExplanations } = useAppSelector((state) => state.settings)
  const [questions] = useState(() => (shuffleQuestions ? shuffled(quiz.questions) : quiz.questions))
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [grade, { data: result, isLoading, error }] = useGradeQuizMutation()

  if (result) {
    return (
      <ResultView
        quiz={quiz}
        questions={questions}
        answers={answers}
        result={result}
        showExplanations={showExplanations}
        onRestart={onRestart}
      />
    )
  }

  const question = questions[index]
  const isLast = index === questions.length - 1
  const answer = answers[question.id]

  return (
    <Card
      title={`Pytanie ${index + 1} z ${questions.length}`}
      extra={<Tag>{question.points} pkt</Tag>}
    >
      <Progress
        percent={Math.round((index / questions.length) * 100)}
        showInfo={false}
        style={{ marginBottom: 16 }}
      />
      <Typography.Title level={4}>{question.prompt}</Typography.Title>
      <div style={{ margin: '16px 0 24px' }}>
        {questionRenderers[question.type]({
          question,
          value: answer,
          onChange: (value) => setAnswers((prev) => ({ ...prev, [question.id]: value })),
        })}
      </div>
      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      <Flex justify="space-between">
        <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Wstecz
        </Button>
        {isLast ? (
          <Button
            type="primary"
            loading={isLoading}
            onClick={() => void grade({ id: quiz.id, answers })}
          >
            Zakończ i sprawdź
          </Button>
        ) : (
          <Button type="primary" onClick={() => setIndex(index + 1)}>
            {isAnswered(answer) ? 'Dalej' : 'Pomiń'}
          </Button>
        )}
      </Flex>
    </Card>
  )
}

function ResultView({
  quiz,
  questions,
  answers,
  result,
  showExplanations,
  onRestart,
}: {
  quiz: QuizDetail
  questions: QuizDetail['questions']
  answers: Record<string, Answer>
  result: GradedAttempt
  showExplanations: boolean
  onRestart: () => void
}) {
  const navigate = useNavigate()
  const [generate, { isLoading: generating }] = useGenerateIrregularVerbsQuizMutation()
  const [startExam, { isLoading: restartingExam }] = useStartExamMutation()
  const isGenerated = quiz.source === 'irregular-verbs'
  const drawAnother = async () => {
    const next = await generate({ count: quiz.questions.length, difficulty: quiz.difficulty ?? undefined }).unwrap()
    navigate(`/quizzes/${next.id}/play`)
  }
  const retryExam = async () => {
    if (!result.course) return
    const next = await startExam({ courseId: result.course.id, count: quiz.questions.length }).unwrap()
    navigate(`/quizzes/${next.id}/play`)
  }
  const byId = new Map(result.results.map((r) => [r.questionId, r]))
  const optionText = (questionId: string, ids: string[] | undefined) =>
    questions
      .find((q) => q.id === questionId)
      ?.options.filter((o) => ids?.includes(o.id))
      .map((o) => o.text)
      .join(', ')

  return (
    <>
      <Result
        status={result.course ? (result.course.passed ? 'success' : 'error') : result.percent >= 50 ? 'success' : 'warning'}
        title={
          result.course
            ? result.course.passed
              ? `Egzamin zaliczony! ${result.percent}%`
              : `Egzamin niezaliczony: ${result.percent}%`
            : `${result.score} / ${result.maxScore} pkt (${result.percent}%)`
        }
        subTitle={
          result.course
            ? `${result.score} / ${result.maxScore} pkt · próg zaliczenia ${result.course.passPercent}% · ${result.course.title}`
            : quiz.title
        }
        extra={[
          result.course ? (
            <Link key="course" to={`/learn/${result.course.id}`}>
              <Button type="primary">Wróć do kursu</Button>
            </Link>
          ) : null,
          result.course ? (
            <Button key="retry" loading={restartingExam} onClick={() => void retryExam()}>
              Nowe podejście
            </Button>
          ) : isGenerated ? (
            <Button key="again" type="primary" loading={generating} onClick={() => void drawAnother()}>
              Losuj nowy quiz
            </Button>
          ) : (
            <Button key="again" type="primary" onClick={onRestart}>
              Zagraj ponownie
            </Button>
          ),
          <Link key="results" to="/results">
            <Button>Historia wyników</Button>
          </Link>,
          <Link key="back" to="/">
            <Button>Wszystkie quizy</Button>
          </Link>,
        ]}
      />
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {questions.map((question, i) => {
          const r = byId.get(question.id)
          if (!r) return null
          const given = answers[question.id]
          const givenText = question.type === 'text' ? given?.text : optionText(question.id, given?.optionIds)
          return (
            <Card
              key={question.id}
              size="small"
              title={
                <Space>
                  {r.correct ? (
                    <CheckCircleFilled style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f' }} />
                  )}
                  {i + 1}. {question.prompt}
                </Space>
              }
              extra={
                <Tag>
                  {r.earned} / {r.points} pkt
                </Tag>
              }
            >
              <Typography.Paragraph>
                <Typography.Text type="secondary">Twoja odpowiedź: </Typography.Text>
                {givenText || <em>brak</em>}
              </Typography.Paragraph>
              {!r.correct && (
                <Typography.Paragraph>
                  <Typography.Text type="secondary">
                    {question.type === 'text' ? 'Akceptowane odpowiedzi: ' : 'Poprawna odpowiedź: '}
                  </Typography.Text>
                  {r.correctAnswers.join(', ')}
                </Typography.Paragraph>
              )}
              {showExplanations && r.explanation && (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {r.explanation}
                </Typography.Paragraph>
              )}
            </Card>
          )
        })}
      </Space>
    </>
  )
}

export default function QuizPlayer({ id }: { id: string }) {
  const { data, error, isLoading } = useGetQuizQuery({ id })
  const [run, setRun] = useState(0)

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 6 }} />

  return (
    <>
      <Typography.Title>{data.title}</Typography.Title>
      <DifficultyTag value={data.difficulty} />
      {data.description && <Typography.Paragraph type="secondary">{data.description}</Typography.Paragraph>}
      <Runner key={run} quiz={data} onRestart={() => setRun((n) => n + 1)} />
    </>
  )
}
