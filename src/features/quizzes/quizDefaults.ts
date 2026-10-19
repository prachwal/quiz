import { typeDef } from '../../shared/quiz/engine'
import type { QuestionType } from '../../shared/quiz/engine'
import type { QuizInput } from '../../shared/quiz/schema'

export const emptyQuestion = (type: QuestionType = 'single'): QuizInput['questions'][number] => {
  const def = typeDef(type)
  return {
    type,
    prompt: '',
    explanation: '',
    points: 1,
    options: def.defaultOptions(),
    ...(def.defaultConfig ? { config: def.defaultConfig() } : {}),
  }
}

export const emptyQuiz = (): QuizInput => ({
  title: '',
  description: '',
  difficulty: null,
  subject: null,
  shuffleQuestions: null,
  shuffleOptions: false,
  sampleSize: null,
  questions: [emptyQuestion()],
})
