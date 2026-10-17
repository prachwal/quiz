import { RocketOutlined } from '@ant-design/icons'
import { Layout, Menu, Space, Typography } from 'antd'
import { Link, Outlet, useLocation } from 'react-router-dom'

const { Header, Content, Footer } = Layout

const items = [
  { key: '/', label: <Link to="/">Quizy</Link> },
  { key: '/learn', label: <Link to="/learn">Nauka</Link> },
  { key: '/verbs', label: <Link to="/verbs">Czasowniki</Link> },
  { key: '/results', label: <Link to="/results">Wyniki</Link> },
  { key: '/about', label: <Link to="/about">About</Link> },
  { key: '/settings', label: <Link to="/settings">Settings</Link> },
]

export default function AppLayout() {
  const { pathname } = useLocation()
  const selected = items.find((item) => item.key !== '/' && pathname.startsWith(item.key))?.key ?? '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Space>
          <RocketOutlined style={{ fontSize: 22, color: '#fff' }} />
          <Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>
            Quiz
          </Typography.Title>
        </Space>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selected]}
          items={items}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Header>
      <Content style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: 'center' }}>Quiz · React 19 · Ant Design · Redux Toolkit</Footer>
    </Layout>
  )
}
