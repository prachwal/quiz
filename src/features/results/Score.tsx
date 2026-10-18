import { Progress, Tag } from 'antd'
import type { ReactNode } from 'react'
import { useScoreColors } from './useScoreColors'

/** A score as a coloured tag (red / orange / green by the global thresholds). */
export function ScoreTag({ percent, children }: { percent: number; children?: ReactNode }) {
  const { tagColor } = useScoreColors()
  return (
    <Tag color={tagColor(percent)} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {children ?? `${percent}%`}
    </Tag>
  )
}

/** A score as a coloured progress bar. */
export function ScoreProgress({ percent, showInfo = true }: { percent: number; showInfo?: boolean }) {
  const { strokeColor } = useScoreColors()
  return (
    <Progress
      percent={percent}
      size="small"
      showInfo={showInfo}
      strokeColor={strokeColor(percent)}
      status="normal"
      format={(p) => `${p}%`}
      style={{ margin: 0, minWidth: 120 }}
    />
  )
}
