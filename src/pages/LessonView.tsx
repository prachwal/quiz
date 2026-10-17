import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined } from '@ant-design/icons'
import { Alert, Button, Flex, Grid, Skeleton, Tag, Typography, App as AntdApp } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { errorMessage, useCompleteLessonMutation, useGetLessonQuery } from '../app/api'
import PageHeader from '../components/PageHeader'
import VerbSlide from '../features/learn/VerbSlide'
import type { LessonDetail } from '../shared/quiz/types'

function Slides({ lesson }: { lesson: LessonDetail }) {
  const [index, setIndex] = useState(0)
  const [complete, { isLoading: saving }] = useCompleteLessonMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const screens = Grid.useBreakpoint()

  const total = lesson.verbs.length
  const isLast = index === total - 1

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

  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [])
  const next = useCallback(() => {
    if (isLast) void finish()
    else setIndex((i) => i + 1)
  }, [isLast, finish])

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

  if (total === 0) return <Alert type="info" showIcon title="Ta lekcja nie ma jeszcze czasowników" />

  return (
    <>
      <VerbSlide verb={lesson.verbs[index]} index={index} total={total} />
      <Flex justify="space-between" align="center" gap="middle" style={{ marginTop: 20 }}>
        <Button size="large" icon={<ArrowLeftOutlined />} disabled={index === 0} onClick={back}>
          Cofnij
        </Button>
        {screens.md && (
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            Możesz też używać strzałek ← →
          </Typography.Text>
        )}
        <Button
          type="primary"
          size="large"
          icon={isLast ? <CheckOutlined /> : <ArrowRightOutlined />}
          iconPlacement="end"
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
