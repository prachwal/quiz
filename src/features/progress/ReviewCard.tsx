import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Skeleton, Tag, Typography, App as AntdApp, theme } from 'antd'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '../../app/api'
import { useGetReviewSummaryQuery, useStartReviewMutation } from './api'

const plural = (n: number) => (n === 1 ? 'czasownik' : n >= 2 && n <= 4 ? 'czasowniki' : 'czasowników')

const formatNext = (iso: string) =>
  new Date(iso).toLocaleString('pl-PL', { weekday: 'long', hour: '2-digit', minute: '2-digit' })

/** Spaced repetition: how many verbs are due today and a button to start the session. */
export default function ReviewCard() {
  const { data, isLoading } = useGetReviewSummaryQuery()
  const [start, { isLoading: starting }] = useStartReviewMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const { token } = theme.useToken()

  if (isLoading || !data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 1 }} />
      </Card>
    )
  }

  const begin = async () => {
    try {
      const quiz = await start({ count: 10 }).unwrap()
      navigate(`/quizzes/${quiz.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const due = data.dueCount
  return (
    <Card
      styles={{ body: { padding: 'clamp(16px, 3vw, 24px)' } }}
      style={due > 0 ? { borderColor: token.colorPrimaryBorder } : undefined}
    >
      <Flex justify="space-between" align="center" wrap gap="middle">
        <Flex vertical gap={4} style={{ minWidth: 0, flex: '1 1 260px' }}>
          <Flex align="center" gap={8} wrap>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Powtórka na dziś
            </Typography.Title>
            {due > 0 && <Tag color="processing">{due}</Tag>}
          </Flex>
          {due > 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 16 }}>
              {due} {plural(due)} czeka na powtórkę
              {data.newCount > 0 ? ` (w tym ${data.newCount} nowych z lekcji)` : ''}. Regularne powtórki pomagają
              zapamiętać formy na dłużej.
            </Typography.Text>
          ) : data.trackedCount === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 16 }}>
              Ukończ pierwszą lekcję w zakładce Nauka, a czasowniki z niej pojawią się tutaj do powtórki.
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 16 }}>
              Na dziś wszystko powtórzone.
              {data.nextDueAt ? ` Następna powtórka: ${formatNext(data.nextDueAt)}.` : ''}
            </Typography.Text>
          )}
        </Flex>
        {due > 0 && (
          <Button type="primary" size="large" icon={<ReloadOutlined />} loading={starting} onClick={() => void begin()}>
            Zacznij powtórkę
          </Button>
        )}
      </Flex>
    </Card>
  )
}
