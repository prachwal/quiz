import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Progress, Skeleton, Tag, Typography, theme } from 'antd'
import { useState } from 'react'
import { errorMessage, useGetQuizQuery, useGradeQuizMutation } from '../../app/api'
import { DifficultyTag } from '../../components/GroupTags'
import PageHeader from '../../components/PageHeader'
import { useAppSelector } from '../../app/hooks'
import type { Answer } from '../../shared/quiz/engine'
import type { QuizDetail } from '../../shared/quiz/types'
import { isAnswered, questionRenderers } from './questionRenderers'
import ResultView from './ResultView'

const PAD = 'clamp(16px, 4vw, 28px)'

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
  const { token } = theme.useToken()

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
    <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
      <div style={{ padding: `20px ${PAD} 0` }}>
        <Flex justify="space-between" align="center" gap={12} style={{ marginBottom: 12 }}>
          <Typography.Text style={{ fontSize: 15, fontWeight: 600, color: token.colorTextSecondary }}>
            Pytanie <span style={{ color: token.colorPrimary }}>{index + 1}</span> z {questions.length}
          </Typography.Text>
          <Tag style={{ marginInlineEnd: 0, fontSize: 14, lineHeight: '24px' }}>{question.points} pkt</Tag>
        </Flex>
        <Progress
          percent={Math.round(((index + 1) / questions.length) * 100)}
          showInfo={false}
          size={{ height: 6 }}
          strokeColor={{ from: token.colorPrimary, to: '#a855f7' }}
          railColor={token.colorFillSecondary}
        />
      </div>
      <div style={{ padding: `28px ${PAD} 24px` }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'clamp(22px, 2.6vw + 12px, 30px)',
            fontWeight: 650,
            lineHeight: 1.35,
            letterSpacing: -0.3,
            color: token.colorText,
            wordBreak: 'break-word',
          }}
        >
          {question.prompt}
        </h2>
        <div style={{ margin: '28px 0 8px' }}>
          {questionRenderers[question.type]({
            question,
            value: answer,
            onChange: (value) => setAnswers((prev) => ({ ...prev, [question.id]: value })),
          })}
        </div>
        {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginTop: 16 }} />}
      </div>
      <Flex
        justify="space-between"
        gap={12}
        style={{
          padding: `16px ${PAD}`,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillQuaternary,
        }}
      >
        <Button size="large" icon={<ArrowLeftOutlined />} disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Wstecz
        </Button>
        {isLast ? (
          <Button
            type="primary"
            size="large"
            icon={<CheckOutlined />}
            iconPlacement="end"
            loading={isLoading}
            onClick={() => void grade({ id: quiz.id, answers })}
          >
            Zakończ i sprawdź
          </Button>
        ) : (
          <Button
            type={isAnswered(answer) ? 'primary' : 'default'}
            size="large"
            icon={<ArrowRightOutlined />}
            iconPlacement="end"
            onClick={() => setIndex(index + 1)}
          >
            {isAnswered(answer) ? 'Dalej' : 'Pomiń'}
          </Button>
        )}
      </Flex>
    </Card>
  )
}

export default function QuizPlayer({ id }: { id: string }) {
  const { data, error, isLoading } = useGetQuizQuery({ id })
  const [run, setRun] = useState(0)

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 6 }} />

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <PageHeader
        back={data.courseId ? { to: `/learn/${data.courseId}`, label: 'Wróć do kursu' } : { to: '/', label: 'Wszystkie quizy' }}
        title={data.title}
        subtitle={data.description || undefined}
        meta={
          <>
            <DifficultyTag value={data.difficulty} />
            <Tag>{data.questions.length} pytań</Tag>
          </>
        }
      />
      <Runner key={run} quiz={data} onRestart={() => setRun((n) => n + 1)} />
    </div>
  )
}
