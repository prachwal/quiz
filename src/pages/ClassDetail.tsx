import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  App as AntdApp,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  errorMessage,
  useAddClassMemberMutation,
  useArchiveClassMutation,
  useCreateAssignmentMutation,
  useDeleteAssignmentMutation,
  useGetClassQuery,
  useGetClassReportQuery,
  useListCoursesQuery,
  useListQuizzesQuery,
  useRegenerateClassCodeMutation,
  useRemoveClassMemberMutation,
  useUpdateAssignmentDueMutation,
  useUpdateClassMutation,
} from '../app/api'
import { PHONE_QUERY, useMediaQuery } from '../app/useMediaQuery'
import PageHeader from '../components/PageHeader'
import { downloadCsv } from '../features/classes/downloadCsv'
import { formatDue } from '../features/classes/formatDue'
import { StatusTag } from '../features/classes/statusTags'
import type { ClassDetail as ClassDetailData, ClassReportRow } from '../shared/quiz/types'

function RenameClass({ cls }: { cls: ClassDetailData }) {
  const [open, setOpen] = useState(false)
  const [update, { isLoading }] = useUpdateClassMutation()
  const [form] = Form.useForm<{ name: string }>()
  const { message } = AntdApp.useApp()
  return (
    <>
      <Button icon={<EditOutlined />} onClick={() => setOpen(true)}>
        Zmień nazwę
      </Button>
      <Modal
        open={open}
        title="Zmień nazwę klasy"
        okText="Zapisz"
        cancelText="Anuluj"
        confirmLoading={isLoading}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ name: cls.name }}
          onFinish={async ({ name }) => {
            try {
              await update({ id: cls.id, name }).unwrap()
              setOpen(false)
            } catch (e) {
              void message.error(errorMessage(e))
            }
          }}
        >
          <Form.Item
            name="name"
            label="Nazwa klasy"
            rules={[{ required: true, whitespace: true, min: 2, message: 'Podaj nazwę (min. 2 znaki)' }]}
          >
            <Input maxLength={80} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

function AddStudent({ cls }: { cls: ClassDetailData }) {
  const [add, { isLoading }] = useAddClassMemberMutation()
  const [value, setValue] = useState('')
  const { message } = AntdApp.useApp()
  const submit = async () => {
    const userId = value.trim()
    if (!userId) return
    try {
      const result = await add({ classId: cls.id, userId }).unwrap()
      void message.success(result.status === 'added' ? 'Uczeń dodany do klasy' : 'Uczeń już jest w tej klasie')
      setValue('')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }
  return (
    <Flex vertical gap={4} style={{ marginBottom: 16 }}>
      <Input.Search
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onSearch={() => void submit()}
        enterButton="Dodaj ucznia"
        loading={isLoading}
        placeholder="Identyfikator Auth0, np. google-oauth2|123456"
        maxLength={200}
        aria-label="Identyfikator Auth0 ucznia"
      />
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Identyfikator znajdziesz w Ustawienia → Użytkownicy (admin) lub uczeń może dołączyć kodem klasy: {cls.joinCode}.
      </Typography.Text>
    </Flex>
  )
}

function Students({ cls }: { cls: ClassDetailData }) {
  const [remove] = useRemoveClassMemberMutation()
  const { message } = AntdApp.useApp()
  if (cls.members.length === 0) {
    return (
      <>
        <AddStudent cls={cls} />
        <Empty description={`Brak uczniów. Przekaż im kod klasy: ${cls.joinCode}`} />
      </>
    )
  }
  return (
    <Flex vertical gap={8}>
      <AddStudent cls={cls} />
      {cls.members.map((m) => (
        <Flex key={m.userId} justify="space-between" align="center" gap={12}>
          <Flex vertical style={{ minWidth: 0 }}>
            <Link to={`/classes/${cls.id}/students/${encodeURIComponent(m.userId)}`} className="student-link">
              <Typography.Text strong ellipsis>
                {m.name ?? m.email ?? m.userId}
              </Typography.Text>
            </Link>
            {m.email && m.email !== m.name && (
              <Typography.Text type="secondary" ellipsis style={{ fontSize: 13 }}>
                {m.email}
              </Typography.Text>
            )}
          </Flex>
          <Link to={`/classes/${cls.id}/students/${encodeURIComponent(m.userId)}`}>
            <Button size="small">Wyniki</Button>
          </Link>
          <Popconfirm
            title="Usunąć ucznia z klasy?"
            okText="Usuń"
            cancelText="Anuluj"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              try {
                await remove({ classId: cls.id, userId: m.userId }).unwrap()
              } catch (e) {
                void message.error(errorMessage(e))
              }
            }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="Usuń ucznia" />
          </Popconfirm>
        </Flex>
      ))}
    </Flex>
  )
}

