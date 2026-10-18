import { DeleteOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tag, Typography, App as AntdApp } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { errorMessage, useCreateTokenMutation, useListTokensQuery, useRevokeTokenMutation } from '../../app/api'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
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
  const { isAdmin, isTeacher } = useAuth()
  const { message } = AntdApp.useApp()
  const { data, isLoading, error } = useListTokensQuery()
  const [createToken, { isLoading: creating }] = useCreateTokenMutation()
  const [revokeToken] = useRevokeTokenMutation()
  const [created, setCreated] = useState<CreatedApiToken | null>(null)
  const [form] = Form.useForm<FormValues>()
  const phone = useMediaQuery(PHONE_QUERY)

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

  const permissionTag = (permissions: string[]) => (
    <>
      {permissions.includes('write:quizzes') && <Tag color="gold">zapis quizów</Tag>}
      {permissions.includes('manage:classes') && <Tag color="blue">klasy i wyniki uczniów</Tag>}
      {permissions.length === 0 && <Tag>odczyt i nauka</Tag>}
    </>
  )

  const revokeButton = (token: ApiTokenSummary) => (
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
  )

  const columns: TableColumnsType<ApiTokenSummary> = [
    { title: 'Nazwa', dataIndex: 'name' },
    { title: 'Token', dataIndex: 'prefix', render: (prefix: string) => <code>{prefix}…</code> },
    { title: 'Uprawnienia', dataIndex: 'permissions', render: permissionTag },
    { title: 'Wygasa', dataIndex: 'expiresAt', render: (v: string | null) => formatDate(v, 'nigdy') },
    { title: 'Ostatnio użyty', dataIndex: 'lastUsedAt', render: (v: string | null) => formatDate(v, 'nie używany') },
    { title: '', key: 'actions', render: (_v, token) => revokeButton(token) },
  ]

  // phones: one card-like row per token
  const phoneColumns: TableColumnsType<ApiTokenSummary> = [
    {
      key: 'token',
      render: (_v, token) => (
        <Flex justify="space-between" align="flex-start" gap={8}>
          <Flex vertical gap={4} style={{ minWidth: 0 }}>
            <Typography.Text strong style={{ wordBreak: 'break-word' }}>
              {token.name}
            </Typography.Text>
            <Flex wrap gap={6} align="center">
              <code>{token.prefix}…</code>
              {permissionTag(token.permissions)}
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 14 }}>
              Wygasa: {formatDate(token.expiresAt, 'nigdy')}
              <br />
              Ostatnio użyty: {formatDate(token.lastUsedAt, 'nie używany')}
            </Typography.Text>
          </Flex>
          {revokeButton(token)}
        </Flex>
      ),
    },
  ]

  const curl = created
    ? `curl -H "Authorization: Bearer ${created.token}" ${window.location.origin}/api/quizzes`
    : ''

  return (
    <Card title="Tokeny API" style={{ marginTop: 24 }}>
      <Typography.Paragraph type="secondary">
        Osobiste tokeny pozwalają wywoływać API z skryptów (nagłówek <code>Authorization: Bearer …</code>) bez
        logowania w przeglądarce. Token działa z Twoimi uprawnieniami, a po utworzeniu widać go tylko raz.
      </Typography.Paragraph>

      <Form<FormValues>
        form={form}
        layout={phone ? 'vertical' : 'inline'}
        initialValues={{ expiresInDays: 90, write: false, classes: false }}
        onFinish={onFinish}
        style={{ rowGap: 12, marginBottom: 16 }}
      >
        <Form.Item name="name" rules={[{ required: true, whitespace: true, message: 'Podaj nazwę' }]}>
          <Input placeholder="Nazwa, np. skrypt backupu" maxLength={80} style={{ width: phone ? '100%' : 240 }} />
        </Form.Item>
        <Form.Item name="expiresInDays">
          <Select options={EXPIRY_OPTIONS} aria-label="Ważność tokenu" style={{ width: phone ? '100%' : 170 }} />
        </Form.Item>
        {isAdmin && (
          <Form.Item name="write" valuePropName="checked" label="Zapis quizów">
            <Switch />
          </Form.Item>
        )}
        {isTeacher && (
          <Form.Item name="classes" valuePropName="checked" label="Klasy i wyniki uczniów">
            <Switch />
          </Form.Item>
        )}
        <Form.Item style={phone ? { marginBottom: 0 } : undefined}>
          <Button type="primary" htmlType="submit" loading={creating} block={phone}>
            Utwórz token
          </Button>
        </Form.Item>
      </Form>

      {error && <Alert type="error" showIcon title={errorMessage(error)} style={{ marginBottom: 16 }} />}
      <Table<ApiTokenSummary>
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={phone ? phoneColumns : columns}
        showHeader={!phone}
        className={phone ? 'card-rows card-rows-flush' : undefined}
        dataSource={data}
        pagination={false}
        scroll={phone ? undefined : { x: 'max-content' }}
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
