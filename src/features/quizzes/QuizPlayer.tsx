import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Progress, Skeleton, Tag, Typography, theme } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { errorMessage, useGetQuizQuery, useGradeQuizMutation } from '../../app/api'
import { DifficultyTag } from '../../components/GroupTags'
import PageHeader from '../../components/PageHeader'
import { useFocusMode } from '../../components/useFocusMode'
import { useAppSelector } from '../../app/hooks'
import type { Answer } from '../../shared/quiz/engine'
import { effectiveShuffle, sampleFromPool, shuffle } from '../../shared/quiz/sampling'
import type { QuizDetail } from '../../shared/quiz/types'
import { isAnswered, questionRenderers } from './questionRenderers'
import ResultView from './ResultView'

const PAD = 'clamp(16px, 4vw, 28px)'

/** What the player sees: a random sample of the pool (if the quiz asks for one), shuffled when required. */
const prepareQuestions = (quiz: QuizDetail, playerShuffles: boolean) => {
  const drawn = sampleFromPool(quiz.questions, quiz.sampleSize)
  const ordered = effectiveShuffle(quiz.shuffleQuestions, playerShuffles) ? shuffle(drawn) : drawn
  return quiz.shuffleOptions
    ? ordered.map((q) => (q.type === 'single' || q.type === 'multiple' ? { ...q, options: shuffle(q.options) } : q))
    : ordered
}

function Runner({ quiz, onRestart }: { quiz: QuizDetail; onRestart: () => void }) {
  const { shuffleQuestions, showExplanations } = useAppSelector((state) => state.settings)
  const [questions] = useState(() => prepareQuestions(quiz, shuffleQuestions))
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [grade, { data: result, isLoading, error }] = useGradeQuizMutation()
  const { token } = theme.useToken()
  const cardRef = useRef<HTMLDivElement>(null)
  // phones: hide the tab bar while answering, the sticky action bar takes the thumb zone
  useFocusMode(!result)

  // after Wstecz/Dalej from the bottom bar, bring the new question's top back into view
  useEffect(() => {
    const el = cardRef.current
    if (!el || el.getBoundingClientRect().top >= 0) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }, [index])

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
  const Renderer = questionRenderers[question.type]

  return (
    <div ref={cardRef} className="quiz-card-anchor">
      <Card styles={{ body: { padding: 0 } }} className="clip-card">
        <div className="quiz-progress" style={{ padding: `20px ${PAD} 12px` }}>
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
            style={{ margin: 0 }}
          />
        </div>
        <div style={{ padding: `24px ${PAD}` }}>
          {question.type === 'cloze' ? null : (
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
          )}
          <div style={{ margin: '28px 0 8px' }}>
            <Renderer
              key={question.id}
              question={question}
              value={answer}
              onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
            />
          </div>
          {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginTop: 16 }} />}
        </div>
        <Flex justify="space-between" gap={12} className="action-bar">
          <Button size="large" icon={<ArrowLeftOutlined />} disabled={index === 0} onClick={() => setIndex(index - 1)}>
            Wstecz
          </Button>
          {isLast ? (
            <Button
              type="primary"
              size="large"
              icon={<CheckOutlined />}
              iconPlacement="end"
              className="action-primary"
              loading={isLoading}
              onClick={() =>
                void grade({
                  id: quiz.id,
                  answers,
                  questionIds: questions.map((q) => q.id),
                })
              }
            >
              Zakończ i sprawdź
            </Button>
          ) : (
            <Button
              type={isAnswered(answer) ? 'primary' : 'default'}
              size="large"
              icon={<ArrowRightOutlined />}
              iconPlacement="end"
              className="action-primary"
              onClick={() => setIndex(index + 1)}
            >
              {isAnswered(answer) ? 'Dalej' : 'Pomiń'}
            </Button>
          )}
        </Flex>
      </Card>
    </div>
  )
}

export default function QuizPlayer({ id }: { id: string }) {
  // currentData (not data): while a different quiz id is loading, `data` would still hold the previous quiz
  const { currentData: data, error } = useGetQuizQuery({ id })
  const [run, setRun] = useState(0)

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (!data) return <Skeleton active paragraph={{ rows: 6 }} />

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
      <Runner key={`${data.id}:${run}`} quiz={data} onRestart={() => setRun((n) => n + 1)} />
    </div>
  )
}
