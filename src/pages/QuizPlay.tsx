import { useParams } from 'react-router-dom'
import QuizPlayer from '../features/quizzes/QuizPlayer'

export default function QuizPlay() {
  const { id = '' } = useParams()
  // key: a new quiz id must start a fresh player (answers, progress and result belong to one quiz)
  return <QuizPlayer key={id} id={id} />
}
