import { theme } from 'antd'
import { useGetAppSettingsQuery } from '../admin/api'
import { DEFAULT_SCORE_THRESHOLDS, scoreBand } from '../../shared/quiz/scoreBands'
import type { ScoreBand } from '../../shared/quiz/scoreBands'

const TAG: Record<ScoreBand, string> = { low: 'error', mid: 'warning', high: 'success' }
const TEXT: Record<ScoreBand, 'danger' | 'warning' | 'success'> = { low: 'danger', mid: 'warning', high: 'success' }

/** Red / orange / green for a score, using the global thresholds an admin set (defaults until loaded). */
export function useScoreColors() {
  const { data } = useGetAppSettingsQuery()
  const { token } = theme.useToken()
  const thresholds = data?.scoreThresholds ?? DEFAULT_SCORE_THRESHOLDS
  const band = (percent: number) => scoreBand(percent, thresholds)
  const stroke: Record<ScoreBand, string> = { low: token.colorError, mid: token.colorWarning, high: token.colorSuccess }
  return {
    thresholds,
    band,
    tagColor: (percent: number) => TAG[band(percent)],
    textType: (percent: number) => TEXT[band(percent)],
    strokeColor: (percent: number) => stroke[band(percent)],
  }
}
