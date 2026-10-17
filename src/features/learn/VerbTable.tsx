import { Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DifficultyTag, PopularityTag } from '../../components/GroupTags'
import type { IrregularVerb } from '../../shared/quiz/types'
import { formsText } from './format'

const PATTERN_HINTS: Record<IrregularVerb['pattern'], string> = {
  AAA: 'Trzy takie same formy',
  ABA: 'Past participle jak bezokolicznik',
  ABB: 'Past simple = past participle',
  ABC: 'Trzy różne formy',
}

const verbColumns: TableColumnsType<IrregularVerb> = [
  {
    title: 'Bezokolicznik',
    dataIndex: 'base',
    sorter: (a, b) => a.base.localeCompare(b.base),
    render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
  },
  { title: 'Past simple', dataIndex: 'pastSimple', render: formsText },
  { title: 'Past participle', dataIndex: 'pastParticiple', render: formsText },
  { title: 'Po polsku', dataIndex: 'meanings', render: (m: string[]) => m.join(', ') },
  {
    title: 'Grupa',
    key: 'group',
    render: (_v, verb) => (
      <>
        <DifficultyTag value={verb.difficulty} />
        <PopularityTag value={verb.popularity} />
        <Tag title={PATTERN_HINTS[verb.pattern]}>{verb.pattern}</Tag>
      </>
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
          <>
            <Typography.Paragraph style={{ marginBottom: 0 }} italic>
              {verb.exampleEn}
            </Typography.Paragraph>
            <Typography.Text type="secondary">{verb.examplePl}</Typography.Text>
          </>
        ),
      }}
    />
  )
}
