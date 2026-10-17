import { CheckCircleFilled, FireFilled } from '@ant-design/icons'
import { Card, Flex, Progress, Skeleton, Typography, theme } from 'antd'
import { useGetProgressQuery } from '../../app/api'
import WeekStrip from './WeekStrip'

const streakWord = (n: number) => (n === 1 ? 'dzień' : 'dni')

/** Home card: daily goal ring, current streak and the last 7 days. */
export default function DailyGoalCard() {
  const { data, isLoading } = useGetProgressQuery()
  const { token } = theme.useToken()

  if (isLoading || !data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    )
  }

  const done = data.today.answered
  const reached = done >= data.dailyGoal
  const percent = Math.min(100, Math.round((done / data.dailyGoal) * 100))

  return (
    <Card styles={{ body: { padding: 'clamp(16px, 3vw, 24px)' } }}>
      <Flex gap="large" align="center" wrap>
        <Progress
          type="circle"
          size={96}
          percent={percent}
          strokeColor={reached ? token.colorSuccess : token.colorPrimary}
          format={() =>
            reached ? (
              <CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 30 }} />
            ) : (
              <span style={{ fontSize: 18, fontWeight: 700 }}>
                {done}/{data.dailyGoal}
              </span>
            )
          }
        />
        <Flex vertical gap={4} style={{ flex: '1 1 220px', minWidth: 0 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {reached ? 'Cel dzienny osiągnięty!' : 'Cel dzienny'}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 16 }}>
            {reached
              ? `Dziś ${done} odpowiedzi - brawo!`
              : `Zostało ${data.dailyGoal - done} ${data.dailyGoal - done === 1 ? 'odpowiedź' : 'odpowiedzi'} do celu.`}
          </Typography.Text>
          <Flex align="center" gap={8} style={{ marginTop: 4 }}>
            <FireFilled style={{ color: data.currentStreak > 0 ? '#ff7a45' : token.colorTextQuaternary, fontSize: 20 }} />
            <Typography.Text strong style={{ fontSize: 17 }}>
              Seria: {data.currentStreak} {streakWord(data.currentStreak)}
            </Typography.Text>
            <Typography.Text type="secondary">· rekord {data.longestStreak}</Typography.Text>
          </Flex>
        </Flex>
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <WeekStrip summary={data} />
        </div>
      </Flex>
    </Card>
  )
}
