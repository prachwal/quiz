import { Flex, Tooltip, Typography, theme } from 'antd'
import type { ProgressSummary } from '../../shared/quiz/types'

const WEEKDAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb']

/** The last 7 days as bars: filled once the daily goal is reached, tinted for partial activity. */
export default function WeekStrip({ summary }: { summary: ProgressSummary }) {
  const { token } = theme.useToken()
  return (
    <Flex gap={8} justify="space-between" role="list" aria-label="Ostatnie 7 dni">
      {summary.last7.map((day, i) => {
        const reached = day.answered >= summary.dailyGoal
        const active = day.answered > 0 || day.lessons > 0
        const isToday = i === summary.last7.length - 1
        const weekday = WEEKDAYS[new Date(`${day.day}T12:00:00`).getDay()]
        return (
          <Tooltip key={day.day} title={`${day.day}: ${day.answered} odpowiedzi, ${day.lessons} lekcji`}>
            <Flex vertical align="center" gap={6} role="listitem" style={{ flex: 1, minWidth: 0 }}>
              <div
                aria-label={reached ? 'cel osiągnięty' : active ? 'aktywność' : 'brak aktywności'}
                style={{
                  width: '100%',
                  maxWidth: 40,
                  height: 36,
                  borderRadius: 10,
                  background: reached ? token.colorPrimary : active ? token.colorPrimaryBgHover : token.colorFillQuaternary,
                  border: isToday ? `2px solid ${token.colorPrimary}` : `1px solid ${token.colorBorderSecondary}`,
                }}
              />
              <Typography.Text type={isToday ? undefined : 'secondary'} strong={isToday} style={{ fontSize: 13 }}>
                {weekday}
              </Typography.Text>
            </Flex>
          </Tooltip>
        )
      })}
    </Flex>
  )
}
