import { Flex, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import type { ReactNode } from 'react'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import { DifficultyTag, PopularityTag } from '../../components/GroupTags'
import type { IrregularVerb } from '../../shared/quiz/types'
import SpeakButton from '../audio/SpeakButton'
import { MediaImage } from '../media/MediaImage'
import { verbSpeechParts } from '../audio/speech'
import { PATTERN_HINTS, formsText } from './format'

/** A small illustration of a verb (alt = its base form); nothing for a verb without an image. */
function VerbThumb({ verb }: { verb: IrregularVerb }) {
  if (!verb.imageMediaId) return null
  return (
    <span className="verb-table-thumb">
      <MediaImage mediaId={verb.imageMediaId} alt={verb.base} />
    </span>
  )
}

/** Shown after the base form only when the list has at least one illustration (image-free lists stay as they were). */
const pictureColumn: TableColumnsType<IrregularVerb>[number] = {
  title: '',
  key: 'picture',
  width: 72,
  render: (_v, verb) => <VerbThumb verb={verb} />,
}

/** Optional extra tag per verb, supplied by the route (e.g. the weak-verb mark). */
type BadgeSlot = (verbId: number) => ReactNode

const verbColumns = (renderBadge?: BadgeSlot): TableColumnsType<IrregularVerb> => [
  {
    title: 'Bezokolicznik',
    dataIndex: 'base',
    sorter: (a, b) => a.base.localeCompare(b.base),
    render: (value: string) => <Typography.Text strong style={{ fontSize: 17 }}>{value}</Typography.Text>,
  },
  { title: 'Past simple', dataIndex: 'pastSimple', render: formsText },
  { title: 'Past participle', dataIndex: 'pastParticiple', render: formsText },
  { title: 'Po polsku', dataIndex: 'meanings', render: (m: string[]) => m.join(', ') },
  {
    title: '',
    key: 'audio',
    width: 56,
    render: (_v, verb) => (
      <SpeakButton speakKey={`verb-${verb.id}-all`} parts={verbSpeechParts(verb)} label={`Odsłuchaj: ${verb.base}`} />
    ),
  },
  {
    title: 'Grupa',
    key: 'group',
    render: (_v, verb) => (
      <Flex gap={4} wrap>
        <DifficultyTag value={verb.difficulty} />
        <PopularityTag value={verb.popularity} />
        <Tag title={PATTERN_HINTS[verb.pattern]}>{verb.pattern}</Tag>
        {renderBadge?.(verb.id)}
      </Flex>
    ),
  },
]

function PhoneForm({ label, value }: { label: string; value: string }) {
  return (
    <Flex vertical style={{ minWidth: 0 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>
        {label}
      </Typography.Text>
      <Typography.Text lang="en" strong style={{ fontSize: 17, overflowWrap: 'anywhere' }}>
        {value}
      </Typography.Text>
    </Flex>
  )
}

/** Phones: each verb as a readable card row (forms side by side, example always visible). */
const phoneColumns = (renderBadge?: BadgeSlot): TableColumnsType<IrregularVerb> => [
  {
    key: 'verb',
    render: (_v, verb) => (
      <Flex vertical gap={8}>
        <Flex justify="space-between" align="baseline" gap={12} wrap>
          <Flex align="center" gap={10}>
            <VerbThumb verb={verb} />
            <Typography.Text lang="en" strong style={{ fontSize: 20, lineHeight: 1.3 }}>
              {verb.base}
            </Typography.Text>
            <SpeakButton speakKey={`verb-${verb.id}-all`} parts={verbSpeechParts(verb)} label={`Odsłuchaj: ${verb.base}`} />
          </Flex>
          <Typography.Text type="secondary" style={{ fontSize: 15 }}>
            {verb.meanings.join(', ')}
          </Typography.Text>
        </Flex>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <PhoneForm label="Past simple" value={formsText(verb.pastSimple)} />
          <PhoneForm label="Past participle" value={formsText(verb.pastParticiple)} />
        </div>
        <Flex gap={4} wrap>
          <DifficultyTag value={verb.difficulty} />
          <PopularityTag value={verb.popularity} />
          <Tag>
            {verb.pattern} · {PATTERN_HINTS[verb.pattern].toLowerCase()}
          </Tag>
          {renderBadge?.(verb.id)}
        </Flex>
        <Flex vertical>
          <Typography.Text lang="en" italic style={{ fontSize: 15 }}>
            „{verb.exampleEn}”
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            {verb.examplePl}
          </Typography.Text>
        </Flex>
      </Flex>
    ),
  },
]

/** Table of verbs with an expandable example sentence per row. */
export default function VerbTable({
  verbs,
  loading,
  pageSize,
  renderBadge,
}: {
  verbs: IrregularVerb[] | undefined
  loading?: boolean
  pageSize?: number
  /** Optional extra tag per verb, supplied by the route (e.g. the weak-verb mark). */
  renderBadge?: BadgeSlot
}) {
  const phone = useMediaQuery(PHONE_QUERY)
  const groupColumns = verbColumns(renderBadge)
  const columns = verbs?.some((verb) => verb.imageMediaId) ? [groupColumns[0], pictureColumn, ...groupColumns.slice(1)] : groupColumns
  if (phone) {
    return (
      <Table<IrregularVerb>
        rowKey="id"
        loading={loading}
        columns={phoneColumns(renderBadge)}
        showHeader={false}
        className="card-rows card-rows-flush"
        dataSource={verbs}
        pagination={pageSize ? { pageSize, showSizeChanger: false, simple: { readOnly: true } } : false}
      />
    )
  }
  return (
    <Table<IrregularVerb>
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={verbs}
      pagination={pageSize ? { pageSize, showSizeChanger: false } : false}
      scroll={{ x: 'max-content' }}
      expandable={{
        expandedRowRender: (verb) => (
          <div style={{ paddingInlineStart: 12 }}>
            <Typography.Paragraph lang="en" style={{ marginBottom: 2, fontSize: 17 }} italic>
              „{verb.exampleEn}”
            </Typography.Paragraph>
            <Typography.Text type="secondary">{verb.examplePl}</Typography.Text>
          </div>
        ),
      }}
    />
  )
}