function Assignments({ cls }: { cls: ClassDetailData }) {
  const { data: courses } = useListCoursesQuery()
  const { data: quizzes } = useListQuizzesQuery()
  const [create, { isLoading }] = useCreateAssignmentMutation()
  const [remove] = useDeleteAssignmentMutation()
  const [setDue] = useUpdateAssignmentDueMutation()
  const [kind, setKind] = useState<'course' | 'quiz'>('course')
  const [target, setTarget] = useState<string>()
  const [dueAt, setDueAt] = useState<string | null>(null)
  const { message } = AntdApp.useApp()

  const options =
    kind === 'course'
      ? (courses ?? []).map((c) => ({ value: c.id, label: c.title }))
      : (quizzes ?? []).map((q) => ({ value: q.id, label: q.title }))

  const add = async () => {
    if (!target) return void message.warning('Wybierz kurs lub quiz')
    try {
      await create({
        classId: cls.id,
        kind,
        ...(kind === 'course' ? { courseId: target } : { quizId: target }),
        dueAt,
      }).unwrap()
      setTarget(undefined)
      setDueAt(null)
      void message.success('Zadanie przydzielone')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <Flex vertical gap={16}>
      <Card size="small" title="Nowe zadanie">
        <Flex vertical gap={12}>
          <Segmented
            value={kind}
            onChange={(v) => {
              setKind(v as 'course' | 'quiz')
              setTarget(undefined)
            }}
            options={[
              { value: 'course', label: 'Kurs (z egzaminem)' },
              { value: 'quiz', label: 'Quiz' },
            ]}
            style={{ alignSelf: 'flex-start' }}
          />
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={kind === 'course' ? 'Wybierz kurs' : 'Wybierz quiz'}
            options={options}
            value={target}
            onChange={setTarget}
            style={{ width: '100%' }}
            notFoundContent="Brak pozycji"
          />
          <DatePicker
            showTime
            placeholder="Termin (opcjonalnie)"
            onChange={(d) => setDueAt(d ? d.toISOString() : null)}
            style={{ width: '100%' }}
          />
          <Button type="primary" loading={isLoading} onClick={() => void add()} style={{ alignSelf: 'flex-start' }}>
            Przydziel
          </Button>
        </Flex>
      </Card>

      {cls.assignments.length === 0 ? (
        <Empty description="Brak zadań" />
      ) : (
        cls.assignments.map((a) => (
          <Flex key={a.id} justify="space-between" align="center" gap={12} wrap>
            <Flex vertical style={{ minWidth: 0 }}>
              <Typography.Text strong>{a.title}</Typography.Text>
              <Typography.Text type="secondary">
                <Tag style={{ marginInlineEnd: 6 }}>{a.kind === 'course' ? 'kurs' : 'quiz'}</Tag>
                termin: {formatDue(a.dueAt)}
              </Typography.Text>
              <DatePicker
                showTime
                size="small"
                placeholder="Zmień termin"
                aria-label={`Termin zadania ${a.title}`}
                style={{ marginTop: 6, maxWidth: 220 }}
                onChange={async (d) => {
                  try {
                    await setDue({ classId: cls.id, assignmentId: a.id, dueAt: d ? d.toISOString() : null }).unwrap()
                    void message.success('Termin zapisany')
                  } catch (e) {
                    void message.error(errorMessage(e))
                  }
                }}
              />
            </Flex>
            <Popconfirm
              title="Usunąć zadanie?"
              okText="Usuń"
              cancelText="Anuluj"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                try {
                  await remove({ classId: cls.id, assignmentId: a.id }).unwrap()
                } catch (e) {
                  void message.error(errorMessage(e))
                }
              }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} aria-label="Usuń zadanie" />
            </Popconfirm>
          </Flex>
        ))
      )}
    </Flex>
  )
}

