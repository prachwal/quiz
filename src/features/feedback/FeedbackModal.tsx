import { Alert, Form, Input, Modal, Radio, Typography, App as AntdApp } from 'antd'
import { useEffect } from 'react'
import { errorMessage, useSendFeedbackMutation } from '../../app/api'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { getLastRequestId } from '../../app/errorTracking'
import { Sentry, sentryEnabled } from '../../app/sentry'
import { useAuth } from '../auth/useAuth'
import type { FeedbackKind } from '../../shared/quiz/types'
import { closeFeedback } from './feedbackSlice'

interface Values {
  kind: FeedbackKind
  message: string
}

const KINDS = [
  { value: 'bug', label: 'Błąd' },
  { value: 'idea', label: 'Pomysł' },
  { value: 'other', label: 'Inne' },
]

/** Diagnostics sent with every report (no tokens, no personal data beyond the signed-in user). */
const diagnostics = (sentryEventId?: string) => ({
  route: window.location.pathname,
  appVersion: __APP_VERSION__,
  userAgent: navigator.userAgent,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  theme: document.documentElement.dataset.theme,
  sentryEventId: sentryEventId ?? (sentryEnabled ? Sentry.lastEventId() : undefined),
  requestId: getLastRequestId(),
})

export default function FeedbackModal() {
  const { open, kind, sentryEventId } = useAppSelector((state) => state.feedbackUi)
  const dispatch = useAppDispatch()
  const [form] = Form.useForm<Values>()
  const [send, { isLoading }] = useSendFeedbackMutation()
  const { message } = AntdApp.useApp()
  const { user } = useAuth()

  useEffect(() => {
    if (open) form.setFieldsValue({ kind })
  }, [open, kind, form])

  const submit = async (values: Values) => {
    const context = diagnostics(sentryEventId)
    try {
      await send({
        ...values,
        userLabel: user?.email ?? user?.name,
        context,
      }).unwrap()
      if (sentryEnabled) {
        Sentry.captureFeedback({ message: values.message, associatedEventId: context.sentryEventId })
      }
      void message.success('Dziękujemy za uwagę!')
      form.resetFields()
      dispatch(closeFeedback())
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <Modal
      open={open}
      title="Zgłoś uwagę"
      okText="Wyślij"
      cancelText="Anuluj"
      confirmLoading={isLoading}
      onOk={() => form.submit()}
      onCancel={() => dispatch(closeFeedback())}
      destroyOnHidden
      forceRender
    >
      <Form form={form} layout="vertical" initialValues={{ kind }} onFinish={submit}>
        {sentryEventId && (
          <Alert
            type="info"
            showIcon
            title="Dołączymy informacje o błędzie, który się wydarzył."
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item name="kind" label="Rodzaj">
          <Radio.Group optionType="button" buttonStyle="solid" options={KINDS} />
        </Form.Item>
        <Form.Item
          name="message"
          label="Twoja uwaga"
          rules={[
            { required: true, whitespace: true, message: 'Opisz uwagę' },
            { min: 3, message: 'Min. 3 znaki' },
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} maxLength={2000} showCount placeholder="Co się stało lub co możemy poprawić?" />
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Do zgłoszenia dołączamy adres strony, wersję aplikacji, przeglądarkę i rozmiar ekranu.
        </Typography.Text>
      </Form>
    </Modal>
  )
}
