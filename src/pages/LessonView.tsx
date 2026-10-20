import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined } from '@ant-design/icons'
import { Alert, Button, Flex, Skeleton, Tag, Typography, App as AntdApp } from 'antd'
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
import { useSwipe } from '../features/learn/useSwipe'
import type { LessonDetail } from '../shared/quiz/types'

function Slides({ lesson }: { lesson: LessonDetail }) {
  const [index, setIndex] = useState(0)
  const [complete, { isLoading: saving }] = useCompleteLessonMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const slideRef = useRef<HTMLDivElement>(null)
  const direction = useRef<1 | -1>(1)

  const autoSpeak = useAppSelector((state) => state.settings.autoSpeak)
  const { available, speak, stop } = useSpeech()
  const total = lesson.verbs.length
  const isLast = index === total - 1
  // phones: tab bar hidden, Cofnij/Dalej live in a sticky bar in the thumb zone
  useFocusMode(total > 0)

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
  const current = lesson.verbs[index]
  useEffect(() => {
    if (!autoSpeak || !available || !current) return
    speak(`verb-${current.id}-all`, verbSpeechParts(current))
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpeak, available, current?.id])

  if (total === 0) return <Alert type="info" showIcon title="Ta lekcja nie ma jeszcze czasowników" />

  return (
    <>
      <div ref={slideRef} className="swipe-area">
        <VerbSlide verb={lesson.verbs[index]} index={index} total={total} />
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

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <PageHeader
        back={{ to: `/learn/${courseId}`, label: lesson.courseTitle }}
        title={lesson.title}
        subtitle={lesson.intro}
        meta={lesson.completed ? <Tag color="success">Ukończona</Tag> : undefined}
      />
      {/* remount per lesson so the slide index resets */}
      <Slides key={lesson.id} lesson={lesson} />
    </div>
  )
}
