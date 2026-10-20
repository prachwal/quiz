import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Progress, Skeleton, Tag, Typography, App as AntdApp, theme } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { errorMessage } from '../app/api'
import { useCompleteLessonMutation, useGetLessonQuery } from '../features/learn/api'
import PageHeader from '../components/PageHeader'
import { useFocusMode } from '../components/useFocusMode'
import { useAppSelector } from '../app/hooks'
import { verbSpeechParts } from '../features/audio/speech'
import { useSpeech } from '../features/audio/useSpeech'
import VerbSlide from '../features/learn/VerbSlide'
import type { SwipeDirection } from '../features/learn/swipe'
import { MediaProvider } from '../features/media/MediaProvider'
import { RichText } from '../features/media/RichText'
import { useSwipe } from '../features/learn/useSwipe'
import { introNeedsSlide } from '../shared/quiz/lessonIntro'
import type { LessonDetail } from '../shared/quiz/types'

/** The lesson intro as its own first slide ("Wstęp"), with the same chrome as a verb slide. */
function IntroSlide({ intro, index, total }: { intro: string; index: number; total: number }) {
  const { token } = theme.useToken()
  return (
    <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
      <Flex vertical>
        <Flex
          justify="space-between"
          align="center"
          wrap
          gap="small"
          style={{ padding: '16px clamp(16px, 4vw, 28px) 12px' }}
        >
          <Tag color="processing">Wstęp</Tag>
          <Typography.Text style={{ fontSize: 15, fontWeight: 600, color: token.colorTextSecondary }}>
            <span style={{ color: token.colorPrimary }}>{index + 1}</span> / {total}
          </Typography.Text>
        </Flex>
        <Progress
          percent={Math.round(((index + 1) / total) * 100)}
          showInfo={false}
          size={{ height: 4 }}
          strokeColor={{ from: token.colorPrimary, to: '#a855f7' }}
          railColor={token.colorFillSecondary}
          style={{ padding: '0 clamp(16px, 4vw, 28px)', margin: 0, lineHeight: 0 }}
        />
        <Flex vertical gap={16} style={{ padding: 'clamp(28px, 5vw, 48px) clamp(16px, 4vw, 32px)' }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Wstęp
          </Typography.Title>
          <div style={{ fontSize: 18, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            <RichText text={intro} />
          </div>
        </Flex>
      </Flex>
    </Card>
  )
}

/**
 * The lesson's slides: the intro first when `withIntro` (it has an image or is long, see introNeedsSlide), then one
 * slide per verb. Indexes and the "x / n" counter count all slides; completing happens on the last verb slide.
 */
function Slides({ lesson, withIntro }: { lesson: LessonDetail; withIntro: boolean }) {
  const [index, setIndex] = useState(0)
  const [complete, { isLoading: saving }] = useCompleteLessonMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const slideRef = useRef<HTMLDivElement>(null)
  const direction = useRef<1 | -1>(1)

  const autoSpeak = useAppSelector((state) => state.settings.autoSpeak)
  const { available, speak, stop } = useSpeech()
  const verbCount = lesson.verbs.length
  const offset = withIntro ? 1 : 0
  const total = offset + verbCount
  const isLast = index === total - 1
  // index of the verb shown on this slide; -1 on the intro slide
  const verbIndex = index - offset
  // phones: tab bar hidden, Cofnij/Dalej live in a sticky bar in the thumb zone
  useFocusMode(verbCount > 0)

  const finish = useCallback(async () => {
    try {
      await complete({ courseId: lesson.courseId, lessonId: lesson.id }).unwrap()
      navigate(
        lesson.nextLessonId
          ? `/learn/${lesson.courseId}/lessons/${lesson.nextLessonId}`
          : `/learn/${lesson.courseId}`,
      )
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }, [complete, lesson, message, navigate])

  const back = useCallback(() => {
    direction.current = -1
    setIndex((i) => Math.max(i - 1, 0))
  }, [])
  const next = useCallback(() => {
    direction.current = 1
    if (isLast) void finish()
    else setIndex((i) => i + 1)
  }, [isLast, finish])

  // swipe left = next verb, right = previous; finishing the lesson stays a deliberate button tap
  const onSwipe = useCallback(
    (dir: SwipeDirection) => {
      if (dir === 'right') back()
      else if (!isLast) next()
    },
    [back, next, isLast],
  )
  useSwipe(slideRef, onSwipe)

  // subtle slide-in in the direction of travel
  useEffect(() => {
    const el = slideRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { opacity: 0.4, transform: `translateX(${direction.current * 16}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'ease-out' },
    )
  }, [index])

  // arrow keys move between slides (not while typing in a field)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'ArrowLeft') back()
      if (event.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back, next])

  // optional autoplay of the whole verb when the slide changes (stops when leaving the lesson)
  const current = verbIndex >= 0 ? lesson.verbs[verbIndex] : undefined
  useEffect(() => {
    if (!autoSpeak || !available || !current) return
    speak(`verb-${current.id}-all`, verbSpeechParts(current))
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpeak, available, current?.id])

  if (verbCount === 0) {
    return (
      <>
        {withIntro && <IntroSlide intro={lesson.intro} index={0} total={1} />}
        <Alert type="info" showIcon title="Ta lekcja nie ma jeszcze czasowników" />
      </>
    )
  }

  return (
    <>
      <div ref={slideRef} className="swipe-area">
        {current ? (
          <VerbSlide verb={current} index={index} total={total} />
        ) : (
          <IntroSlide intro={lesson.intro} index={index} total={total} />
        )}
      </div>
      <Typography.Text type="secondary" className="swipe-hint">
        Przesuń palcem w lewo lub w prawo, aby zmienić słowo
      </Typography.Text>
      <Flex justify="space-between" align="center" gap="middle" className="action-bar action-bar-flat">
        <Button size="large" icon={<ArrowLeftOutlined />} disabled={index === 0} onClick={back}>
          Cofnij
        </Button>
        <Typography.Text type="secondary" className="kbd-hint">
          Możesz też używać strzałek ← →
        </Typography.Text>
        <Button
          type="primary"
          size="large"
          icon={isLast ? <CheckOutlined /> : <ArrowRightOutlined />}
          iconPlacement="end"
          className="action-primary"
          loading={saving}
          onClick={next}
        >
          {isLast ? 'Ukończ lekcję' : 'Dalej'}
        </Button>
      </Flex>
    </>
  )
}

export default function LessonView() {
  const { courseId = '', lessonId = '' } = useParams()
  const { data: lesson, error, isLoading } = useGetLessonQuery({ courseId, lessonId })

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !lesson) return <Skeleton active paragraph={{ rows: 8 }} />

  // a long or illustrated intro moves to its own slide; a short plain one stays the page subtitle, as before
  const withIntro = introNeedsSlide(lesson.intro)
  return (
    <MediaProvider media={lesson.media}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <PageHeader
          back={{ to: `/learn/${courseId}`, label: lesson.courseTitle }}
          title={lesson.title}
          subtitle={withIntro ? undefined : lesson.intro}
          meta={lesson.completed ? <Tag color="success">Ukończona</Tag> : undefined}
        />
        {/* remount per lesson so the slide index resets */}
        <Slides key={lesson.id} lesson={lesson} withIntro={withIntro} />
      </div>
    </MediaProvider>
  )
}
