import { CheckOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, App as AntdApp } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage, useStartExamMutation } from '../../app/api'
import { EXAM_COUNT, clampCount } from '../quizzes/counts'
import type { ResultOutcome } from '../quizzes/ResultView'
import type { GradedAttempt, QuizDetail } from '../../shared/quiz/types'

/** Header back link of a course exam: back to the course. */
export function courseBackLink(quiz: QuizDetail): { to: string; label: string } | undefined {
  return quiz.courseId ? { to: `/learn/${quiz.courseId}`, label: 'Wróć do kursu' } : undefined
}

/** Result header of a course exam: pass/fail against the course threshold. */
export function courseExamOutcome(quiz: QuizDetail, result: GradedAttempt): ResultOutcome | undefined {
  const course = result.course
  if (!course) return undefined
  return {
    tone: course.passed ? 'success' : 'error',
    headline: course.passed ? 'Egzamin zaliczony!' : 'Egzamin niezaliczony',
    subline: `${course.title} · próg zaliczenia ${course.passPercent}%`,
    actions: (
      <>
        <Link to={`/learn/${course.id}`}>
          <Button type="primary" size="large" icon={<CheckOutlined />}>
            Wróć do kursu
          </Button>
        </Link>
        <RetryExamButton courseId={course.id} questionCount={quiz.questions.length} />
      </>
    ),
  }
}

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
