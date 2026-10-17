import { Flex, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import { DifficultyTag, PopularityTag } from '../../components/GroupTags'
import type { IrregularVerb } from '../../shared/quiz/types'
import SpeakButton from '../audio/SpeakButton'
import { verbSpeechParts } from '../audio/speech'
import { PATTERN_HINTS, formsText } from './format'

const verbColumns: TableColumnsType<IrregularVerb> = [
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
const phoneColumns: TableColumnsType<IrregularVerb> = [
  {
    key: 'verb',
    render: (_v, verb) => (
      <Flex vertical gap={8}>
        <Flex justify="space-between" align="baseline" gap={12} wrap>
          <Flex align="center" gap={10}>
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
}: {
  verbs: IrregularVerb[] | undefined
  loading?: boolean
  pageSize?: number
}) {
  const phone = useMediaQuery(PHONE_QUERY)
  if (phone) {
    return (
      <Table<IrregularVerb>
        rowKey="id"
        loading={loading}
        columns={phoneColumns}
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
      columns={verbColumns}
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
