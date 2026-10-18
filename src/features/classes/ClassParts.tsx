import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Flex, Form, Input, Modal, Popconfirm, Typography, App as AntdApp } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  errorMessage,
  useAddClassMemberMutation,
  useCreateClassMutation,
  useRemoveClassMemberMutation,
  useUpdateClassMutation,
} from '../../app/api'
import type { ClassDetail as ClassDetailData, ClassSummary } from '../../shared/quiz/types'

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

export function AddStudent({ cls }: { cls: Pick<ClassSummary, 'id' | 'joinCode'> }) {
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
