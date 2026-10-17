import { Flex, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DifficultyTag, PopularityTag } from '../../components/GroupTags'
import type { IrregularVerb } from '../../shared/quiz/types'
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
