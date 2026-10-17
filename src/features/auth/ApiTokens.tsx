import { DeleteOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tag, Typography, App as AntdApp } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { errorMessage, useCreateTokenMutation, useListTokensQuery, useRevokeTokenMutation } from '../../app/api'
import type { TokenInput } from '../../shared/quiz/schema'
import type { ApiTokenSummary, CreatedApiToken } from '../../shared/quiz/types'
import { useAuth } from './useAuth'

const EXPIRY_OPTIONS: { value: FormValues['expiresInDays']; label: string }[] = [
  { value: 30, label: '30 dni' },
  { value: 90, label: '90 dni' },
  { value: 365, label: '1 rok' },
  { value: null, label: 'Bez wygaśnięcia' },
]

const formatDate = (value: string | null, fallback: string) =>
  value ? new Date(value).toLocaleString('pl-PL') : fallback

type FormValues = Required<TokenInput>

export default function ApiTokens() {
  const { isAdmin } = useAuth()
  const { message } = AntdApp.useApp()
  const { data, isLoading, error } = useListTokensQuery()
  const [createToken, { isLoading: creating }] = useCreateTokenMutation()
  const [revokeToken] = useRevokeTokenMutation()
  const [created, setCreated] = useState<CreatedApiToken | null>(null)
  const [form] = Form.useForm<FormValues>()

  const onFinish = async (values: FormValues) => {
    try {
      setCreated(await createToken(values).unwrap())
      form.resetFields()
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const revoke = async (id: string) => {
    try {
      await revokeToken(id).unwrap()
      void message.success('Token unieważniony')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const columns: TableColumnsType<ApiTokenSummary> = [
    { title: 'Nazwa', dataIndex: 'name' },
    { title: 'Token', dataIndex: 'prefix', render: (prefix: string) => <code>{prefix}…</code> },
    {
      title: 'Uprawnienia',
      dataIndex: 'permissions',
      render: (permissions: string[]) =>
        permissions.length ? <Tag color="gold">odczyt + zapis quizów</Tag> : <Tag>odczyt i nauka</Tag>,
    },
    { title: 'Wygasa', dataIndex: 'expiresAt', render: (v: string | null) => formatDate(v, 'nigdy') },
    { title: 'Ostatnio użyty', dataIndex: 'lastUsedAt', render: (v: string | null) => formatDate(v, 'nie używany') },
    {
      title: '',
      key: 'actions',
      render: (_v, token) => (
        <Popconfirm
          title="Unieważnić token?"
          description="Skrypty używające tego tokenu przestaną działać."
          okText="Unieważnij"
          cancelText="Anuluj"
          okButtonProps={{ danger: true }}
          onConfirm={() => revoke(token.id)}
        >
          <Button danger type="text" icon={<DeleteOutlined />} aria-label="Unieważnij token" />
        </Popconfirm>
      ),
    },
  ]

  const curl = created
    ? `curl -H "Authorization: Bearer ${created.token}" ${window.location.origin}/api/quizzes`
    : ''

  return (
    <Card title="Tokeny API" style={{ marginTop: 16 }}>
      <Typography.Paragraph type="secondary">
        Osobiste tokeny pozwalają wywoływać API z skryptów (nagłówek <code>Authorization: Bearer …</code>) bez
        logowania w przeglądarce. Token działa z Twoimi uprawnieniami, a po utworzeniu widać go tylko raz.
      </Typography.Paragraph>

      <Form<FormValues>
        form={form}
        layout="inline"
        initialValues={{ expiresInDays: 90, write: false }}
        onFinish={onFinish}
        style={{ rowGap: 12, marginBottom: 16 }}
      >
        <Form.Item name="name" rules={[{ required: true, whitespace: true, message: 'Podaj nazwę' }]}>
          <Input placeholder="Nazwa, np. skrypt backupu" maxLength={80} style={{ width: 240 }} />
        </Form.Item>
        <Form.Item name="expiresInDays">
          <Select options={EXPIRY_OPTIONS} style={{ width: 170 }} />
        </Form.Item>
        {isAdmin && (
          <Form.Item name="write" valuePropName="checked" label="Zapis quizów">
            <Switch />
          </Form.Item>
        )}
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={creating}>
            Utwórz token
          </Button>
        </Form.Item>
      </Form>

      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      <Table<ApiTokenSummary>
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={data}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Brak aktywnych tokenów' }}
      />

      <Modal
        open={created !== null}
        title="Token utworzony"
        onCancel={() => setCreated(null)}
        footer={<Button type="primary" onClick={() => setCreated(null)}>Zapisałem token</Button>}
        destroyOnHidden
      >
        <Flex vertical gap="small">
          <Alert type="warning" showIcon title="Skopiuj token teraz - później nie będzie można go zobaczyć." />
          <Typography.Paragraph copyable={{ text: created?.token }} style={{ wordBreak: 'break-all', marginBottom: 0 }}>
            <code>{created?.token}</code>
          </Typography.Paragraph>
          <Typography.Text type="secondary">Przykład:</Typography.Text>
          <Typography.Paragraph copyable={{ text: curl }} style={{ wordBreak: 'break-all', marginBottom: 0 }}>
            <code>{curl}</code>
          </Typography.Paragraph>
        </Flex>
      </Modal>
    </Card>
  )
}