function Report({ cls }: { cls: ClassDetailData }) {
  const { data, error, isLoading } = useGetClassReportQuery(cls.id)
  const phone = useMediaQuery(PHONE_QUERY)
  const { message } = AntdApp.useApp()
  const [downloading, setDownloading] = useState(false)

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 4 }} />

  const who = (r: ClassReportRow) => r.name ?? r.email ?? r.userId
  const cells = (r: ClassReportRow) =>
    data.assignments.map((a) => (
      <Flex key={a.id} gap={6} align="center" wrap>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {a.title}:
        </Typography.Text>
        <StatusTag status={r.statuses[a.id]} />
        {r.bestPercent[a.id] != null && <Tag>{r.bestPercent[a.id]}%</Tag>}
      </Flex>
    ))

  const columns: TableColumnsType<ClassReportRow> = [
    { title: 'Uczeń', key: 'who', render: (_v, r) => (
        <Link to={`/classes/${cls.id}/students/${encodeURIComponent(r.userId)}`}>
          <Typography.Text strong>{who(r)}</Typography.Text>
        </Link>
      ),
    },
    { title: 'Lekcje', dataIndex: 'lessonsCompleted', align: 'right' },
    { title: 'Ostatnio aktywny', dataIndex: 'lastActiveDay', render: (v: string | null) => v ?? '—' },
    { title: 'Słabe czasowniki', dataIndex: 'weakVerbs', align: 'right' },
    ...data.assignments.map((a) => ({
      title: a.title,
      key: a.id,
      render: (_v: unknown, r: ClassReportRow) => (
        <Flex gap={6} align="center">
          <StatusTag status={r.statuses[a.id]} />
          {r.bestPercent[a.id] != null && <Tag>{r.bestPercent[a.id]}%</Tag>}
        </Flex>
      ),
    })),
  ]

  const phoneColumns: TableColumnsType<ClassReportRow> = [
    {
      key: 'card',
      render: (_v, r) => (
        <Flex vertical gap={6}>
          <Link to={`/classes/${cls.id}/students/${encodeURIComponent(r.userId)}`}>
            <Typography.Text strong>{who(r)}</Typography.Text>
          </Link>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            lekcje: {r.lessonsCompleted} · ostatnio: {r.lastActiveDay ?? '—'} · słabe czasowniki: {r.weakVerbs}
          </Typography.Text>
          {cells(r)}
        </Flex>
      ),
    },
  ]

  return (
    <Flex vertical gap={12}>
      <Button
        icon={<DownloadOutlined />}
        loading={downloading}
        style={{ alignSelf: 'flex-start' }}
        onClick={async () => {
          setDownloading(true)
          try {
            await downloadCsv(`classes/${cls.id}/report.csv`, 'raport-klasy.csv')
          } catch (e) {
            void message.error(e instanceof Error ? e.message : 'Błąd pobierania')
          } finally {
            setDownloading(false)
          }
        }}
      >
        Eksport CSV
      </Button>
      <Table<ClassReportRow>
        rowKey="userId"
        columns={phone ? phoneColumns : columns}
        showHeader={!phone}
        dataSource={data.rows}
        pagination={false}
        scroll={phone ? undefined : { x: 'max-content' }}
        locale={{ emptyText: 'Brak uczniów w klasie' }}
      />
    </Flex>
  )
}

export default function ClassDetail() {
  const { id = '' } = useParams()
  const { data: cls, error, isLoading } = useGetClassQuery(id)
  const [regenerate, { isLoading: regenerating }] = useRegenerateClassCodeMutation()
  const [archive] = useArchiveClassMutation()
  const [update, { isLoading: updating }] = useUpdateClassMutation()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !cls) return <Skeleton active paragraph={{ rows: 6 }} />

  return (
    <>
      <PageHeader
        back={{ to: '/classes', label: 'Klasy' }}
        eyebrow="Klasa"
        title={cls.name}
        meta={
          <Flex align="center" gap={8} wrap>
            <Typography.Text type="secondary">Kod dla uczniów:</Typography.Text>
            <Typography.Text strong code copyable={{ icon: <CopyOutlined />, text: cls.joinCode }} style={{ fontSize: 18 }}>
              {cls.joinCode}
            </Typography.Text>
            <Popconfirm
              title="Wygenerować nowy kod?"
              description="Stary kod przestanie działać. Uczniowie już w klasie zostają."
              okText="Nowy kod"
              cancelText="Anuluj"
              onConfirm={async () => {
                try {
                  await regenerate(cls.id).unwrap()
                } catch (e) {
                  void message.error(errorMessage(e))
                }
              }}
            >
              <Button size="small" icon={<ReloadOutlined />} loading={regenerating}>
                Nowy kod
              </Button>
            </Popconfirm>
            <Switch
              size="small"
              checked={cls.joiningOpen}
              loading={updating}
              aria-label="Zapisy do klasy"
              onChange={async (joiningOpen) => {
                try {
                  await update({ id: cls.id, joiningOpen }).unwrap()
                } catch (e) {
                  void message.error(errorMessage(e))
                }
              }}
            />
            <Typography.Text type="secondary">{cls.joiningOpen ? 'zapisy otwarte' : 'zapisy zamknięte'}</Typography.Text>
          </Flex>
        }
        extra={
          <Flex gap={8} wrap>
          <RenameClass cls={cls} />
          <Popconfirm
            title="Zarchiwizować klasę?"
            description="Zniknie z list, ale wyniki zostają zachowane."
            okText="Archiwizuj"
            cancelText="Anuluj"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              try {
                await archive(cls.id).unwrap()
                navigate('/classes')
              } catch (e) {
                void message.error(errorMessage(e))
              }
            }}
          >
            <Button danger>Archiwizuj</Button>
          </Popconfirm>
          </Flex>
        }
      />
      <Tabs
        destroyOnHidden
        items={[
          { key: 'students', label: `Uczniowie (${cls.members.length})`, children: <Students cls={cls} /> },
          { key: 'assignments', label: `Zadania (${cls.assignments.length})`, children: <Assignments cls={cls} /> },
          { key: 'report', label: 'Raport', children: <Report cls={cls} /> },
        ]}
      />
    </>
  )
}
