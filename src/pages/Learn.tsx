import { ArrowRightOutlined, CheckCircleFilled, TrophyOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Flex, Progress, Row, Skeleton, Tag, Typography, theme } from 'antd'
import { Link } from 'react-router-dom'
import { errorMessage } from '../app/api'
import { useListCoursesQuery } from '../features/learn/api'
import { DifficultyTag, PopularityTag } from '../components/GroupTags'
import PageHeader from '../components/PageHeader'
import ReviewCard from '../features/progress/ReviewCard'

export default function Learn() {
  const { data, error, isLoading } = useListCoursesQuery()
  const { token } = theme.useToken()

  return (
    <>
      <PageHeader
        eyebrow="Kursy"
        title="Nauka"
        subtitle="Każdy kurs to seria krótkich lekcji z czasownikami. Po ukończeniu wszystkich lekcji odblokowuje się egzamin końcowy - wynik zapisuje się w historii."
      />
      <div style={{ marginBottom: 24 }}>
        <ReviewCard />
      </div>
      {error ? (
        <Alert type="error" showIcon title={errorMessage(error)} />
      ) : isLoading || !data ? (
        <Row gutter={[20, 20]}>
          {[0, 1, 2, 3].map((i) => (
            <Col xs={24} md={12} key={i}>
              <Card>
                <Skeleton active paragraph={{ rows: 4 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Row gutter={[20, 20]}>
          {data.map((course) => {
            const percent = course.lessonCount ? Math.round((course.completedLessons / course.lessonCount) * 100) : 0
            return (
              <Col xs={24} md={12} key={course.id}>
                <Card className="lift-card" style={{ height: '100%' }} styles={{ body: { height: '100%' } }}>
                  <Flex vertical gap={14} style={{ height: '100%' }}>
                    <Flex justify="space-between" align="flex-start" gap={12}>
                      <Link to={`/learn/${course.id}`} className="text-link" style={{ minWidth: 0 }}>
                        <Typography.Title level={4} style={{ margin: 0, color: 'inherit' }}>
                          {course.title}
                        </Typography.Title>
                      </Link>
                      {course.passed && (
                        <Tag color="success" icon={<CheckCircleFilled />} style={{ marginInlineEnd: 0, flex: 'none' }}>
                          Zaliczony
                        </Tag>
                      )}
                    </Flex>
                    <Flex wrap gap={6}>
                      <DifficultyTag value={course.difficulty} />
                      <PopularityTag value={course.popularity} />
                      <Tag>{course.verbCount} czasowników</Tag>
                    </Flex>
                    <Typography.Paragraph type="secondary" style={{ margin: 0, flex: 1 }}>
                      {course.description}
                    </Typography.Paragraph>
                    <div>
                      <Flex justify="space-between" style={{ fontSize: 14, marginBottom: 2 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                          Postęp
                        </Typography.Text>
                        <Typography.Text strong style={{ fontSize: 14 }}>
                          {course.completedLessons}/{course.lessonCount} lekcji
                        </Typography.Text>
                      </Flex>
                      <Progress
                        percent={percent}
                        showInfo={false}
                        size={{ height: 8 }}
                        strokeColor={percent === 100 ? token.colorSuccess : { from: token.colorPrimary, to: '#a855f7' }}
                        railColor={token.colorFillSecondary}
                      />
                    </div>
                    <Flex justify="space-between" align="center" wrap gap={12}>
                      <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                        {course.bestPercent !== null && (
                          <>
                            <TrophyOutlined /> Najlepszy egzamin: {course.bestPercent}% (próg {course.passPercent}%)
                          </>
                        )}
                      </Typography.Text>
                      <Link to={`/learn/${course.id}`}>
                        <Button type={course.passed ? 'default' : 'primary'} icon={<ArrowRightOutlined />} iconPlacement="end">
                          {course.completedLessons === 0 ? 'Rozpocznij' : 'Kontynuuj'}
                        </Button>
                      </Link>
                    </Flex>
                  </Flex>
                </Card>
              </Col>
            )
          })}
        </Row>
      )}
    </>
  )
}
