import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Flex, Form, Input, InputNumber, Segmented, Select, Space, Typography } from 'antd'
import { newItemId, promptText } from '../../shared/quiz/engine'
import type { ClozeConfig, MatchingConfig, MatchingPair, OrderingConfig, OrderingItem, QuestionType } from '../../shared/quiz/engine'

export interface NumericConfigValue {
  answer: number
  tolerance?: { kind: 'absolute' | 'relative'; value: number }
}

interface Props {
  type: QuestionType
  value?: unknown
  onChange?: (value: unknown) => void
  /** Current prompt (cloze: the marker list must match the gap list). */
  prompt?: string
  onPromptChange?: (prompt: string) => void
}

const asNumeric = (value: unknown): NumericConfigValue => {
  const config = (value ?? {}) as Partial<NumericConfigValue>
  return {
    answer: typeof config.answer === 'number' ? config.answer : 0,
    tolerance: config.tolerance ?? { kind: 'absolute', value: 0 },
  }
}

const asOrdering = (value: unknown): OrderingConfig => {
  const config = (value ?? {}) as Partial<OrderingConfig>
  const items = Array.isArray(config.items) ? config.items : []
  return {
    items: items
      .filter((item): item is OrderingItem => Boolean(item) && typeof item === 'object')
      .map((item) => ({ id: item.id || newItemId(), text: typeof item.text === 'string' ? item.text : '' })),
  }
}

const asMatching = (value: unknown): MatchingConfig => {
  const config = (value ?? {}) as Partial<MatchingConfig>
  const pairs = Array.isArray(config.pairs) ? config.pairs : []
  return {
    pairs: pairs
      .filter((pair): pair is MatchingPair => Boolean(pair) && typeof pair === 'object')
      .map((pair) => ({
        id: pair.id || newItemId(),
        rightId: pair.rightId || newItemId(),
        left: typeof pair.left === 'string' ? pair.left : '',
        right: typeof pair.right === 'string' ? pair.right : '',
      })),
  }
}

const asCloze = (value: unknown): ClozeConfig => {
  const config = (value ?? {}) as Partial<ClozeConfig>
  const gaps = Array.isArray(config.gaps) ? config.gaps : []
  return {
    gaps: gaps
      .filter((gap) => Boolean(gap) && typeof gap === 'object')
      .map((gap) => ({ answers: Array.isArray(gap.answers) ? gap.answers.filter((a) => typeof a === 'string') : [] })),
  }
}

