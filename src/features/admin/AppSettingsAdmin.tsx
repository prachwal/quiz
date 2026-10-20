import { Alert, Button, Card, Flex, Form, InputNumber, Tag, Typography, App as AntdApp, theme } from 'antd'
import { useEffect } from 'react'
import { errorMessage } from '../../app/api'
import { useGetAppSettingsQuery, useUpdateAppSettingsMutation } from './api'
import { DEFAULT_SCORE_THRESHOLDS, scoreBand } from '../../shared/quiz/scoreBands'
import type { ScoreThresholds } from '../../shared/quiz/scoreBands'

const SAMPLES = [30, 50, 65, 80, 95]
const TAG = { low: 'error', mid: 'warning', high: 'success' } as const

/** Global settings (admin): the score thresholds that colour results red / orange / green for everybody. */
export default function AppSettingsAdmin() {
  const { data, error, isLoading } = useGetAppSettingsQuery()
  const [save, { isLoading: saving }] = useUpdateAppSettingsMutation()
  const [form] = Form.useForm<ScoreThresholds>()
  const { message } = AntdApp.useApp()
  const { token } = theme.useToken()
  const low = Form.useWatch('low', form) ?? data?.scoreThresholds.low ?? DEFAULT_SCORE_THRESHOLDS.low
  const high = Form.useWatch('high', form) ?? data?.scoreThresholds.high ?? DEFAULT_SCORE_THRESHOLDS.high

  useEffect(() => {
    if (data) form.setFieldsValue(data.scoreThresholds)
  }, [data, form])

  const submit = async (values: ScoreThresholds) => {
    try {
      await save({ scoreThresholds: values }).unwrap()
      void message.success('Zapisano. Nowe kolory zobaczą wszyscy użytkownicy.')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <Card title="Kolory wyników" loading={isLoading}>
      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      <Typography.Paragraph type="secondary">
        Wynik procentowy jest <Typography.Text style={{ color: token.colorError }}>czerwony</Typography.Text> poniżej progu
        czerwonego, <Typography.Text style={{ color: token.colorWarning }}>pomarańczowy</Typography.Text> poniżej progu
        zielonego i <Typography.Text style={{ color: token.colorSuccess }}>zielony</Typography.Text> od progu zielonego. Ustawienie
        obowiązuje globalnie (historia wyników, podgląd ucznia, raport klasy, wynik po quizie).
      </Typography.Paragraph>
      <Form<ScoreThresholds> form={form} layout="inline" onFinish={submit} initialValues={DEFAULT_SCORE_THRESHOLDS} style={{ rowGap: 12 }}>
        <Form.Item name="low" label="Czerwony poniżej" rules={[{ required: true, type: 'integer', min: 1, max: 100, message: '1–100' }]}>
          <InputNumber min={1} max={100} suffix="%" style={{ width: 110 }} />
        </Form.Item>
        <Form.Item
          name="high"
          label="Zielony od"
          dependencies={['low']}
          rules={[
            { required: true, type: 'integer', min: 1, max: 100, message: '1–100' },
            ({ getFieldValue }) => ({
              validator: (_r, v: number) =>
                v > getFieldValue('low') ? Promise.resolve() : Promise.reject(new Error('Musi być wyższy niż próg czerwony')),
            }),
          ]}
        >
          <InputNumber min={1} max={100} suffix="%" style={{ width: 110 }} />
        </Form.Item>
        <Form.Item>
          <Flex gap={8}>
            <Button type="primary" htmlType="submit" loading={saving}>
              Zapisz
            </Button>
            <Button onClick={() => form.setFieldsValue(DEFAULT_SCORE_THRESHOLDS)}>
              Domyślne ({DEFAULT_SCORE_THRESHOLDS.low} / {DEFAULT_SCORE_THRESHOLDS.high})
            </Button>
          </Flex>
        </Form.Item>
      </Form>
      <Flex gap={6} wrap align="center" style={{ marginTop: 16 }}>
        <Typography.Text type="secondary">Podgląd:</Typography.Text>
        {SAMPLES.map((p) => (
          <Tag key={p} color={TAG[scoreBand(p, low < high ? { low, high } : DEFAULT_SCORE_THRESHOLDS)]}>
            {p}%
          </Tag>
        ))}
      </Flex>
    </Card>
  )
}
