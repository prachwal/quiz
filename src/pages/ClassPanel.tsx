import { CopyOutlined } from '@ant-design/icons'
import { Alert, Button, Flex, Input, Popconfirm, Segmented, Skeleton, Switch, Table, Tag, Typography, App as AntdApp } from 'antd'
import type { TableColumnsType } from 'antd'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  errorMessage,
  useArchiveClassMutation,
  useGetClassQuery,
  useListClassesQuery,
  useUpdateClassMutation,
} from '../app/api'
import { PHONE_QUERY, useMediaQuery } from '../app/useMediaQuery'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../features/auth/useAuth'
import { NewClassButton, RenameClass, Students } from '../features/classes/ClassParts'
import type { ClassSummary } from '../shared/quiz/types'

/** Students of one class, loaded when its row is expanded. */
function ExpandedClass({ summary, readOnly }: { summary: ClassSummary; readOnly: boolean }) {
  const { data, error, isLoading } = useGetClassQuery(summary.id)
  if (error) return <Alert type="error" showIcon title={errorMessage(error)} />
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 2 }} />
  return (
    <Flex vertical gap={12}>
      {!readOnly && (
        <Flex>
          <RenameClass cls={data} />
        </Flex>
      )}
      <Students cls={data} readOnly={readOnly} />
    </Flex>
  )
}

/**
 * Class management for teachers (their own classes) and admins (every class; they can look, only the owning
 * teacher changes anything). Rows expand to the students; the class page has assignments and the report.
 */
