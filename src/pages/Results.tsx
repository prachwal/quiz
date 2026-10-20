import { FieldTimeOutlined, RiseOutlined, TrophyOutlined } from '@ant-design/icons'
import { Alert, Card, Col, Row, Tag, Typography, theme } from 'antd'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '../app/api'
import { useListAttemptsQuery } from '../features/results/api'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { useAuth } from '../features/auth/useAuth'
import AdminStudentPicker from '../features/admin/AdminStudentPicker'
import AdminStudentResultsView from '../features/admin/AdminStudentResultsView'
import StudentPicker from '../features/classes/StudentPicker'
import { parseStudentKey } from '../features/classes/studentKey'
import StudentResultsView from '../features/classes/StudentResultsView'
import DailyGoalCard from '../features/progress/DailyGoalCard'
import WeakVerbs from '../features/progress/WeakVerbs'
import AttemptsTable from '../features/results/AttemptsTable'
import type { AttemptRow } from '../features/results/AttemptsTable'
import { useScoreColors } from '../features/results/useScoreColors'
import type { AttemptSummary } from '../shared/quiz/types'

const toRow = (a: AttemptSummary): AttemptRow => ({
  id: a.id,
  title: a.quizTitle,
  createdAt: a.createdAt,
  percent: a.percent,
  score: a.score,
  maxScore: a.maxScore,
  kind: a.courseId ? 'Egzamin' : 'Quiz',
  kindTag: a.courseId ? (
    <Tag color={a.passed ? 'success' : 'error'}>{a.passed ? 'Egzamin: zaliczony' : 'Egzamin: niezaliczony'}</Tag>
  ) : (
    <Tag>Quiz</Tag>
  ),
})

export default function Results() {
  const { isTeacher, isAdmin } = useAuth()
  // ?student=<classId>::<auth0 id> shows a student's results (teachers and admins), the link can be shared
  const [params, setParams] = useSearchParams()
  // admins: ?user=<auth0 id> shows ALL results of anybody; teachers: ?student=<class>::<id> (class assignments only)
  if (isAdmin) {
    // an older class link (?student=<class>::<id>) opens the full view of the same student
    const legacy = params.get('student')
    const user = params.get('user') ?? (legacy ? parseStudentKey(legacy).userId : null)
    const chooseUser = (id: string | null) => setParams(id ? { user: id } : {}, { replace: true })
    const picker = <AdminStudentPicker value={user} onChange={chooseUser} />
    if (!user) return <OwnResults picker={picker} />
    return (
      <>
        <PageHeader title="Wyniki użytkownika" subtitle="Widok administratora: wszystkie podejścia, postępy i słabe czasowniki." />
        {picker}
        <AdminStudentResultsView userId={user} />
      </>
    )
  }
  const picked = isTeacher ? params.get('student') : null
  const choose = (key: string | null) => setParams(key ? { student: key } : {}, { replace: true })

  if (picked) {
    const { classId, userId } = parseStudentKey(picked)
    return (
      <>
        <PageHeader title="Wyniki ucznia" subtitle="Podgląd wyników z zadań przydzielonych w klasie." />
        <StudentPicker value={picked} onChange={choose} />
        <StudentResultsView classId={classId} userId={userId} />
      </>
    )
  }
  return <OwnResults picker={isTeacher ? <StudentPicker value={null} onChange={choose} /> : null} />
}

function OwnResults({ picker }: { picker: ReactNode }) {
  const { data, error, isLoading } = useListAttemptsQuery()
  const { token } = theme.useToken()
  const { textType } = useScoreColors()
  const average = data?.length ? Math.round(data.reduce((sum, a) => sum + a.percent, 0) / data.length) : null
  const passedExams = data?.filter((a) => a.courseId && a.passed).length ?? 0

  return (
    <>
      <PageHeader title="Historia wyników" subtitle="Wszystkie Twoje podejścia do quizów i egzaminów." />
      {picker}
      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      <div style={{ marginBottom: 24 }}>
        <DailyGoalCard />
      </div>
      <div style={{ marginBottom: 24 }}>
        <WeakVerbs />
      </div>
      {data && data.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <StatCard label="Podejścia" value={data.length} icon={<FieldTimeOutlined />} color={token.colorPrimary} />
          </Col>
          <Col xs={24} sm={8}>
            <StatCard
              label="Średni wynik"
              value={<Typography.Text type={textType(average ?? 0)} style={{ fontSize: 'inherit' }}>{average}%</Typography.Text>}
              icon={<RiseOutlined />}
              color={token.colorInfo}
            />
          </Col>
          <Col xs={24} sm={8}>
            <StatCard label="Zaliczone egzaminy" value={passedExams} icon={<TrophyOutlined />} color={token.colorWarning} />
          </Col>
        </Row>
      )}
      <Card title="Podejścia" styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
        <AttemptsTable rows={(data ?? []).map(toRow)} loading={isLoading} emptyText="Brak zapisanych wyników" />
      </Card>
    </>
  )
}
