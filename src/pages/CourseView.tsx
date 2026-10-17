import { CheckCircleFilled, LockOutlined, PlayCircleOutlined, TrophyOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, List, Progress, Skeleton, Tag, Typography, App as AntdApp } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, useGetCourseQuery, useStartExamMutation } from '../app/api'
import { DifficultyTag, PopularityTag } from '../components/GroupTags'
import { useAuth } from '../features/auth/useAuth'

export default function CourseView() {
  const { courseId = '' } = useParams()
  const { data: course, error, isLoading } = useGetCourseQuery(courseId)
  const [startExam, { isLoading: starting }] = useStartExamMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const { enabled, isAuthenticated, login } = useAuth()

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !course) return <Skeleton active paragraph={{ rows: 6 }} />

  const allDone = course.completedLessons >= course.lessonCount
  const nextLesson = course.lessons.find((l) => !l.completed) ?? course.lessons[0]

  const exam = async () => {
    if (enabled && !isAuthenticated) return login()
    try {
      const quiz = await startExam({ courseId }).unwrap()
      navigate(`/quizzes/${quiz.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <>
      <Typography.Title>{course.title}</Typography.Title>
      <div style={{ marginBottom: 12 }}>
        <DifficultyTag value={course.difficulty} />
        <PopularityTag value={course.popularity} />
        <Tag>{course.verbCount} czasowników</Tag>
      </div>
      <Typography.Paragraph type="secondary">{course.description}</Typography.Paragraph>

      {enabled && !isAuthenticated && (
        <Alert
          type="info"
          showIcon
          title="Zaloguj się, aby zapisywać postęp i przystępować do egzaminu"
          action={<Button onClick={() => void login()}>Zaloguj</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card title="Lekcje">
        <Progress
          percent={Math.round((course.completedLessons / Math.max(course.lessonCount, 1)) * 100)}
          format={() => `${course.completedLessons}/${course.lessonCount}`}
          style={{ marginBottom: 16 }}
        />
        <List
          dataSource={course.lessons}
          renderItem={(lesson) => (
            <List.Item
              actions={[
                <Link key="open" to={`/learn/${course.id}/lessons/${lesson.id}`}>
                  {lesson.completed ? 'Powtórz' : 'Otwórz'}
                </Link>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  lesson.completed ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 20 }} />
                  ) : (
                    <PlayCircleOutlined style={{ fontSize: 20 }} />
                  )
                }
                title={lesson.title}
                description={`${lesson.verbCount} czasowników`}
              />
            </List.Item>
          )}
        />
        {!allDone && nextLesson && (
          <Link to={`/learn/${course.id}/lessons/${nextLesson.id}`}>
            <Button type="primary" style={{ marginTop: 8 }}>
              {course.completedLessons === 0 ? 'Rozpocznij naukę' : 'Kontynuuj naukę'}
            </Button>
          </Link>
        )}
      </Card>

      <Card title="Egzamin końcowy" style={{ marginTop: 16 }}>
        <Flex justify="space-between" align="center" wrap gap="middle">
          <div>
            <Typography.Paragraph style={{ marginBottom: 4 }}>
              15 losowych pytań z całego kursu. Próg zaliczenia: <b>{course.passPercent}%</b>.
            </Typography.Paragraph>
            {course.bestPercent !== null && (
              <Typography.Text type="secondary">
                <TrophyOutlined /> Najlepszy wynik: {course.bestPercent}%{' '}
                {course.passed && <Tag color="success">Zaliczony</Tag>}
              </Typography.Text>
            )}
          </div>
          <Button
            type="primary"
            size="large"
            icon={allDone ? undefined : <LockOutlined />}
            disabled={!allDone}
            loading={starting}
            onClick={() => void exam()}
          >
            {allDone ? 'Przystąp do egzaminu' : 'Ukończ wszystkie lekcje'}
          </Button>
        </Flex>
      </Card>
    </>
  )
}
