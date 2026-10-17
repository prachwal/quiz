import { Alert, Card, Flex, Input, Select, Typography } from 'antd'
import PageHeader from '../components/PageHeader'
import { useMemo, useState } from 'react'
import { errorMessage, useListIrregularVerbsQuery } from '../app/api'
import { PHONE_QUERY, useMediaQuery } from '../app/useMediaQuery'
import { difficultyOptions, popularityOptions } from '../components/groupOptions'
import { formsText } from '../features/learn/format'
import VerbTable from '../features/learn/VerbTable'
import type { DifficultyCode, PatternCode, PopularityCode } from '../shared/quiz/types'

const patternOptions = (['AAA', 'ABA', 'ABB', 'ABC'] as PatternCode[]).map((value) => ({
  value,
  label: value,
}))

export default function Verbs() {
  const [difficulty, setDifficulty] = useState<DifficultyCode>()
  const [popularity, setPopularity] = useState<PopularityCode>()
  const [pattern, setPattern] = useState<PatternCode>()
  const [search, setSearch] = useState('')
  const phone = useMediaQuery(PHONE_QUERY)
  const { data, error, isFetching } = useListIrregularVerbsQuery({ difficulty, popularity, pattern })

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return data
    return data?.filter((v) =>
      [v.base, formsText(v.pastSimple), formsText(v.pastParticiple), v.meanings.join(' ')].some((field) =>
        field.toLocaleLowerCase().includes(needle),
      ),
    )
  }, [data, search])

  return (
    <>
      <PageHeader
        eyebrow="Słownik"
        title="Czasowniki nieregularne (B2)"
        subtitle={
          phone
            ? 'Wszystkie formy i przykładowe zdania w jednym miejscu.'
            : 'Wszystkie formy w jednym miejscu. Rozwiń wiersz, aby zobaczyć przykładowe zdanie.'
        }
      />
      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      <Card>
        <Flex gap={12} wrap align="center" className="verbs-filters" style={{ marginBottom: 20 }}>
          <Input.Search
            allowClear
            size="large"
            placeholder="Szukaj po angielsku lub po polsku"
            aria-label="Szukaj czasownika"
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 280px', minWidth: 0 }}
          />
          <Flex gap={8} wrap style={{ flex: '1 1 auto' }}>
            <Select allowClear placeholder="Trudność" aria-label="Trudność" options={difficultyOptions} value={difficulty} onChange={setDifficulty} style={{ flex: '1 1 130px' }} />
            <Select allowClear placeholder="Popularność" aria-label="Popularność" options={popularityOptions} value={popularity} onChange={setPopularity} style={{ flex: '1 1 160px' }} />
            <Select allowClear placeholder="Wzorzec" aria-label="Wzorzec" options={patternOptions} value={pattern} onChange={setPattern} style={{ flex: '1 1 110px' }} />
          </Flex>
          {filtered && (
            <Typography.Text type="secondary" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
              {filtered.length} czasowników
            </Typography.Text>
          )}
        </Flex>
        <VerbTable verbs={filtered} loading={isFetching} pageSize={20} />
      </Card>
    </>
  )
}
