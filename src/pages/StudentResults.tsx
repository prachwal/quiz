import { Alert, Skeleton } from 'antd'
import { useParams } from 'react-router-dom'
import { errorMessage, useGetStudentResultsQuery } from '../app/api'
import PageHeader from '../components/PageHeader'
import StudentResultsView from '../features/classes/StudentResultsView'

export default function StudentResults() {
  const { id = '', userId = '' } = useParams()
  // same query as inside the view (shared cache), used here only for the page title
  const { data, error, isLoading } = useGetStudentResultsQuery({ classId: id, userId })

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 6 }} />
  const who = data.name ?? data.email ?? data.userId

  return (
    <>
      <PageHeader
        back={{ to: `/classes/${id}`, label: 'Klasa' }}
        eyebrow="Wyniki ucznia"
        title={who}
        subtitle={data.email && data.email !== who ? data.email : data.userId}
      />
      <StudentResultsView classId={id} userId={userId} />
    </>
  )
}
