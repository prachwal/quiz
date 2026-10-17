import { AimOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Flex, Progress, Skeleton, Tag, Typography, App as AntdApp, theme } from 'antd'
import { useNavigate } from 'react-router-dom'
import { errorMessage, useGenerateIrregularVerbsQuizMutation, useGetWeakVerbsQuery } from '../../app/api'
import SpeakButton from '../audio/SpeakButton'
import { formsText } from '../learn/format'

/** Results page: the verbs that cost the user the most mistakes, with a one-click practice quiz. */
export default function WeakVerbs() {
  const { data, isLoading, error } = useGetWeakVerbsQuery({ limit: 8 })
  const [generate, { isLoading: starting }] = useGenerateIrregularVerbsQuizMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const { token } = theme.useToken()

  const practice = async () => {
    try {
      const quiz = await generate({ count: 10, onlyWeak: true }).unwrap()
      navigate(`/quizzes/${quiz.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <Card
      title="Najtrudniejsze dla Ciebie"
      extra={
        data && data.length > 0 ? (
          <Button type="primary" icon={<AimOutlined />} loading={starting} onClick={() => void practice()}>
            Ćwicz te czasowniki
          </Button>
        ) : null
      }
    >
      {error ? (
        <Alert type="error" showIcon title={errorMessage(error)} />
      ) : isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : data.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Ćwicz więcej, aby zobaczyć analizę: czasownik pojawi się tutaj po co najmniej 3 odpowiedziach i dużej liczbie błędów."
        />
      ) : (
        <Flex vertical gap={12}>
          {data.map(({ verb, attempts, correct, accuracy }) => (
            <Flex key={verb.id} align="center" gap={14} wrap>
              <Flex vertical style={{ flex: '1 1 220px', minWidth: 0 }}>
                <Flex align="center" gap={8}>
                  <Typography.Text lang="en" strong style={{ fontSize: 18 }}>
                    {verb.base}
                  </Typography.Text>
                  <SpeakButton speakKey={`weak-${verb.id}`} parts={[verb.base, ...verb.pastSimple, ...verb.pastParticiple]} size="small" />
                </Flex>
                <Typography.Text lang="en" type="secondary" style={{ fontSize: 15 }}>
                  {formsText(verb.pastSimple)} · {formsText(verb.pastParticiple)}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                  {verb.meanings.join(', ')}
                </Typography.Text>
              </Flex>
              <Flex vertical gap={2} style={{ flex: '1 1 160px', minWidth: 140 }}>
                <Progress
                  percent={Math.round(accuracy * 100)}
                  size="small"
                  strokeColor={accuracy < 0.4 ? token.colorError : token.colorWarning}
                  style={{ margin: 0 }}
                />
                <Tag style={{ alignSelf: 'flex-start' }}>
                  {correct} z {attempts} poprawnie
                </Tag>
              </Flex>
            </Flex>
          ))}
        </Flex>
      )}
    </Card>
  )
}
