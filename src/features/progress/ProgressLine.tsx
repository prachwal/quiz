import { CheckCircleFilled, FireFilled } from '@ant-design/icons'
import { Alert } from 'antd'
import { useGetProgressQuery } from './api'

/** One-line recap shown after a quiz: today's progress towards the goal and the streak. */
export default function ProgressLine() {
  const { data } = useGetProgressQuery()
  if (!data) return null
  const reached = data.today.answered >= data.dailyGoal
  return (
    <Alert
      type={reached ? 'success' : 'info'}
      showIcon
      icon={reached ? <CheckCircleFilled /> : <FireFilled />}
      title={
        reached
          ? `Cel dzienny osiągnięty (${data.today.answered}/${data.dailyGoal}). Seria: ${data.currentStreak} dni.`
          : `Dziś ${data.today.answered}/${data.dailyGoal} odpowiedzi · seria: ${data.currentStreak} dni.`
      }
    />
  )
}
