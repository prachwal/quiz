import { CheckOutlined, LockOutlined, PlayCircleOutlined, RightOutlined, TrophyOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Progress, Skeleton, Tag, Typography, App as AntdApp, theme } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, useGetCourseQuery, useStartExamMutation } from '../app/api'
import { DifficultyTag, PopularityTag } from '../components/GroupTags'
import PageHeader from '../components/PageHeader'

export default function CourseView() {
  const { courseId = '' } = useParams()
  const { data: course, error, isLoading } = useGetCourseQuery(courseId)
  const [startExam, { isLoading: starting }] = useStartExamMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const { token } = theme.useToken()

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !course) return <Skeleton active paragraph={{ rows: 6 }} />

  const allDone = course.completedLessons >= course.lessonCount
  const nextLesson = course.lessons.find((l) => !l.completed) ?? course.lessons[0]

  const exam = async () => {
    try {
      const quiz = await startExam({ courseId }).unwrap()
      navigate(`/quizzes/${quiz.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const percent = Math.round((course.completedLessons / Math.max(course.lessonCount, 1)) * 100)

  return (
    <>
      <PageHeader
        back={{ to: '/learn', label: 'Wszystkie kursy' }}
        title={course.title}
        subtitle={course.description}
        meta={
          <>
            <DifficultyTag value={course.difficulty} />
            <PopularityTag value={course.popularity} />
            <Tag>{course.verbCount} czasowników</Tag>
          </>
        }
        extra={
          !allDone &&
          nextLesson && (
            <Link to={`/learn/${course.id}/lessons/${nextLesson.id}`}>
              <Button type="primary" size="large" icon={<PlayCircleOutlined />}>
                {course.completedLessons === 0 ? 'Rozpocznij naukę' : 'Kontynuuj naukę'}
              </Button>
            </Link>
          )
        }
      />

      <Card
        title="Lekcje"
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 15 }}>
            {course.completedLessons}/{course.lessonCount} ukończonych
          </Typography.Text>
        }
        styles={{ body: { padding: 8 } }}
      >
        <div style={{ padding: '8px 16px 12px' }}>
          <Progress
            percent={percent}
            showInfo={false}
            size={{ height: 8 }}
            strokeColor={allDone ? token.colorSuccess : { from: token.colorPrimary, to: '#a855f7' }}
            railColor={token.colorFillSecondary}
          />
        </div>
        <Flex vertical gap={2}>
          {course.lessons.map((lesson, i) => {
            const isNext = !allDone && lesson.id === nextLesson?.id
            return (
              <Link key={lesson.id} to={`/learn/${course.id}/lessons/${lesson.id}`} className="lesson-row">
                <span
                  aria-hidden
                  style={{
                    flex: 'none',
                    width: 36,
                    height: 36,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    fontWeight: 700,
                    fontSize: 15,
                    background: lesson.completed
                      ? token.colorSuccessBg
                      : isNext
                        ? token.colorPrimary
                        : token.colorFillSecondary,
                    color: lesson.completed
                      ? token.colorSuccess
                      : isNext
                        ? token.colorTextLightSolid
                        : token.colorTextSecondary,
                  }}
                >
                  {lesson.completed ? <CheckOutlined /> : i + 1}
                </span>
                <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                  <Typography.Text strong style={{ fontSize: 16 }}>
                    {lesson.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                    {lesson.verbCount} czasowników{lesson.completed ? ' · ukończona' : ''}
                  </Typography.Text>
                </Flex>
                <Typography.Text
                  style={{ flex: 'none', fontSize: 15, fontWeight: 500, color: isNext ? token.colorPrimary : token.colorTextSecondary }}
                >
                  {lesson.completed ? 'Powtórz' : 'Otwórz'} <RightOutlined style={{ fontSize: 12 }} />
                </Typography.Text>
              </Link>
            )
          })}
        </Flex>
      </Card>

      <Card
        style={{
          marginTop: 24,
          background: allDone
            ? `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgContainer} 70%)`
            : undefined,
          borderColor: allDone ? token.colorPrimaryBorder : undefined,
        }}
      >
        <Flex justify="space-between" align="center" wrap gap={20}>
          <Flex gap={16} align="flex-start" style={{ flex: '1 1 320px', minWidth: 0 }}>
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
                color: allDone ? '#fff' : token.colorTextTertiary,
                background: allDone
                  ? `linear-gradient(135deg, ${token.colorWarning}, #f97316)`
                  : token.colorFillSecondary,
              }}
            >
              <TrophyOutlined />
            </span>
            <div style={{ minWidth: 0 }}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Egzamin końcowy
              </Typography.Title>
              <Typography.Paragraph style={{ margin: '4px 0 0' }}>
                15 losowych pytań z całego kursu. Próg zaliczenia: <b>{course.passPercent}%</b>.
              </Typography.Paragraph>
              {course.bestPercent !== null && (
                <Flex align="center" gap={8} wrap style={{ marginTop: 6 }}>
                  <Typography.Text type="secondary">Najlepszy wynik: {course.bestPercent}%</Typography.Text>
                  {course.passed && <Tag color="success">Zaliczony</Tag>}
                </Flex>
              )}
            </div>
          </Flex>
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
