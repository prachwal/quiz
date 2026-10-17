import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Checkbox, Input, Radio, Space } from 'antd'
import type { DraftOption, QuestionType } from '../../shared/quiz/engine'

interface Props {
  type: QuestionType
  value?: DraftOption[]
  onChange?: (value: DraftOption[]) => void
}

/** Controlled editor for a question's options; its UI depends on the question type. */
export default function OptionsEditor({ type, value = [], onChange }: Props) {
  const update = (index: number, patch: Partial<DraftOption>) =>
    onChange?.(value.map((option, i) => (i === index ? { ...option, ...patch } : option)))

  const markCorrect = (index: number, checked: boolean) => {
    if (type === 'multiple') update(index, { isCorrect: checked })
    else onChange?.(value.map((option, i) => ({ ...option, isCorrect: i === index })))
  }

  const add = () => onChange?.([...value, { text: '', isCorrect: type === 'text' }])
  const remove = (index: number) => onChange?.(value.filter((_option, i) => i !== index))

  if (type === 'truefalse') {
    const correct = value.findIndex((o) => o.isCorrect)
    return (
      <Radio.Group
        value={correct}
        onChange={(e) => markCorrect(e.target.value as number, true)}
        options={value.map((option, index) => ({ label: option.text, value: index }))}
      />
    )
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      {value.map((option, index) => (
        <Space.Compact key={index} style={{ width: '100%' }}>
          {type !== 'text' && (
            <Space style={{ padding: '0 12px' }}>
              {type === 'multiple' ? (
                <Checkbox
                  checked={option.isCorrect}
                  onChange={(e) => markCorrect(index, e.target.checked)}
                  aria-label="Poprawna"
                />
              ) : (
                <Radio
                  checked={option.isCorrect}
                  onChange={() => markCorrect(index, true)}
                  aria-label="Poprawna"
                />
              )}
            </Space>
          )}
          <Input
            value={option.text}
            placeholder={type === 'text' ? 'Akceptowana odpowiedź' : `Opcja ${index + 1}`}
            onChange={(e) => update(index, { text: e.target.value })}
          />
          <Button
            icon={<DeleteOutlined />}
            disabled={value.length <= (type === 'text' ? 1 : 2)}
            onClick={() => remove(index)}
            aria-label="Usuń opcję"
          />
        </Space.Compact>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={add} block>
        {type === 'text' ? 'Dodaj akceptowaną odpowiedź' : 'Dodaj opcję'}
      </Button>
    </Space>
  )
}
