import { ReloadOutlined } from '@ant-design/icons'
import { Button, App as AntdApp } from 'antd'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '../../app/api'
import { useStartExamMutation } from './api'
import { EXAM_COUNT, clampCount } from '../quizzes/counts'

/** Starts a new attempt of the course exam with the same number of questions (capped). */
export function RetryExamButton({ courseId, questionCount }: { courseId: string; questionCount: number }) {
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const [startExam, { isLoading: restartingExam }] = useStartExamMutation()
  const retryExam = async () => {
    try {
      const next = await startExam({
        courseId,
        count: clampCount(questionCount, EXAM_COUNT),
      }).unwrap()
      navigate(`/quizzes/${next.id}/play`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }
  return (
    <Button size="large" icon={<ReloadOutlined />} loading={restartingExam} onClick={() => void retryExam()}>
      Nowe podejście
    </Button>
  )
}
