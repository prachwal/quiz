import { useParams } from 'react-router-dom'
import QuizPlayer from '../features/quizzes/QuizPlayer'

export default function QuizPlay() {
  const { id = '' } = useParams()
  return <QuizPlayer id={id} />
}
