import { Flex, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import type { ReactNode } from 'react'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import type { StudentAttemptQuestion } from '../../shared/quiz/types'
import AttemptDetails from './AttemptDetails'
import { ScoreProgress, ScoreTag } from './Score'

/** One row of any attempt list (own results, a student in a class, the admin's full view). */
export interface AttemptRow {
  id: string
  title: string
  createdAt: string
  percent: number
  score: number
  maxScore: number
  /** Short kind used for filtering, e.g. "Quiz", "Egzamin", "Powtórka". */
  kind: string
  /** How the kind is displayed (usually a tag). */
  kindTag: ReactNode
  /** Per-question details; rows with questions can be expanded. */
  questions?: StudentAttemptQuestion[]
}

const formatDate = (value: string) => new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Sortable, paginated table of attempts with coloured scores; rows with answers expand to the questions.
 * Phones get one card-like column (sorting by the newest first, pagination kept).
 */
export default function AttemptsTable({ rows, loading, emptyText = 'Brak podejść' }: { rows: AttemptRow[]; loading?: boolean; emptyText?: string }) {
  const phone = useMediaQuery(PHONE_QUERY)
  const kinds = [...new Set(rows.map((r) => r.kind))].sort()

  const columns: TableColumnsType<AttemptRow> = [
    {
      title: 'Data',
      dataIndex: 'createdAt',
      width: 190,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
          {formatDate(v)}
        </Typography.Text>
      ),
    },
    {
      title: 'Quiz',
      dataIndex: 'title',
      sorter: (a, b) => a.title.localeCompare(b.title, 'pl'),
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: 'Typ',
      dataIndex: 'kind',
      width: 170,
      filters: kinds.length > 1 ? kinds.map((k) => ({ text: k, value: k })) : undefined,
      onFilter: (value, r) => r.kind === value,
      render: (_v, r) => r.kindTag,
    },
    {
      title: 'Punkty',
      key: 'points',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.score - b.score,
      render: (_v, r) => (
        <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {r.score} / {r.maxScore}
        </span>
      ),
    },
    {
      title: 'Wynik',
      dataIndex: 'percent',
      width: 200,
      sorter: (a, b) => a.percent - b.percent,
      render: (p: number) => <ScoreProgress percent={p} />,
    },
  ]

  const phoneColumns: TableColumnsType<AttemptRow> = [
    {
      key: 'card',
      render: (_v, r) => (
        <Flex vertical gap={6}>
          <Flex justify="space-between" align="flex-start" gap={12}>
            <Typography.Text strong style={{ fontSize: 16, minWidth: 0, wordBreak: 'break-word' }}>
              {r.title}
            </Typography.Text>
            <ScoreTag percent={r.percent} />
          </Flex>
          <ScoreProgress percent={r.percent} showInfo={false} />
          <Flex wrap gap={6} align="center">
            {r.kindTag}
            <Typography.Text type="secondary" style={{ fontSize: 14 }}>
              {r.score} / {r.maxScore} pkt · {formatDate(r.createdAt)}
            </Typography.Text>
          </Flex>
        </Flex>
      ),
    },
  ]

  return (
    <Table<AttemptRow>
      rowKey="id"
      loading={loading}
      columns={phone ? phoneColumns : columns}
      showHeader={!phone}
      className={phone ? 'card-rows' : undefined}
      dataSource={phone ? [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : rows}
      scroll={phone ? undefined : { x: 'max-content' }}
      expandable={{
        rowExpandable: (r) => (r.questions?.length ?? 0) > 0,
        expandedRowRender: (r) => <AttemptDetails questions={r.questions ?? []} />,
      }}
      pagination={{
        defaultPageSize: 10,
        pageSizeOptions: [10, 20, 50, 100],
        showSizeChanger: !phone,
        simple: phone,
        hideOnSinglePage: rows.length <= 10,
        showTotal: (total, [from, to]) => `${from}–${to} z ${total}`,
      }}
      locale={{ emptyText }}
    />
  )
}
