import { questionTypes } from '../../shared/quiz/engine'
import type { QuestionType } from '../../shared/quiz/engine'
import type { QuizInput } from '../../shared/quiz/schema'

export const emptyQuestion = (type: QuestionType = 'single'): QuizInput['questions'][number] => ({
  type,
  prompt: '',
  explanation: '',
  points: 1,
  options: questionTypes[type].defaultOptions(),
})

export const emptyQuiz = (): QuizInput => ({
  title: '',
  description: '',
  difficulty: null,
  shuffleQuestions: null,
  shuffleOptions: false,
  sampleSize: null,
  questions: [emptyQuestion()],
})
