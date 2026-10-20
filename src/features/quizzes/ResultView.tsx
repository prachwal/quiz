import {
  BulbOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  HistoryOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Button, Card, Flex, Progress, Tag, Typography, App as AntdApp, theme } from 'antd'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage } from '../../app/api'
import { useStartReviewMutation } from '../progress/api'
import { useGenerateIrregularVerbsQuizMutation, useRetryWrongMutation } from './api'
import SpeakButton from '../audio/SpeakButton'
import { recallGenerate, rememberGenerate } from './lastGenerate'
import { GENERATE_COUNT, REVIEW_COUNT, clampCount } from './counts'
import ProgressLine from '../progress/ProgressLine'
import { useScoreColors } from '../results/useScoreColors'
import type { Answer } from '../../shared/quiz/engine'
import type { GradedAttempt, QuizDetail } from '../../shared/quiz/types'

type Tone = 'success' | 'warning' | 'error'

/**
 * Replaces the default headline, subline and action group of the result hero.
 * Built by the feature that owns the context (e.g. a course exam in `features/learn`).
 */
export interface ResultOutcome {
  tone: 'success' | 'error'
  headline: string
  subline: string
  actions: ReactNode
}

function Stat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  const { token } = theme.useToken()
  return (
    <Flex
      vertical
      gap={2}
      className="stat-tile"
      style={{
        flex: '1 1 120px',
        minWidth: 0,
        borderRadius: token.borderRadiusLG,
        background: token.colorFillQuaternary,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 14 }}>
        {label}
      </Typography.Text>
      <span
        style={{
          fontSize: 'clamp(20px, 2vw + 14px, 26px)',
          fontWeight: 700,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          color: color ?? token.colorText,
        }}
      >
        {value}
      </span>
    </Flex>
  )
}

function AnswerBox({
  label,
  value,
  tone,
  action,
}: {
  label: string
  value: ReactNode
  tone: 'success' | 'error' | 'neutral'
  action?: ReactNode
}) {
  const { token } = theme.useToken()
  const palette = {
    success: { bg: token.colorSuccessBg, border: token.colorSuccessBorder, label: token.colorSuccessText },
    error: { bg: token.colorErrorBg, border: token.colorErrorBorder, label: token.colorErrorText },
    neutral: { bg: token.colorFillQuaternary, border: token.colorBorderSecondary, label: token.colorTextSecondary },
  }[tone]
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: token.borderRadius,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: palette.label,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <Flex align="center" justify="space-between" gap={8}>
        <div style={{ fontSize: 18, lineHeight: 1.5, color: token.colorText, wordBreak: 'break-word' }}>{value}</div>
        {action}
      </Flex>
    </div>
  )
}

function QuestionReview({
  index,
  prompt,
  correct,
  earned,
  points,
  givenText,
  correctLabel,
  correctText,
  speakParts,
  explanation,
}: {
  index: number
  prompt: string
  correct: boolean
  earned: number
  points: number
  givenText: string | undefined
  correctLabel: string
  correctText: string
  /** English texts to read aloud (only for generated verb quizzes). */
  speakParts?: string[]
  explanation: string | null | undefined
}) {
  const { token } = theme.useToken()
  const accent = correct ? token.colorSuccess : token.colorError
  return (
    <Card
      styles={{ body: { padding: 0 } }}
      style={{ overflow: 'hidden', borderInlineStart: `4px solid ${accent}` }}
    >
      <Flex vertical gap={16} className="review-body">
        <Flex gap={14} align="flex-start">
          <span
            aria-hidden
            style={{ flex: 'none', fontSize: 26, lineHeight: 1, color: accent, marginTop: 2 }}
          >
            {correct ? <CheckCircleFilled /> : <CloseCircleFilled />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text type="secondary" style={{ fontSize: 14, fontWeight: 500 }}>
              Pytanie {index + 1} · {correct ? 'dobrze' : 'źle'}
            </Typography.Text>
            <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' }}>{prompt}</div>
          </div>
          <Tag
            color={earned === points ? 'success' : earned > 0 ? 'warning' : 'error'}
            style={{ flex: 'none', marginInlineEnd: 0, fontSize: 14, paddingInline: 10, lineHeight: '26px' }}
          >
            {earned} / {points} pkt
          </Tag>
        </Flex>

        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: correct ? '1fr' : 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
          }}
        >
          <AnswerBox
            label="Twoja odpowiedź"
            tone={correct ? 'success' : 'error'}
            value={givenText || <em style={{ color: token.colorTextTertiary }}>brak odpowiedzi</em>}
          />
          {!correct && (
            <AnswerBox
              label={correctLabel}
              tone="success"
              value={correctText}
              action={
                speakParts && (
                  <SpeakButton speakKey={`answer-${index}`} parts={speakParts} label="Odsłuchaj poprawną odpowiedź" />
                )
              }
            />
          )}
        </div>

        {explanation && (
          <Flex
            gap={12}
            align="flex-start"
            style={{
              padding: '12px 16px',
              borderRadius: token.borderRadius,
              background: token.colorInfoBg,
              border: `1px dashed ${token.colorInfoBorder}`,
            }}
          >
            <BulbOutlined style={{ fontSize: 18, color: token.colorInfo, marginTop: 4 }} />
            <Typography.Paragraph style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>{explanation}</Typography.Paragraph>
          </Flex>
        )}
      </Flex>
    </Card>
  )
}

