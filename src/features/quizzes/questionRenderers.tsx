import { Checkbox, Input, Radio, Space } from 'antd'
import type { ReactNode } from 'react'
import type { Answer, QuestionType } from '../../shared/quiz/engine'
import type { QuizQuestion } from '../../shared/quiz/types'

interface RendererProps {
  question: QuizQuestion
  value: Answer | undefined
  onChange: (value: Answer) => void
}

const choiceStyle = { display: 'flex', width: '100%' }

const single = ({ question, value, onChange }: RendererProps) => (
  <Radio.Group
    value={value?.optionIds?.[0]}
    onChange={(e) => onChange({ optionIds: [e.target.value as string] })}
    style={{ width: '100%' }}
  >
    <Space orientation="vertical" style={{ width: '100%' }}>
      {question.options.map((option) => (
        <Radio key={option.id} value={option.id} style={choiceStyle}>
          {option.text}
        </Radio>
      ))}
    </Space>
  </Radio.Group>
)

const multiple = ({ question, value, onChange }: RendererProps) => (
  <Checkbox.Group
    value={value?.optionIds ?? []}
    onChange={(ids) => onChange({ optionIds: ids as string[] })}
    style={{ width: '100%' }}
  >
    <Space orientation="vertical" style={{ width: '100%' }}>
      {question.options.map((option) => (
        <Checkbox key={option.id} value={option.id} style={choiceStyle}>
          {option.text}
        </Checkbox>
      ))}
    </Space>
  </Checkbox.Group>
)

const text = ({ value, onChange }: RendererProps) => (
  <Input
    size="large"
    placeholder="Twoja odpowiedź"
    value={value?.text ?? ''}
    onChange={(e) => onChange({ text: e.target.value })}
  />
)

/** Player-side input for each question type (counterpart of `questionTypes` in the engine). */
export const questionRenderers: Record<QuestionType, (props: RendererProps) => ReactNode> = {
  single,
  multiple,
  truefalse: single,
  text,
}

export const isAnswered = (answer: Answer | undefined) =>
  Boolean(answer?.optionIds?.length || answer?.text?.trim())
