import { Alert, Card, Flex, Input, Select, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { errorMessage, useListIrregularVerbsQuery } from '../app/api'
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
      <Typography.Title>Czasowniki nieregularne (B2)</Typography.Title>
      {error && <Alert type="error" showIcon title={errorMessage(error)} />}
      <Card>
        <Flex gap="small" wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="Szukaj po angielsku lub po polsku"
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
          <Select allowClear placeholder="Trudność" options={difficultyOptions} value={difficulty} onChange={setDifficulty} style={{ width: 140 }} />
          <Select allowClear placeholder="Popularność" options={popularityOptions} value={popularity} onChange={setPopularity} style={{ width: 170 }} />
          <Select allowClear placeholder="Wzorzec" options={patternOptions} value={pattern} onChange={setPattern} style={{ width: 120 }} />
        </Flex>
        <VerbTable verbs={filtered} loading={isFetching} pageSize={20} />
      </Card>
    </>
  )
}