export default function ResultView({
  quiz,
  questions,
  answers,
  result,
  showExplanations,
  onRestart,
  outcome,
}: {
  quiz: QuizDetail
  questions: QuizDetail['questions']
  answers: Record<string, Answer>
  result: GradedAttempt
  showExplanations: boolean
  onRestart: () => void
  outcome?: ResultOutcome
}) {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const [generate, { isLoading: generating }] = useGenerateIrregularVerbsQuizMutation()
  const [startReview, { isLoading: startingReview }] = useStartReviewMutation()
  const isGenerated = quiz.source === 'irregular-verbs'
  const isReview = quiz.source === 'review'
  const { message } = AntdApp.useApp()
  const isWeak = quiz.source === 'weak'
  const [retryWrong, { isLoading: retrying }] = useRetryWrongMutation()
  const wrongIds = result.results.filter((r) => !r.correct).map((r) => r.questionId)
  const canRetryWrong = wrongIds.length > 0 && Boolean(quiz.source)
  const retryMistakes = async () => {
    try {
      const next = await retryWrong({ quizId: quiz.id, questionIds: wrongIds }).unwrap()
      navigate(`/quizzes/${next.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }
  const nextTraining = async () => {
    try {
      const next = await generate({ count: clampCount(quiz.questions.length, GENERATE_COUNT), onlyWeak: true }).unwrap()
      navigate(`/quizzes/${next.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }
  const drawAnother = async () => {
    try {
      const choices = recallGenerate(quiz.id) ?? {
        count: quiz.questions.length,
        difficulty: quiz.difficulty ?? undefined,
      }
      const next = await generate({ ...choices, count: clampCount(choices.count, GENERATE_COUNT) }).unwrap()
      rememberGenerate(next.id, choices)
      navigate(`/quizzes/${next.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }
  const nextReview = async () => {
    try {
      const next = await startReview({ count: clampCount(quiz.questions.length, REVIEW_COUNT) }).unwrap()
      navigate(`/quizzes/${next.id}/play`)
    } catch (e) {
      void message.info(errorMessage(e)) // e.g. nothing left to review today
      navigate('/')
    }
  }
  const byId = new Map(result.results.map((r) => [r.questionId, r]))
  const optionText = (questionId: string, ids: string[] | undefined) =>
    questions
      .find((q) => q.id === questionId)
      ?.options.filter((o) => ids?.includes(o.id))
      .map((o) => o.text)
      .join(', ')

  const { band } = useScoreColors()
  const tone: Tone = outcome
    ? outcome.tone
    : ({ low: 'error', mid: 'warning', high: 'success' } as const)[band(result.percent)]
  const toneColor = { success: token.colorSuccess, warning: token.colorWarning, error: token.colorError }[tone]
  const toneText = { success: token.colorSuccessText, warning: token.colorWarningText, error: token.colorErrorText }[tone]
  const toneBg = { success: token.colorSuccessBg, warning: token.colorWarningBg, error: token.colorErrorBg }[tone]
  const correctCount = result.results.filter((r) => r.correct).length
  const headline = outcome
    ? outcome.headline
    : result.percent >= 90
      ? 'Znakomicie!'
      : result.percent >= 70
        ? 'Świetna robota!'
        : result.percent >= 50
          ? 'Dobry wynik'
          : 'Spróbuj jeszcze raz'
  const subline = outcome ? outcome.subline : quiz.title

  return (
    <Flex vertical gap={24}>
      <Card
        styles={{ body: { padding: 0 } }}
        style={{
          overflow: 'hidden',
          background: `linear-gradient(160deg, ${toneBg} 0%, ${token.colorBgContainer} 55%)`,
        }}
      >
        <Flex wrap align="center" justify="center" gap={32} className="result-hero">
          <Progress
            type="circle"
            percent={result.percent}
            size={168}
            strokeWidth={9}
            strokeColor={toneColor}
            railColor={token.colorFillSecondary}
            format={(p) => (
              <Flex vertical align="center" gap={2}>
                <span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, color: token.colorText }}>{p}%</span>
                <span style={{ fontSize: 14, color: token.colorTextSecondary }}>wynik</span>
              </Flex>
            )}
          />
          <Flex vertical gap={12} style={{ flex: '1 1 300px', minWidth: 0 }}>
            <div className="result-headline">
              <Typography.Title level={2} style={{ margin: 0, color: toneText, letterSpacing: -0.4 }}>
                {headline}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 17 }}>
                {subline}
              </Typography.Text>
            </div>
            <Flex wrap gap={12} className="stat-row">
              <Stat label="Punkty" value={`${result.score} / ${result.maxScore}`} />
              <Stat label="Poprawne" value={correctCount} color={token.colorSuccessText} />
              <Stat label="Błędne" value={result.results.length - correctCount} color={token.colorErrorText} />
            </Flex>
            <Flex wrap gap={8} className="result-actions" style={{ marginTop: 4 }}>
              {outcome ? (
                outcome.actions
              ) : isWeak ? (
                <Button type="primary" size="large" icon={<ReloadOutlined />} loading={generating} onClick={() => void nextTraining()}>
                  Kolejny trening błędów
                </Button>
              ) : isReview ? (
                <Button type="primary" size="large" icon={<ReloadOutlined />} loading={startingReview} onClick={() => void nextReview()}>
                  Kolejna powtórka
                </Button>
              ) : isGenerated ? (
                <Button type="primary" size="large" icon={<ReloadOutlined />} loading={generating} onClick={() => void drawAnother()}>
                  Losuj nowy quiz
                </Button>
              ) : (
                <Button type="primary" size="large" icon={<ReloadOutlined />} onClick={onRestart}>
                  Zagraj ponownie
                </Button>
              )}
              {canRetryWrong && (
                <Button size="large" loading={retrying} onClick={() => void retryMistakes()}>
                  Powtórz błędne ({wrongIds.length})
                </Button>
              )}
              <Link to="/results">
                <Button size="large" icon={<HistoryOutlined />}>
                  Historia wyników
                </Button>
              </Link>
              <Link to="/">
                <Button size="large" type="text" icon={<UnorderedListOutlined />}>
                  Wszystkie quizy
                </Button>
              </Link>
            </Flex>
          </Flex>
        </Flex>
      </Card>

      <ProgressLine />

      <Typography.Title level={3} style={{ margin: '8px 0 0' }}>
        Przegląd odpowiedzi
      </Typography.Title>
      <Flex vertical gap={16}>
        {questions.map((question, i) => {
          const r = byId.get(question.id)
          if (!r) return null
          const given = answers[question.id]
          // attempts saved with a readable answer win; older rows keep the previous lookup
          const givenText =
            r.answerText ?? (question.type === 'text' ? given?.text : optionText(question.id, given?.optionIds))
          return (
            <QuestionReview
              key={question.id}
              index={i}
              prompt={question.prompt}
              correct={r.correct}
              earned={r.earned}
              points={r.points}
              givenText={givenText}
              correctLabel={question.type === 'text' ? 'Akceptowane odpowiedzi' : 'Poprawna odpowiedź'}
              correctText={r.correctAnswers.join(', ')}
              speakParts={quiz.source ? r.correctAnswers : undefined}
              explanation={showExplanations ? r.explanation : null}
            />
          )
        })}
      </Flex>
    </Flex>
  )
}
