import { Form, InputNumber, Segmented, Space, Typography } from 'antd'
import type { QuestionType } from '../../shared/quiz/engine'

export interface NumericConfigValue {
  answer: number
  tolerance?: { kind: 'absolute' | 'relative'; value: number }
}

interface Props {
  type: QuestionType
  value?: unknown
  onChange?: (value: unknown) => void
}

const asNumeric = (value: unknown): NumericConfigValue => {
  const config = (value ?? {}) as Partial<NumericConfigValue>
  return {
    answer: typeof config.answer === 'number' ? config.answer : 0,
    tolerance: config.tolerance ?? { kind: 'absolute', value: 0 },
  }
}

/**
 * Editor for question types that do not use the options table. Only `numeric` exists for now;
 * new types add their own branch here (counterpart of `defaultConfig` in the engine).
 */
export default function ConfigEditor({ type, value, onChange }: Props) {
  if (type !== 'numeric') return null
  const config = asNumeric(value)
  const patch = (next: Partial<NumericConfigValue>) => onChange?.({ ...config, ...next })

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap align="end">
        <Form.Item label="Poprawna odpowiedź" style={{ marginBottom: 0 }}>
          <InputNumber
            style={{ width: 200 }}
            value={config.answer}
            onChange={(next) => patch({ answer: typeof next === 'number' ? next : 0 })}
          />
        </Form.Item>
        <Form.Item label="Tolerancja" style={{ marginBottom: 0 }}>
          <Space.Compact>
            <InputNumber
              style={{ width: 120 }}
              min={0}
              value={config.tolerance?.value ?? 0}
              onChange={(next) => patch({ tolerance: { kind: config.tolerance?.kind ?? 'absolute', value: typeof next === 'number' ? next : 0 } })}
            />
            <Segmented
              value={config.tolerance?.kind ?? 'absolute'}
              onChange={(kind) => patch({ tolerance: { kind: kind as 'absolute' | 'relative', value: config.tolerance?.value ?? 0 } })}
              options={[
                { value: 'absolute', label: 'bezwzględna' },
                { value: 'relative', label: 'względna' },
              ]}
            />
          </Space.Compact>
        </Form.Item>
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 14 }}>
        Gracz może wpisać przecinek lub kropkę, ułamek (1/2) albo notację wykładniczą (1e3). Tolerancja
        względna 0,01 oznacza 1%. Jednostkę wpisz w treści pytania.
      </Typography.Text>
    </Space>
  )
}
