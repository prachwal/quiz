import { Alert, Skeleton, App as AntdApp } from 'antd'
import PageHeader from '../components/PageHeader'
import { useNavigate, useParams } from 'react-router-dom'
import { errorMessage } from '../app/api'
import { useGetQuizQuery, useUpdateQuizMutation } from '../features/quizzes/api'
import QuizEditor from '../features/quizzes/QuizEditor'
import type { QuizInput } from '../shared/quiz/schema'

export default function QuizEdit() {
  const { id = '' } = useParams()
  const { data, error, isLoading } = useGetQuizQuery({ id, withAnswers: true }, { refetchOnMountOrArgChange: true })
  const [updateQuiz, { isLoading: saving }] = useUpdateQuizMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 8 }} />

  const initialValues: QuizInput = {
    title: data.title,
    description: data.description,
    difficulty: data.difficulty,
    subject: data.subject,
    shuffleQuestions: data.shuffleQuestions,
    shuffleOptions: data.shuffleOptions,
    sampleSize: data.sampleSize as QuizInput['sampleSize'],
    questions: data.questions.map((q) => ({
      type: q.type,
      prompt: q.prompt,
      explanation: q.explanation ?? '',
      points: q.points,
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect ?? false })),
      // keep the per-type payload, otherwise saving an edited quiz would drop it
      ...(q.config === undefined ? {} : { config: q.config }),
    })),
  }

  return (
    <>
      <PageHeader back={{ to: '/', label: 'Wszystkie quizy' }} title="Edycja quizu" subtitle={data.title} />
      <QuizEditor
        initialValues={initialValues}
        submitting={saving}
        submitLabel="Zapisz zmiany"
        onSubmit={async (values) => {
          try {
            await updateQuiz({ id, body: values }).unwrap()
            void message.success('Zmiany zapisane')
            navigate('/')
          } catch (e) {
            void message.error(errorMessage(e))
          }
        }}
      />
    </>
  )
}
