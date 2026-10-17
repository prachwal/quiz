import { Alert, Button, Card, Flex, Skeleton, Tag, Typography, App as AntdApp } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, useCompleteLessonMutation, useGetLessonQuery } from '../app/api'
import VerbTable from '../features/learn/VerbTable'

export default function LessonView() {
  const { courseId = '', lessonId = '' } = useParams()
  const { data: lesson, error, isLoading } = useGetLessonQuery({ courseId, lessonId })
  const [complete, { isLoading: saving }] = useCompleteLessonMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !lesson) return <Skeleton active paragraph={{ rows: 8 }} />

  const finish = async () => {
    try {
      await complete({ courseId, lessonId }).unwrap()
      navigate(lesson.nextLessonId ? `/learn/${courseId}/lessons/${lesson.nextLessonId}` : `/learn/${courseId}`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <>
      <Link to={`/learn/${courseId}`}>← {lesson.courseTitle}</Link>
      <Typography.Title style={{ marginTop: 8 }}>
        {lesson.title} {lesson.completed && <Tag color="success">Ukończona</Tag>}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{lesson.intro}</Typography.Paragraph>
      <Card>
        <VerbTable verbs={lesson.verbs} />
        <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
          Kliknij „+” przy czasowniku, aby zobaczyć zdanie przykładowe.
        </Typography.Paragraph>
      </Card>
      <Flex justify="space-between" style={{ marginTop: 16 }}>
        <Button
          disabled={!lesson.prevLessonId}
          onClick={() => navigate(`/learn/${courseId}/lessons/${lesson.prevLessonId}`)}
        >
          Poprzednia
        </Button>
        <Button type="primary" loading={saving} onClick={() => void finish()}>
          {lesson.nextLessonId ? 'Ukończ i przejdź dalej' : 'Ukończ lekcję'}
        </Button>
      </Flex>
    </>
  )
}