function NumericEditor({ value, onChange }: Omit<Props, 'type'>) {
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
              onChange={(next) =>
                patch({
                  tolerance: { kind: config.tolerance?.kind ?? 'absolute', value: typeof next === 'number' ? next : 0 },
                })
              }
            />
            <Segmented
              value={config.tolerance?.kind ?? 'absolute'}
              onChange={(kind) =>
                patch({ tolerance: { kind: kind as 'absolute' | 'relative', value: config.tolerance?.value ?? 0 } })
              }
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

function OrderingEditor({ value, onChange }: Omit<Props, 'type'>) {
  const { items } = asOrdering(value)
  const emit = (next: OrderingItem[]) => onChange?.({ items: next })
  const patch = (index: number, text: string) => emit(items.map((item, i) => (i === index ? { ...item, text } : item)))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    emit(next)
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Typography.Text type="secondary" style={{ fontSize: 14 }}>
        Wpisz elementy w kolejności poprawnej odpowiedzi. Gracz zobaczy je potasowane i ułoży sam.
      </Typography.Text>
      <Flex vertical gap={8}>
        {items.map((item, i) => (
          <Flex key={item.id} align="center" gap={8}>
            <Typography.Text strong style={{ minWidth: 24 }}>
              {i + 1}.
            </Typography.Text>
            <Input
              value={item.text}
              maxLength={500}
              placeholder="Treść elementu"
              onChange={(e) => patch(i, e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              icon={<ArrowUpOutlined />}
              disabled={i === 0}
              aria-label={`Przenieś wyżej: ${item.text || i + 1}`}
              onClick={() => move(i, i - 1)}
            />
            <Button
              icon={<ArrowDownOutlined />}
              disabled={i === items.length - 1}
              aria-label={`Przenieś niżej: ${item.text || i + 1}`}
              onClick={() => move(i, i + 1)}
            />
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              disabled={items.length <= 2}
              aria-label={`Usuń element ${i + 1}`}
              onClick={() => emit(items.filter((_, index) => index !== i))}
            />
          </Flex>
        ))}
      </Flex>
      <Button icon={<PlusOutlined />} disabled={items.length >= 50} onClick={() => emit([...items, { id: newItemId(), text: '' }])}>
        Dodaj element
      </Button>
    </Space>
  )
}

function MatchingEditor({ value, onChange }: Omit<Props, 'type'>) {
  const { pairs } = asMatching(value)
  const emit = (next: MatchingPair[]) => onChange?.({ pairs: next })
  const patch = (index: number, side: 'left' | 'right', text: string) =>
    emit(pairs.map((pair, i) => (i === index ? { ...pair, [side]: text } : pair)))

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Typography.Text type="secondary" style={{ fontSize: 14 }}>
        Lewa i prawa strona każdej pary. Gracz dostanie prawą kolumnę potasowaną, bez powiązań.
      </Typography.Text>
      <Flex vertical gap={8}>
        {pairs.map((pair, i) => (
          <Flex key={pair.id} align="center" gap={8}>
            <Typography.Text strong style={{ minWidth: 24 }}>
              {i + 1}.
            </Typography.Text>
            <Input
              value={pair.left}
              maxLength={200}
              placeholder="Lewa strona"
              onChange={(e) => patch(i, 'left', e.target.value)}
              style={{ flex: 1 }}
            />
            <Typography.Text type="secondary">→</Typography.Text>
            <Input
              value={pair.right}
              maxLength={200}
              placeholder="Prawa strona"
              onChange={(e) => patch(i, 'right', e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              disabled={pairs.length <= 2}
              aria-label={`Usuń parę ${i + 1}`}
              onClick={() => emit(pairs.filter((_, index) => index !== i))}
            />
          </Flex>
        ))}
      </Flex>
      <Button
        icon={<PlusOutlined />}
        disabled={pairs.length >= 20}
        onClick={() => emit([...pairs, { id: newItemId(), rightId: newItemId(), left: '', right: '' }])}
      >
        Dodaj parę
      </Button>
    </Space>
  )
}

function ClozeEditor({ value, onChange, prompt = '', onPromptChange }: Omit<Props, 'type'>) {
  const { gaps } = asCloze(value)
  const emit = (next: ClozeConfig['gaps']) => onChange?.({ gaps: next })
  // a comma is part of an answer ("Hello, world"), so it must not split the input; trim, drop blanks
  // and drop duplicates (case-insensitive, first one wins) so the limits from validate() are met
  const cleanAnswers = (answers: string[]) => {
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const answer of answers) {
      const text = answer.trim()
      if (!text || seen.has(text.toLocaleLowerCase())) continue
      seen.add(text.toLocaleLowerCase())
      cleaned.push(text)
    }
    return cleaned
  }
  const setAnswers = (index: number, answers: string[]) =>
    emit(gaps.map((gap, i) => (i === index ? { answers: cleanAnswers(answers) } : gap)))

  const addGap = () => {
    const next = gaps.length + 1
    emit([...gaps, { answers: [] }])
    // the marker goes at the end of the prompt; the author can move it in the text
    onPromptChange?.(`${prompt}${prompt && !prompt.endsWith(' ') ? ' ' : ''}{{${next}}}`)
  }

  const removeLast = () => {
    if (!gaps.length) return
    const last = gaps.length
    emit(gaps.slice(0, -1))
    onPromptChange?.(prompt.replace(new RegExp(`\\s*\\{\\{${last}\\}\\}`), ''))
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Typography.Text type="secondary" style={{ fontSize: 14 }}>
        W treści pytania wstaw znaczniki <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>… - w ich miejscu gracz
        dostanie pole do wpisania. Kilka akceptowanych wariantów dodaj jako osobne pozycje (np. learnt i learned).
      </Typography.Text>
      {prompt ? (
        <Typography.Text type="secondary" style={{ fontSize: 14 }}>
          Podgląd: {promptText(prompt)}
        </Typography.Text>
      ) : null}
      <Flex vertical gap={8}>
        {gaps.map((gap, i) => (
          <Flex key={i} align="center" gap={8}>
            <Typography.Text strong style={{ minWidth: 64 }}>
              {`{{${i + 1}}}`}
            </Typography.Text>
            <Select
              mode="tags"
              value={gap.answers}
              placeholder="Akceptowane odpowiedzi (Enter po każdej)"
              onChange={(answers: string[]) => setAnswers(i, answers)}
              style={{ flex: 1 }}
            />
          </Flex>
        ))}
      </Flex>
      <Space>
        <Button icon={<PlusOutlined />} disabled={gaps.length >= 8} onClick={addGap}>
          Wstaw lukę
        </Button>
        <Button danger type="text" icon={<DeleteOutlined />} disabled={gaps.length <= 1} onClick={removeLast}>
          Usuń ostatnią lukę
        </Button>
      </Space>
    </Space>
  )
}

/**
 * Editor for question types that do not use the options table (counterpart of `defaultConfig`
 * in the engine). New types add their own branch here.
 */
export default function ConfigEditor({ type, value, onChange, prompt, onPromptChange }: Props) {
  if (type === 'numeric') return <NumericEditor value={value} onChange={onChange} />
  if (type === 'ordering') return <OrderingEditor value={value} onChange={onChange} />
  if (type === 'matching') return <MatchingEditor value={value} onChange={onChange} />
  if (type === 'cloze') {
    return <ClozeEditor value={value} onChange={onChange} prompt={prompt} onPromptChange={onPromptChange} />
  }
  return null
}
