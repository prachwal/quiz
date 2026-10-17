import { SearchOutlined } from '@ant-design/icons'
import { Alert, Avatar, Checkbox, Flex, Input, Popconfirm, Switch, Table, Tag, Typography, App as AntdApp } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { errorMessage, useListAdminUsersQuery, useSetUserBlockedMutation, useSetUserRolesMutation } from '../../app/api'
import { PHONE_QUERY, useMediaQuery } from '../../app/useMediaQuery'
import { useAuth } from '../auth/useAuth'
import { MANAGED_ROLES } from '../../shared/quiz/types'
import type { AdminUser, ManagedRole } from '../../shared/quiz/types'

const ROLE_LABELS: Record<ManagedRole, string> = { admin: 'Admin', student: 'Student' }

const PROVIDERS: Record<string, string> = {
  'google-oauth2': 'Google',
  github: 'GitHub',
  discord: 'Discord',
  twitch: 'Twitch',
  'Username-Password-Authentication': 'E-mail i hasło',
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : 'nigdy'

export default function UsersAdmin() {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const { data, error, isFetching } = useListAdminUsersQuery({ q: query, page })
  const [setRoles, { isLoading: savingRoles }] = useSetUserRolesMutation()
  const [setBlocked, { isLoading: savingBlock }] = useSetUserBlockedMutation()
  const { message } = AntdApp.useApp()
  const { user: me } = useAuth()
  const phone = useMediaQuery(PHONE_QUERY)

  const changeRoles = async (user: AdminUser, roles: ManagedRole[]) => {
    try {
      await setRoles({ id: user.id, roles }).unwrap()
      void message.success('Role zapisane. Zmiana zadziała po ponownym zalogowaniu użytkownika.')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const changeBlocked = async (user: AdminUser, blocked: boolean) => {
    try {
      await setBlocked({ id: user.id, blocked }).unwrap()
      void message.success(blocked ? 'Konto zablokowane' : 'Konto odblokowane')
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  const rolesControl = (user: AdminUser) => (
    <Checkbox.Group
      value={user.roles}
      disabled={savingRoles}
      onChange={(values) => void changeRoles(user, values as ManagedRole[])}
      options={MANAGED_ROLES.map((role) => ({
        value: role,
        label: ROLE_LABELS[role],
        // you cannot take the admin role away from yourself
        disabled: role === 'admin' && user.id === me?.sub && user.roles.includes('admin'),
      }))}
    />
  )

  const blockControl = (user: AdminUser) => (
    <Popconfirm
      title={user.blocked ? 'Odblokować to konto?' : 'Zablokować to konto?'}
      description={user.blocked ? undefined : 'Użytkownik nie będzie mógł się zalogować.'}
      okText={user.blocked ? 'Odblokuj' : 'Zablokuj'}
      cancelText="Anuluj"
      okButtonProps={{ danger: !user.blocked }}
      disabled={user.id === me?.sub}
      onConfirm={() => changeBlocked(user, !user.blocked)}
    >
      <Switch
        checked={user.blocked}
        disabled={savingBlock || user.id === me?.sub}
        checkedChildren="Zablokowany"
        unCheckedChildren="Aktywny"
        aria-label="Zablokowany"
      />
    </Popconfirm>
  )

  const identity = (user: AdminUser) => (
    <Flex align="center" gap={12} style={{ minWidth: 0 }}>
      <Avatar src={user.picture} size={40}>
        {(user.name ?? user.email)?.[0]?.toUpperCase()}
      </Avatar>
      <Flex vertical style={{ minWidth: 0 }}>
        <Typography.Text strong ellipsis>
          {user.name ?? user.email}
          {user.id === me?.sub && <Tag style={{ marginInlineStart: 8 }}>to Ty</Tag>}
        </Typography.Text>
        {user.email && user.email !== user.name && (
          <Typography.Text type="secondary" ellipsis style={{ fontSize: 13 }}>
            {user.email}
          </Typography.Text>
        )}
      </Flex>
    </Flex>
  )

  const columns: TableColumnsType<AdminUser> = [
    { title: 'Użytkownik', key: 'user', render: (_v, user) => identity(user) },
    { title: 'Logowanie', dataIndex: 'provider', render: (p: string) => <Tag>{PROVIDERS[p] ?? p}</Tag> },
    { title: 'Ostatnio', dataIndex: 'lastLogin', render: (v: string | null) => formatDate(v) },
    { title: 'Role', key: 'roles', render: (_v, user) => rolesControl(user) },
    { title: 'Konto', key: 'blocked', render: (_v, user) => blockControl(user) },
  ]

  const phoneColumns: TableColumnsType<AdminUser> = [
    {
      key: 'card',
      render: (_v, user) => (
        <Flex vertical gap={10}>
          {identity(user)}
          <Flex gap={6} wrap align="center">
            <Tag>{PROVIDERS[user.provider] ?? user.provider}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              ostatnio: {formatDate(user.lastLogin)}
            </Typography.Text>
          </Flex>
          {rolesControl(user)}
          {blockControl(user)}
        </Flex>
      ),
    },
  ]

  return (
    <Flex vertical gap="middle">
      <Alert
        type="info"
        showIcon
        title="Zarządzasz rolami Admin i Student"
        description="Inne role z tenanta Auth0 pozostają bez zmian. Użytkownik zobaczy nową rolę po ponownym zalogowaniu."
      />
      <Input.Search
        allowClear
        enterButton={<SearchOutlined />}
        placeholder="Szukaj po nazwie lub e-mailu"
        onSearch={(value) => {
          setQuery(value)
          setPage(0)
        }}
        style={{ maxWidth: 420 }}
      />
      {error && <Alert type="error" showIcon title={errorMessage(error)} />}
      <Table<AdminUser>
        rowKey="id"
        loading={isFetching}
        columns={phone ? phoneColumns : columns}
        showHeader={!phone}
        dataSource={data?.users}
        scroll={phone ? undefined : { x: 'max-content' }}
        pagination={{
          current: (data?.page ?? page) + 1,
          pageSize: data?.perPage ?? 20,
          total: data?.total ?? 0,
          showSizeChanger: false,
          simple: phone,
          onChange: (next) => setPage(next - 1),
        }}
        locale={{ emptyText: 'Brak użytkowników' }}
      />
    </Flex>
  )
}
