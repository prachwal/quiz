import { App as AntdApp } from 'antd'
import PageHeader from '../components/PageHeader'
import { useNavigate } from 'react-router-dom'
import { errorMessage, useCreateQuizMutation } from '../app/api'
import QuizEditor from '../features/quizzes/QuizEditor'
import { emptyQuiz } from '../features/quizzes/quizDefaults'

export default function QuizNew() {
  const [createQuiz, { isLoading }] = useCreateQuizMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  return (
    <>
      <PageHeader back={{ to: '/', label: 'Wszystkie quizy' }} title="Nowy quiz" />
      <QuizEditor
        initialValues={emptyQuiz()}
        submitting={isLoading}
        submitLabel="Utwórz quiz"
        onSubmit={async (values) => {
          try {
            await createQuiz(values).unwrap()
            void message.success('Quiz zapisany')
            navigate('/')
          } catch (e) {
            void message.error(errorMessage(e))
          }
        }}
      />
    </>
  )
}