export default function ClassPanel() {
  const { isAdmin, isTeacher, user } = useAuth()
  const [scope, setScope] = useState<'own' | 'all'>(isTeacher ? 'own' : 'all')
  const [query, setQuery] = useState('')
  const { data, error, isLoading, isFetching } = useListClassesQuery({ scope })
  const [update] = useUpdateClassMutation()
  const [archive] = useArchiveClassMutation()
  const navigate = useNavigate()
  const phone = useMediaQuery(PHONE_QUERY)
  const { message } = AntdApp.useApp()

  const showOwner = scope === 'all'
  const isOwner = (c: ClassSummary) => c.ownerId === user?.sub

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter(
      (c) => !q || `${c.name} ${c.joinCode} ${c.ownerName ?? ''} ${c.ownerId}`.toLowerCase().includes(q),
    )
  }, [data, query])

  const run = async (work: () => Promise<unknown>) => {
    try {
      await work()
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const joiningSwitch = (c: ClassSummary) => (
    <Flex align="center" gap={8}>
      <Switch
        size="small"
        checked={c.joiningOpen}
        disabled={!isOwner(c)}
        aria-label={`Zapisy do klasy ${c.name}`}
        onChange={(joiningOpen) => void run(() => update({ id: c.id, joiningOpen }).unwrap())}
      />
      <Typography.Text type="secondary">{c.joiningOpen ? 'otwarte' : 'zamknięte'}</Typography.Text>
    </Flex>
  )

  const code = (c: ClassSummary) => (
    <Typography.Text code copyable={{ icon: <CopyOutlined />, text: c.joinCode }}>
      {c.joinCode}
    </Typography.Text>
  )

  const owner = (c: ClassSummary) => (
    <Flex vertical style={{ minWidth: 0 }}>
      <Typography.Text ellipsis>{c.ownerName ?? 'Nauczyciel'}</Typography.Text>
      <Typography.Text type="secondary" ellipsis copyable={{ text: c.ownerId }} style={{ fontSize: 12 }}>
        {c.ownerId}
      </Typography.Text>
    </Flex>
  )

  const actions = (c: ClassSummary) => (
    <Flex gap={8} wrap>
      <Link to={`/classes/${c.id}`}>
        <Button size="small">Otwórz</Button>
      </Link>
      {isOwner(c) && (
        <Popconfirm
          title="Zarchiwizować klasę?"
          description="Zniknie z list, ale wyniki zostają zachowane."
          okText="Archiwizuj"
          cancelText="Anuluj"
          okButtonProps={{ danger: true }}
          onConfirm={() => run(() => archive(c.id).unwrap())}
        >
          <Button size="small" danger>
            Archiwizuj
          </Button>
        </Popconfirm>
      )}
    </Flex>
  )

  const columns: TableColumnsType<ClassSummary> = [
    {
      title: 'Klasa',
      key: 'name',
      render: (_v, c) => (
        <Flex align="center" gap={8} wrap>
          <Link to={`/classes/${c.id}`}>
            <Typography.Text strong>{c.name}</Typography.Text>
          </Link>
          {!isOwner(c) && <Tag>podgląd</Tag>}
        </Flex>
      ),
    },
    ...(showOwner ? [{ title: 'Nauczyciel', key: 'owner', render: (_v: unknown, c: ClassSummary) => owner(c) }] : []),
    { title: 'Uczniowie', dataIndex: 'memberCount', align: 'right' as const, width: 100 },
    { title: 'Zadania', dataIndex: 'assignmentCount', align: 'right' as const, width: 90 },
    { title: 'Zapisy', key: 'joining', width: 140, render: (_v, c) => joiningSwitch(c) },
    { title: 'Kod', key: 'code', width: 130, render: (_v, c) => code(c) },
    { title: '', key: 'actions', width: 190, render: (_v, c) => actions(c) },
  ]

  const phoneColumns: TableColumnsType<ClassSummary> = [
    {
      key: 'card',
      render: (_v, c) => (
        <Flex vertical gap={8}>
          <Flex align="center" gap={8} wrap>
            <Link to={`/classes/${c.id}`}>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {c.name}
              </Typography.Text>
            </Link>
            {!isOwner(c) && <Tag>podgląd</Tag>}
          </Flex>
          {showOwner && owner(c)}
          <Flex gap={6} wrap>
            <Tag>{c.memberCount} uczniów</Tag>
            <Tag>{c.assignmentCount} zadań</Tag>
          </Flex>
          <Flex align="center" gap={12} wrap>
            {code(c)}
            {joiningSwitch(c)}
          </Flex>
          {actions(c)}
        </Flex>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={isAdmin && !isTeacher ? 'Admin' : 'Nauczyciel'}
        title="Zarządzanie klasami"
        subtitle={
          isAdmin
            ? 'Administrator widzi wszystkie klasy; zmiany wprowadza nauczyciel-właściciel.'
            : 'Twoje klasy: uczniowie, zapisy po kodzie, zadania i wyniki.'
        }
        extra={isTeacher ? <NewClassButton onCreated={(id) => navigate(`/classes/${id}`)} /> : undefined}
      />
      <Flex gap={12} wrap align="center" style={{ marginBottom: 16 }}>
        {isAdmin && isTeacher && (
          <Segmented
            value={scope}
            onChange={(v) => setScope(v as 'own' | 'all')}
            options={[
              { value: 'own', label: 'Moje klasy' },
              { value: 'all', label: 'Wszystkie klasy' },
            ]}
          />
        )}
        <Input.Search
          allowClear
          placeholder="Szukaj: nazwa, kod, nauczyciel"
          onSearch={setQuery}
          onChange={(e) => !e.target.value && setQuery('')}
          style={{ maxWidth: 360 }}
          aria-label="Szukaj klasy"
        />
      </Flex>
      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      <Table<ClassSummary>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={phone ? phoneColumns : columns}
        showHeader={!phone}
        dataSource={rows}
        pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false, simple: phone } : false}
        expandable={{ expandedRowRender: (c) => <ExpandedClass summary={c} readOnly={!isOwner(c)} />, rowExpandable: () => true }}
        className={phone ? 'card-rows' : undefined}
        locale={{ emptyText: isTeacher ? 'Nie masz jeszcze klas - utwórz pierwszą przyciskiem „Nowa klasa”' : 'Brak klas' }}
      />
    </>
  )
}
