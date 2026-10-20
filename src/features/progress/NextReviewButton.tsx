import { ReloadOutlined } from '@ant-design/icons'
import { Button, App as AntdApp } from 'antd'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '../../app/api'
import { REVIEW_COUNT, clampCount } from '../quizzes/counts'
import { useStartReviewMutation } from './api'

/** "Kolejna powtórka" after a review quiz: starts the next due review session (route slot of the result view). */
export default function NextReviewButton({ questionCount }: { questionCount: number }) {
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const [startReview, { isLoading: startingReview }] = useStartReviewMutation()
  const nextReview = async () => {
    try {
      const next = await startReview({ count: clampCount(questionCount, REVIEW_COUNT) }).unwrap()
      navigate(`/quizzes/${next.id}/play`)
    } catch (e) {
      void message.info(errorMessage(e)) // e.g. nothing left to review today
      navigate('/')
    }
  }
  return (
    <Button type="primary" size="large" icon={<ReloadOutlined />} loading={startingReview} onClick={() => void nextReview()}>
      Kolejna powtórka
    </Button>
  )
}
