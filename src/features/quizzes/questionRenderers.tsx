import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import { Button, Flex, Input, Typography } from 'antd'
import type { ReactNode } from 'react'
import { orderingItems } from '../../shared/quiz/engine'
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

const numeric = ({ value, onChange }: RendererProps) => (
  <Input
    size="large"
    placeholder="Twoja odpowiedź (np. 3,5 albo 1/2)"
    inputMode="decimal"
    autoComplete="off"
    value={value?.text ?? ''}
    onChange={(e) => onChange({ text: e.target.value })}
    style={{ fontSize: 20, paddingBlock: 10, maxWidth: 320 }}
  />
)

const ordering = ({ question, value, onChange }: RendererProps) => {
  const items = orderingItems(question.config)
  const order = value?.order?.length ? value.order : items.map((item) => item.id)
  const textOf = (id: string) => items.find((item) => item.id === id)?.text ?? ''
  // up/down buttons instead of drag & drop: HTML5 DnD does not work on touch screens
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange({ order: next })
  }

  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 15 }}>
        Ustaw elementy we właściwej kolejności.
      </Typography.Paragraph>
      <Flex vertical gap={8} role="list">
        {order.map((id, i) => (
          <Flex
            key={id}
            role="listitem"
            align="center"
            gap={12}
            style={{ padding: '8px 12px', border: '1px solid var(--ant-color-border)', borderRadius: 10 }}
          >
            <Typography.Text strong style={{ minWidth: 24, fontSize: 16 }}>
              {i + 1}.
            </Typography.Text>
            <Typography.Text style={{ flex: 1, fontSize: 17, wordBreak: 'break-word' }}>{textOf(id)}</Typography.Text>
            <Button
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={i === 0}
              aria-label={`Przenieś wyżej: ${textOf(id)}`}
              onClick={() => move(i, i - 1)}
            />
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={i === order.length - 1}
              aria-label={`Przenieś niżej: ${textOf(id)}`}
              onClick={() => move(i, i + 1)}
            />
          </Flex>
        ))}
      </Flex>
    </>
  )
}

/** Player-side input for each question type (counterpart of `questionTypes` in the engine). */
export const questionRenderers: Record<QuestionType, (props: RendererProps) => ReactNode> = {
  single,
  multiple,
  truefalse: single,
  text,
  numeric,
  ordering,
}

// the rule lives in the engine, so every answer shape (order, pairs, gaps) counts as answered
export { isAnswered } from '../../shared/quiz/engine'
