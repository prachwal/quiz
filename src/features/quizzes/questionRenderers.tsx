/* oxlint-disable react/only-export-components -- this module is a registry: it exports the
   components, the `questionRenderers` map and the `isAnswered` rule, and fast refresh falling
   back to a full reload here is fine. */
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import { Button, Flex, Input, Tag, Typography } from 'antd'
import { useState } from 'react'
import type { ComponentType } from 'react'
import { matchingLefts, matchingRights, orderingItems, clozeGapCount, clozeParts, CLOZE_MARKER } from '../../shared/quiz/engine'
import type { Answer, QuestionType } from '../../shared/quiz/engine'
import type { QuizQuestion } from '../../shared/quiz/types'
import ChoiceTile, { LETTERS } from './ChoiceTile'

export interface RendererProps {
  question: QuizQuestion
  value: Answer | undefined
  onChange: (value: Answer) => void
}

const Single = ({ question, value, onChange }: RendererProps) => (
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

const Multiple = ({ question, value, onChange }: RendererProps) => {
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

const TextAnswer = ({ value, onChange }: RendererProps) => (
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

const Numeric = ({ value, onChange }: RendererProps) => (
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

const Ordering = ({ question, value, onChange }: RendererProps) => {
  const items = orderingItems(question.config)
  // until the player moves something, the list shows the server arrangement (not yet an answer)
  const answered = Boolean(value?.order?.length)
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
      {!answered && (
        <Button style={{ marginTop: 12 }} onClick={() => onChange({ order: items.map((item) => item.id) })}>
          Zostaw w tej kolejności
        </Button>
      )}
    </>
  )
}

/** Two columns; on a phone the player taps a left item and then its right counterpart. */
const Matching = ({ question, value, onChange }: RendererProps) => {
  const lefts = matchingLefts(question.config)
  const rights = matchingRights(question.config)
  const pairs = value?.pairs ?? {}
  const [selected, setSelected] = useState<string | null>(null)
  const ownerOf = (rightId: string) => Object.entries(pairs).find(([, chosen]) => chosen === rightId)?.[0]
  const textOfRight = (rightId: string | undefined) => rights.find((right) => right.id === rightId)?.text

  const assign = (rightId: string) => {
    if (!selected) return
    const next = { ...pairs }
    // a tile belongs to one left side only, so taking it away moves it here
    for (const [leftId, chosen] of Object.entries(next)) if (chosen === rightId) delete next[leftId]
    next[selected] = rightId
    onChange({ pairs: next })
    setSelected(null)
  }

  const clear = (leftId: string) => {
    const next = { ...pairs }
    delete next[leftId]
    onChange({ pairs: next })
  }

  const tileStyle = (active: boolean, dimmed: boolean) => ({
    display: 'block',
    width: '100%',
    height: 'auto',
    minHeight: 48,
    padding: '10px 12px',
    textAlign: 'left' as const,
    whiteSpace: 'normal' as const,
    borderColor: active ? 'var(--ant-color-primary)' : undefined,
    borderWidth: active ? 2 : 1,
    opacity: dimmed ? 0.55 : 1,
  })

  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 15 }}>
        {selected ? 'Wybierz pasujący element po prawej stronie.' : 'Wybierz element po lewej, potem jego odpowiednik.'}
      </Typography.Paragraph>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Flex vertical gap={8} role="group" aria-label="Elementy do dopasowania">
          {lefts.map((left) => {
            const chosen = pairs[left.id]
            const active = selected === left.id
            return (
              <Button
                key={left.id}
                onClick={() => setSelected(active ? null : left.id)}
                aria-pressed={active}
                style={tileStyle(active, false)}
              >
                <Flex vertical gap={2} align="start">
                  <span style={{ fontSize: 16 }}>{left.text}</span>
                  {chosen ? (
                    <Flex gap={6} align="center">
                      <Typography.Text type="success" style={{ fontSize: 14 }}>
                        {textOfRight(chosen)}
                      </Typography.Text>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Usuń dopasowanie: ${left.text}`}
                        style={{ cursor: 'pointer', padding: '0 4px', fontSize: 16 }}
                        onClick={(event) => {
                          event.stopPropagation()
                          clear(left.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.stopPropagation()
                          clear(left.id)
                        }}
                      >
                        ×
                      </span>
                    </Flex>
                  ) : null}
                </Flex>
              </Button>
            )
          })}
        </Flex>
        <Flex vertical gap={8} role="group" aria-label="Dopasowania">
          {rights.map((right) => {
            const owner = ownerOf(right.id)
            return (
              <Button
                key={right.id}
                onClick={() => assign(right.id)}
                disabled={!selected && !owner}
                style={tileStyle(false, Boolean(owner) && owner !== selected)}
              >
                <Flex justify="space-between" align="center" gap={8} style={{ width: '100%' }}>
                  <span style={{ fontSize: 16 }}>{right.text}</span>
                  {owner ? <Tag style={{ marginInlineEnd: 0 }}>zajęte</Tag> : null}
                </Flex>
              </Button>
            )
          })}
        </Flex>
      </div>
    </>
  )
}

/** Fills the `{{n}}` markers of the prompt with inputs; no HTML injection. */
const Cloze = ({ question, value, onChange }: RendererProps) => {
  const answerFor = (gap: string) => value?.gaps?.[gap] ?? ''
  const setGap = (gap: string) => (text: string) => onChange({ gaps: { ...(value?.gaps ?? {}), [gap]: text } })
  const gaps = clozeGapCount(question.config)
  // one canonical marker definition, shared with validation and the review view
  const parts = clozeParts(question.prompt)

  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 15 }}>
        Uzupełnij {gaps === 1 ? 'lukę' : `${gaps} luki`}.
      </Typography.Paragraph>
      <div style={{ fontSize: 'clamp(20px, 2vw + 10px, 26px)', lineHeight: 2.2 }}>
        {parts.map((part, i) => {
          const marker = CLOZE_MARKER.exec(part)
          if (!marker) return <span key={i}>{part}</span>
          const gap = marker[1]
          return (
            <Input
              key={i}
              size="small"
              value={answerFor(gap)}
              placeholder={`${gap}`}
              aria-label={`Luka ${gap}`}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setGap(gap)(e.target.value)}
              style={{ width: 150, margin: '0 6px', fontSize: 17 }}
            />
          )
        })}
      </div>
    </>
  )
}

/** Player-side input for each question type (counterpart of `questionTypes` in the engine). */
export const questionRenderers: Record<QuestionType, ComponentType<RendererProps>> = {
  single: Single,
  multiple: Multiple,
  truefalse: Single,
  text: TextAnswer,
  numeric: Numeric,
  ordering: Ordering,
  matching: Matching,
  cloze: Cloze,
}

// the rule lives in the engine, so every answer shape (order, pairs, gaps) counts as answered
export { isAnswered } from '../../shared/quiz/engine'
