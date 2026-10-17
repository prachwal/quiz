import { CheckCircleFilled, TrophyOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Flex, Progress, Row, Skeleton, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { errorMessage, useListCoursesQuery } from '../app/api'
import { DifficultyTag, PopularityTag } from '../components/GroupTags'

export default function Learn() {
  const { data, error, isLoading } = useListCoursesQuery()

  return (
    <>
      <Typography.Title>Nauka</Typography.Title>
      <Typography.Paragraph type="secondary">
        Każdy kurs to seria krótkich lekcji z czasownikami. Po ukończeniu wszystkich lekcji
        odblokowuje się egzamin końcowy - wynik zapisuje się w historii.
      </Typography.Paragraph>
      {error ? (
        <Alert type="error" showIcon title={errorMessage(error)} />
      ) : isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <Row gutter={[16, 16]}>
          {data.map((course) => (
            <Col xs={24} md={12} key={course.id}>
              <Card
                title={course.title}
                extra={course.passed ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : null}
                style={{ height: '100%' }}
              >
                <Flex vertical gap="small">
                  <div>
                    <DifficultyTag value={course.difficulty} />
                    <PopularityTag value={course.popularity} />
                    <Tag>{course.verbCount} czasowników</Tag>
                  </div>
                  <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                    {course.description}
                  </Typography.Paragraph>
                  <Progress
                    percent={
                      course.lessonCount
                        ? Math.round((course.completedLessons / course.lessonCount) * 100)
                        : 0
                    }
                    format={() => `${course.completedLessons}/${course.lessonCount} lekcji`}
                  />
                  <Flex justify="space-between" align="center">
                    <Typography.Text type="secondary">
                      {course.bestPercent !== null && (
                        <>
                          <TrophyOutlined /> Najlepszy egzamin: {course.bestPercent}% (próg {course.passPercent}%)
                        </>
                      )}
                    </Typography.Text>
                    <Link to={`/learn/${course.id}`}>
                      <Button type="primary">
                        {course.completedLessons === 0 ? 'Rozpocznij' : 'Kontynuuj'}
                      </Button>
                    </Link>
                  </Flex>
                </Flex>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  )
}
