import { Input, Typography } from 'antd'
import type { ReactNode } from 'react'
import type { Answer, QuestionType } from '../../shared/quiz/engine'
import type { QuizQuestion } from '../../shared/quiz/types'
import ChoiceTile, { LETTERS } from './ChoiceTile'

interface RendererProps {
  question: QuizQuestion
  value: Answer | undefined
  onChange: (value: Answer) => void
}

const single = ({ question, value, onChange }: RendererProps) => (
  <div className="choice-grid" role="radiogroup">
    {question.options.map((option, i) => (
      <ChoiceTile
        key={option.id}
        kind="radio"
        label={LETTERS[i]}
        text={option.text}
        selected={value?.optionIds?.[0] === option.id}
        onClick={() => onChange({ optionIds: [option.id] })}
      />
    ))}
  </div>
)

const multiple = ({ question, value, onChange }: RendererProps) => {
  const selected = value?.optionIds ?? []
  const toggle = (id: string) =>
    onChange({ optionIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] })
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 15 }}>
        Wybierz wszystkie poprawne odpowiedzi.
      </Typography.Paragraph>
      <div className="choice-grid" role="group">
        {question.options.map((option, i) => (
          <ChoiceTile
            key={option.id}
            kind="checkbox"
            label={LETTERS[i]}
            text={option.text}
            selected={selected.includes(option.id)}
            onClick={() => toggle(option.id)}
          />
        ))}
      </div>
    </>
  )
}

const text = ({ value, onChange }: RendererProps) => (
  <Input
    size="large"
    placeholder="Twoja odpowiedź"
    autoFocus
    // phone keyboards: no auto-capitalisation / autocorrect turning "learnt" into "Learned"
    autoCapitalize="none"
    autoCorrect="off"
    autoComplete="off"
    spellCheck={false}
    value={value?.text ?? ''}
    onChange={(e) => onChange({ text: e.target.value })}
    style={{ fontSize: 20, paddingBlock: 10 }}
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
