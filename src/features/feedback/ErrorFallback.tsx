import { BugOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Result, Space, Typography, App as AntdApp } from 'antd'
import { useAppDispatch } from '../../app/hooks'
import PublicShell from '../auth/PublicShell'
import FeedbackModal from './FeedbackModal'
import { openFeedback } from './feedbackSlice'

/** Shown by the top-level error boundary instead of a blank page. */
export default function ErrorFallback({ eventId }: { eventId: string }) {
  const dispatch = useAppDispatch()
  return (
    <PublicShell>
      <AntdApp>
        <Result
          status="error"
          title="Coś poszło nie tak"
          subTitle={
            <>
              Błąd został zarejestrowany. Odśwież stronę, a jeśli problem wraca, zgłoś go nam.
              {eventId && (
                <Typography.Paragraph type="secondary" copyable={{ text: eventId }} style={{ marginTop: 8 }}>
                  Kod błędu: {eventId.slice(0, 8)}
                </Typography.Paragraph>
              )}
            </>
          }
          extra={
            <Space wrap style={{ justifyContent: 'center' }}>
              <Button type="primary" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
                Odśwież stronę
              </Button>
              <Button icon={<BugOutlined />} onClick={() => dispatch(openFeedback({ kind: 'bug', sentryEventId: eventId || undefined }))}>
                Zgłoś problem
              </Button>
            </Space>
          }
        />
        <FeedbackModal />
      </AntdApp>
    </PublicShell>
  )
}
