import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import { Flex, Typography, theme } from 'antd'
import type { StudentAttemptQuestion } from '../../shared/quiz/types'

/** The questions of one attempt: the student's answer and, for mistakes, the correct one. */
export default function AttemptDetails({ questions }: { questions: StudentAttemptQuestion[] }) {
  const { token } = theme.useToken()
  return (
    <Flex vertical gap={10}>
      {questions.map((q, i) => (
        <Flex key={q.questionId} gap={10} align="flex-start">
          {q.correct ? (
            <CheckCircleFilled style={{ color: token.colorSuccess, marginTop: 4 }} aria-label="poprawnie" />
          ) : (
            <CloseCircleFilled style={{ color: token.colorError, marginTop: 4 }} aria-label="błędnie" />
          )}
          <Flex vertical style={{ minWidth: 0 }}>
            <Typography.Text strong>
              {i + 1}. {q.prompt ?? 'Pytanie usunięte z quizu'}
            </Typography.Text>
            <Typography.Text type="secondary">
              Odpowiedź ucznia: {q.answer.trim() ? q.answer : <em>brak</em>}
            </Typography.Text>
            {!q.correct && q.correctAnswers.length > 0 && (
              <Typography.Text type="secondary">Poprawnie: {q.correctAnswers.slice(0, 3).join(' / ')}</Typography.Text>
            )}
          </Flex>
        </Flex>
      ))}
    </Flex>
  )
}
