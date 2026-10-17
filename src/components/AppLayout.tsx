import {
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  DownOutlined,
  InfoCircleOutlined,
  LogoutOutlined,
  MenuOutlined,
  ReadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Drawer, Dropdown, Flex, Grid, Layout, Menu, Tag, Typography, theme } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useThemeVars } from '../app/themeVars'
import { useAuth } from '../features/auth/useAuth'
import BrandMark from './BrandMark'

const { Header, Content, Footer } = Layout

const items = [
  { key: '/', label: 'Quizy', icon: <AppstoreOutlined /> },
  { key: '/learn', label: 'Nauka', icon: <ReadOutlined /> },
  { key: '/verbs', label: 'Czasowniki', icon: <BookOutlined /> },
  { key: '/results', label: 'Wyniki', icon: <BarChartOutlined /> },
  { key: '/about', label: 'O aplikacji', icon: <InfoCircleOutlined /> },
  { key: '/settings', label: 'Ustawienia', icon: <SettingOutlined /> },
]

export default function AppLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const vars = useThemeVars()
  const screens = Grid.useBreakpoint()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const { isAuthenticated, user, roles, logout } = useAuth()
  const selected = items.find((item) => item.key !== '/' && pathname.startsWith(item.key))?.key ?? '/'
  const desktop = Boolean(screens.lg)
  const displayName = user?.name ?? user?.email

  // soft fade-in on route change, without remounting the page
  useEffect(() => {
    window.scrollTo({ top: 0 })
    const el = pageRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 260, easing: 'ease-out' },
    )
  }, [pathname])

  const roleTags = roles.map((role) => (
    <Tag key={role} color={role === 'admin' ? 'gold' : 'purple'} variant="filled" style={{ marginInlineEnd: 0 }}>
      {role}
    </Tag>
  ))

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh', ...vars }}>
      <Header
        className="app-header"
        style={{
          background: `color-mix(in srgb, ${token.colorBgContainer} 82%, transparent)`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          lineHeight: 'normal',
        }}
      >
        <Flex align="center" gap={24} className="app-container" style={{ height: '100%' }}>
          <Link to="/" aria-label="Quiz - strona główna" style={{ flex: 'none' }}>
            <BrandMark />
          </Link>

          {desktop && (
            <nav className="app-nav" aria-label="Główna nawigacja">
              {items.map((item) => (
                <Link
                  key={item.key}
                  to={item.key}
                  className="app-nav-link"
                  aria-current={item.key === selected ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          <Flex align="center" gap={8} style={{ marginInlineStart: 'auto', minWidth: 0 }}>
            {isAuthenticated && (
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{
                  items: [
                    {
                      key: 'who',
                      disabled: true,
                      label: (
                        <Flex vertical gap={2} style={{ padding: '2px 0', color: token.colorText }}>
                          <Typography.Text strong>{displayName}</Typography.Text>
                          {user?.email && user.email !== displayName && (
                            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                              {user.email}
                            </Typography.Text>
                          )}
                        </Flex>
                      ),
                    },
                    { type: 'divider' },
                    { key: 'settings', icon: <SettingOutlined />, label: 'Ustawienia', onClick: () => navigate('/settings') },
                    { key: 'logout', icon: <LogoutOutlined />, label: 'Wyloguj', danger: true, onClick: logout },
                  ],
                }}
              >
                <Button
                  type="text"
                  aria-label="Menu użytkownika"
                  style={{ height: 44, paddingInline: 6, borderRadius: 999, maxWidth: 320 }}
                >
                  <Flex align="center" gap={10} style={{ minWidth: 0 }}>
                    <Avatar
                      src={user?.picture}
                      size={32}
                      style={{ flex: 'none', background: token.colorPrimary }}
                    >
                      {displayName?.[0]?.toUpperCase()}
                    </Avatar>
                    {screens.xl && (
                      <>
                        <Typography.Text ellipsis style={{ maxWidth: 160, fontWeight: 500 }}>
                          {displayName}
                        </Typography.Text>
                        {roleTags}
                      </>
                    )}
                    <DownOutlined style={{ fontSize: 11, color: token.colorTextTertiary }} />
                  </Flex>
                </Button>
              </Dropdown>
            )}
            {!desktop && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label="Otwórz menu"
                onClick={() => setDrawerOpen(true)}
                style={{ width: 44, height: 44 }}
              />
            )}
          </Flex>
        </Flex>
      </Header>

      {!desktop && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="right"
          size={300}
          title={<BrandMark size={28} />}
          styles={{ body: { padding: 12 } }}
        >
          {isAuthenticated && (
            <Flex
              align="center"
              gap={12}
              style={{
                padding: 12,
                marginBottom: 12,
                borderRadius: token.borderRadiusLG,
                background: token.colorFillQuaternary,
              }}
            >
              <Avatar src={user?.picture} size={40} style={{ flex: 'none', background: token.colorPrimary }}>
                {displayName?.[0]?.toUpperCase()}
              </Avatar>
              <Flex vertical gap={4} style={{ minWidth: 0 }}>
                <Typography.Text strong ellipsis>
                  {displayName}
                </Typography.Text>
                <Flex gap={4} wrap>
                  {roleTags}
                </Flex>
              </Flex>
            </Flex>
          )}
          <Menu
            mode="vertical"
            selectedKeys={[selected]}
            items={items}
            onClick={({ key }) => {
              setDrawerOpen(false)
              navigate(key)
            }}
            style={{ borderInlineEnd: 0, fontSize: 16 }}
          />
          {isAuthenticated && (
            <Button block danger icon={<LogoutOutlined />} onClick={logout} style={{ marginTop: 16 }}>
              Wyloguj
            </Button>
          )}
        </Drawer>
      )}

      <Content style={{ paddingBlock: '32px 48px' }}>
        <div ref={pageRef} className="app-container">
          <Outlet />
        </div>
      </Content>
      <Footer style={{ padding: '24px 0 32px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        <Flex className="app-container" justify="space-between" align="center" wrap gap={8}>
          <BrandMark size={22} />
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            React 19 · Ant Design · Redux Toolkit
          </Typography.Text>
        </Flex>
      </Footer>
    </Layout>
  )
}
