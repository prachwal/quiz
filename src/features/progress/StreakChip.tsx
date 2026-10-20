import { FireFilled } from '@ant-design/icons'
import { Tooltip, theme } from 'antd'
import { Link } from 'react-router-dom'
import { useGetProgressQuery } from './api'

/** Header chip with the current streak (links to the results page). */
export default function StreakChip() {
  const { data } = useGetProgressQuery()
  const { token } = theme.useToken()
  if (!data) return null
  const active = data.currentStreak > 0
  return (
    <Tooltip title={`Seria: ${data.currentStreak} dni · dziś ${data.today.answered}/${data.dailyGoal}`}>
      <Link
        to="/results"
        aria-label={`Seria ${data.currentStreak} dni`}
        className="streak-chip"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          fontWeight: 700,
          color: active ? '#d4380d' : token.colorTextSecondary,
          background: active ? 'rgba(255,122,69,0.14)' : token.colorFillQuaternary,
        }}
      >
        <FireFilled />
        {data.currentStreak}
      </Link>
    </Tooltip>
  )
}
