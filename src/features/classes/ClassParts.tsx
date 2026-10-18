import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Flex, Form, Input, Modal, Popconfirm, Select, Tag, Typography, App as AntdApp } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  errorMessage,
  useAddClassMemberMutation,
  useCreateClassMutation,
  useRemoveClassMemberMutation,
  useSearchStudentCandidatesQuery,
  useUpdateClassMutation,
} from '../../app/api'
import { isAuth0Id } from '../../shared/quiz/auth0Id'
import type { ClassDetail as ClassDetailData, ClassSummary, StudentCandidate } from '../../shared/quiz/types'

/** Pieces of class management shared by the class page and the class panel. */

export function RenameClass({ cls }: { cls: Pick<ClassSummary, 'id' | 'name'> }) {
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

const MIN_QUERY = 3

/**
 * "Add a student": a dropdown that filters as you type (part of the name, e-mail or Auth0 id, 3+ characters)
 * and lists accounts that are not in the class yet. A complete Auth0 id can also be pasted and added directly.
 */
export function AddStudent({ cls }: { cls: Pick<ClassSummary, 'id' | 'joinCode'> }) {
  const [add, { isLoading: adding }] = useAddClassMemberMutation()
  const [typed, setTyped] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<string>()
  const { message } = AntdApp.useApp()

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(typed.trim()), 250)
    return () => clearTimeout(timer)
  }, [typed])

  const enough = debounced.length >= MIN_QUERY
  const { data, isFetching } = useSearchStudentCandidatesQuery({ classId: cls.id, q: debounced }, { skip: !enough })

  const options = [
    ...(data ?? []).map((c) => ({
      value: c.userId,
      label: c.name ?? c.userId,
      candidate: c,
      disabled: c.inClass,
    })),
    // a pasted, complete Auth0 id that the search did not find can still be added
    ...(isAuth0Id(typed.trim()) && !(data ?? []).some((c) => c.userId === typed.trim())
      ? [{ value: typed.trim(), label: `Dodaj po identyfikatorze: ${typed.trim()}`, candidate: null, disabled: false }]
      : []),
  ]

  const submit = async () => {
    if (!selected) return
    try {
      const result = await add({ classId: cls.id, userId: selected }).unwrap()
      void message.success(result.status === 'added' ? 'Uczeń dodany do klasy' : 'Uczeń już jest w tej klasie')
      setSelected(undefined)
      setTyped('')
      setDebounced('')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <Flex vertical gap={4} style={{ marginBottom: 16 }}>
      <Flex gap={8} wrap>
        <Select<string>
          showSearch
          value={selected}
          searchValue={typed}
          onSearch={setTyped}
          onChange={setSelected}
          filterOption={false}
          loading={isFetching}
          options={options}
          placeholder="Wpisz fragment imienia, e-maila lub identyfikatora"
          notFoundContent={
            enough
              ? isFetching
                ? 'Szukam…'
                : 'Nikogo nie znaleziono. Szukam tylko wśród osób, które już logowały się do aplikacji (bez Ciebie); możesz też wkleić pełny identyfikator Auth0.'
              : `Wpisz co najmniej ${MIN_QUERY} znaki`
          }
          style={{ flex: '1 1 320px', minWidth: 0 }}
          aria-label="Wybór ucznia do dodania"
          optionRender={(option) => {
            const c = (option.data as { candidate: StudentCandidate | null }).candidate
            if (!c) return <span>{option.label}</span>
            return (
              <Flex vertical>
                <span>
                  {c.name ?? c.userId}
                  {c.inClass && <Tag style={{ marginInlineStart: 8 }}>już w klasie</Tag>}
                </span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {c.userId}
                  {c.emailMasked ? ` · ${c.emailMasked}` : ''}
                </Typography.Text>
              </Flex>
            )
          }}
        />
        <Button type="primary" disabled={!selected} loading={adding} onClick={() => void submit()}>
          Dodaj ucznia
        </Button>
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Znajdziesz osoby, które już logowały się do aplikacji. Uczeń może też dołączyć sam kodem klasy: {cls.joinCode}.
      </Typography.Text>
    </Flex>
  )
}

export function Students({ cls, readOnly = false }: { cls: ClassDetailData; readOnly?: boolean }) {
  const [remove] = useRemoveClassMemberMutation()
  const { message } = AntdApp.useApp()
  if (cls.members.length === 0) {
    return (
      <>
        {!readOnly && <AddStudent cls={cls} />}
        <Empty description={readOnly ? 'Brak uczniów' : `Brak uczniów. Przekaż im kod klasy: ${cls.joinCode}`} />
      </>
    )
  }
  return (
    <Flex vertical gap={8}>
      {!readOnly && <AddStudent cls={cls} />}
      {cls.members.map((m) => (
        <Flex key={m.userId} justify="space-between" align="center" gap={12}>
          <Flex vertical style={{ minWidth: 0 }}>
            <Link to={`/classes/${cls.id}/students/${encodeURIComponent(m.userId)}`} className="student-link">
              <Typography.Text strong ellipsis>
                {m.name ?? m.email ?? m.userId}
              </Typography.Text>
            </Link>
            <Typography.Text type="secondary" ellipsis copyable={{ text: m.userId }} style={{ fontSize: 12 }} aria-label="Identyfikator Auth0">
              {m.userId}
            </Typography.Text>
            {m.email && m.email !== m.name && (
              <Typography.Text type="secondary" ellipsis style={{ fontSize: 13 }}>
                {m.email}
              </Typography.Text>
            )}
          </Flex>
          <Link to={`/classes/${cls.id}/students/${encodeURIComponent(m.userId)}`}>
            <Button size="small">Wyniki</Button>
          </Link>
          {!readOnly && (
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
          )}
        </Flex>
      ))}
    </Flex>
  )
}


/** "Nowa klasa" button with its name dialog; calls `onCreated` with the new class id. */
export function NewClassButton({ onCreated }: { onCreated?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [create, { isLoading }] = useCreateClassMutation()
  const [form] = Form.useForm<{ name: string }>()
  const { message } = AntdApp.useApp()
  return (
    <>
      <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
        Nowa klasa
      </Button>
      <Modal
        open={open}
        title="Nowa klasa"
        okText="Utwórz"
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
          onFinish={async ({ name }) => {
            try {
              const created = await create({ name }).unwrap()
              setOpen(false)
              form.resetFields()
              onCreated?.(created.id)
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
            <Input maxLength={80} placeholder="np. 3A – angielski" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
