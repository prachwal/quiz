import { ArrowRightOutlined, LogoutOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Flex, Input, Popconfirm, Skeleton, Tag, Typography, App as AntdApp } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../app/api'
import { useJoinClassMutation, useLeaveClassMutation, useListMyAssignmentsQuery, useListMyClassesQuery } from '../features/classes/api'
import PageHeader from '../components/PageHeader'
import { formatDue } from '../features/classes/formatDue'
import { StatusTag } from '../features/classes/statusTags'

export default function Assignments() {
  const { data: assignments, error, isLoading } = useListMyAssignmentsQuery()
  const { data: classes } = useListMyClassesQuery()
  const [join, { isLoading: joining }] = useJoinClassMutation()
  const [leave] = useLeaveClassMutation()
  const [code, setCode] = useState('')
  const { message } = AntdApp.useApp()

  const doJoin = async () => {
    try {
      const joined = await join({ code: code.trim() }).unwrap()
      void message.success(`Dołączono do klasy: ${joined.name}`)
      setCode('')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const doLeave = async (id: string) => {
    try {
      await leave(id).unwrap()
      void message.success('Opuszczono klasę')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Klasa"
        title="Moje zadania"
        subtitle="Zadania od nauczyciela z terminami. Postęp liczy się automatycznie, gdy uczysz się lub rozwiązujesz quizy."
      />

      <Flex vertical gap={16}>
        <Card title="Dołącz do klasy">
          <Flex vertical gap={10}>
            <Input.Search
              size="large"
              placeholder="Kod klasy (6 znaków)"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              enterButton="Dołącz"
              loading={joining}
              onSearch={() => void doJoin()}
              style={{ maxWidth: 420 }}
              autoCapitalize="characters"
              spellCheck={false}
            />
            <Typography.Text type="secondary" style={{ fontSize: 14 }}>
              Po dołączeniu nauczyciel klasy zobaczy Twoje imię, e-mail oraz postępy i wyniki w przydzielonych
              zadaniach. Klasę możesz opuścić w każdej chwili.
            </Typography.Text>
          </Flex>
        </Card>

        {classes && classes.length > 0 && (
          <Card title="Moje klasy">
            <Flex vertical gap={8}>
              {classes.map((c) => (
                <Flex key={c.id} justify="space-between" align="center" gap={12}>
                  <Flex align="center" gap={8}>
                    <TeamOutlined />
                    <Typography.Text strong>{c.name}</Typography.Text>
                  </Flex>
                  <Popconfirm
                    title="Opuścić klasę?"
                    description="Nauczyciel przestanie widzieć Twoje postępy."
                    okText="Opuść"
                    cancelText="Anuluj"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => doLeave(c.id)}
                  >
                    <Button type="text" danger icon={<LogoutOutlined />}>
                      Opuść
                    </Button>
                  </Popconfirm>
                </Flex>
              ))}
            </Flex>
          </Card>
        )}

        {error ? (
          <Alert type="error" showIcon title={errorMessage(error)} />
        ) : isLoading || !assignments ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : assignments.length === 0 ? (
          <Empty description="Brak zadań. Dołącz do klasy kodem od nauczyciela." />
        ) : (
          assignments.map((a) => (
            <Card key={a.id} styles={{ body: { padding: 'clamp(16px, 3vw, 22px)' } }}>
              <Flex justify="space-between" align="center" wrap gap="middle">
                <Flex vertical gap={6} style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <Flex gap={8} align="center" wrap>
                    <Typography.Text strong style={{ fontSize: 18 }}>
                      {a.title}
                    </Typography.Text>
                    <StatusTag status={a.status} />
                    {a.overdue && <Tag color="error">po terminie</Tag>}
                  </Flex>
                  <Typography.Text type="secondary">
                    {a.className} · termin: {formatDue(a.dueAt)}
                  </Typography.Text>
                  <Typography.Text type="secondary">{a.detail}</Typography.Text>
                </Flex>
                <Link to={a.kind === 'course' ? `/learn/${a.courseId}` : `/quizzes/${a.quizId}/play`}>
                  <Button type={a.status === 'done' ? 'default' : 'primary'} size="large" icon={<ArrowRightOutlined />} iconPlacement="end">
                    {a.status === 'done' ? 'Zobacz' : 'Otwórz'}
                  </Button>
                </Link>
              </Flex>
            </Card>
          ))
        )}
      </Flex>
    </>
  )
}
