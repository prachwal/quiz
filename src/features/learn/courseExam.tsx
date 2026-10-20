import { CheckOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { Link } from 'react-router-dom'
import { RetryExamButton } from './RetryExamButton'
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
