import { useParams } from 'react-router-dom'
import QuizPlayer from '../features/quizzes/QuizPlayer'
import { courseBackLink, courseExamOutcome } from '../features/learn/courseExam'
import NextReviewButton from '../features/progress/NextReviewButton'
import ProgressLine from '../features/progress/ProgressLine'

export default function QuizPlay() {
  const { id = '' } = useParams()
  // key: a new quiz id must start a fresh player (answers, progress and result belong to one quiz)
  // the course exam and progress slots are composed here, the quiz player knows nothing about courses or progress
  return (
    <QuizPlayer
      key={id}
      id={id}
      outcomeFor={courseExamOutcome}
      backLinkFor={courseBackLink}
      resultFooter={<ProgressLine />}
      reviewActionFor={(quiz) => <NextReviewButton questionCount={quiz.questions.length} />}
    />
  )
}
