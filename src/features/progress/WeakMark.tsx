import { Tag } from 'antd'
import { useGetWeakVerbsQuery } from './api'

/** "Hard for you" marker next to a verb the user keeps getting wrong. */
export default function WeakMark({ verbId }: { verbId: number }) {
  const { data } = useGetWeakVerbsQuery({ limit: 30 })
  if (!data?.some((w) => w.verb.id === verbId)) return null
  return <Tag color="warning">trudny dla Ciebie</Tag>
}
