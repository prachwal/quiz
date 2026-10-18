import {
  CommentOutlined,
  DownOutlined,
  ProfileOutlined,
  TeamOutlined,
  InfoCircleOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Drawer, Dropdown, Flex, Layout, Menu, Tag, Typography, theme } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppDispatch } from '../app/hooks'
import { useDocumentTheme } from '../app/useDocumentTheme'
import { PHONE_QUERY } from '../app/useMediaQuery'
import { useResolvedTheme } from '../app/useResolvedTheme'
import { useThemeVars } from '../app/themeVars'
import { useAuth } from '../features/auth/useAuth'
import { openFeedback } from '../features/feedback/feedbackSlice'
import StreakChip from '../features/progress/StreakChip'
import { useTimezoneSync } from '../features/progress/useTimezoneSync'
import BottomNav from './BottomNav'
import BrandMark from './BrandMark'
import { navItems, selectedNavKey } from './navItems'

const { Header, Content, Footer } = Layout

// Which navigation is visible is decided by CSS media queries in index.css (no JS breakpoints, so
// nothing flashes on first paint): pill nav >= 992px, hamburger + Drawer 768-991px, bottom tab bar
// below 768px (the user menu then also holds "O aplikacji").
export default function AppLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { token } = theme.useToken()
  const vars = useThemeVars()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const { isAuthenticated, user, roles, isTeacher, isAdmin, logout } = useAuth()
  const selected = selectedNavKey(pathname)
  const displayName = user?.name ?? user?.email
  useDocumentTheme(useResolvedTheme() === 'dark')
  useTimezoneSync()

  // soft fade-in on route change, without remounting the page
  useEffect(() => {
    window.scrollTo({ top: 0 })
    const el = pageRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // phones: opacity only - a transform would turn the page into the containing block of the
    // fixed action bars (quiz / lesson) for the duration of the animation
    const shift = window.matchMedia(PHONE_QUERY).matches ? 'none' : 'translateY(6px)'
    el.animate(
      [
        { opacity: 0, transform: shift },
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
    <Layout className="app-shell app-root" style={vars}>
      <Header
        className="app-header"
        style={{
          background: `color-mix(in srgb, ${token.colorBgContainer} 82%, transparent)`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Flex align="center" gap={24} className="app-container" style={{ height: '100%' }}>
          <Link to="/" aria-label="Quiz - strona główna" style={{ flex: 'none' }} className="app-brand-link">
            <BrandMark />
          </Link>

          <nav className="app-nav" aria-label="Główna nawigacja">
            {navItems.map((item) => (
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

          <Flex align="center" gap={8} style={{ marginInlineStart: 'auto', minWidth: 0 }}>
            {isAuthenticated && <StreakChip />}
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
                        <Flex vertical gap={2} style={{ padding: '2px 0', color: token.colorText, maxWidth: 260 }}>
                          <Typography.Text strong ellipsis>
                            {displayName}
                          </Typography.Text>
                          {user?.email && user.email !== displayName && (
                            <Typography.Text type="secondary" ellipsis style={{ fontSize: 13 }}>
                              {user.email}
                            </Typography.Text>
                          )}
                          {roleTags.length > 0 && (
                            <Flex gap={4} wrap className="app-menu-roles">
                              {roleTags}
                            </Flex>
                          )}
                        </Flex>
                      ),
                    },
                    { type: 'divider' },
                    { key: 'assignments', icon: <ProfileOutlined />, label: 'Moje zadania', onClick: () => navigate('/assignments') },
                    ...(isTeacher || isAdmin
                      ? [{ key: 'classes', icon: <TeamOutlined />, label: 'Zarządzanie klasami', onClick: () => navigate('/manage/classes') }]
                      : []),
                    { key: 'settings', icon: <SettingOutlined />, label: 'Ustawienia', onClick: () => navigate('/settings') },
                    {
                      key: 'feedback',
                      icon: <CommentOutlined />,
                      label: 'Zgłoś uwagę',
                      onClick: () => dispatch(openFeedback()),
                    },
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
                    <span className="app-user-name">
                      <Typography.Text ellipsis style={{ maxWidth: 160, fontWeight: 500 }}>
                        {displayName}
                      </Typography.Text>
                      {roleTags}
                    </span>
                    <DownOutlined style={{ fontSize: 11, color: token.colorTextTertiary }} />
                  </Flex>
                </Button>
              </Dropdown>
            )}
            <Button
              type="text"
              className="app-menu-btn"
              icon={<MenuOutlined />}
              aria-label="Otwórz menu"
              onClick={() => setDrawerOpen(true)}
              style={{ width: 44, height: 44 }}
            />
          </Flex>
        </Flex>
      </Header>

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
          items={navItems.map(({ key, label, icon }) => ({ key, label, icon }))}
          onClick={({ key }) => {
            setDrawerOpen(false)
            navigate(key)
          }}
          style={{ borderInlineEnd: 0, fontSize: 16 }}
        />
        {isAuthenticated && (
          <Button
            block
            icon={<ProfileOutlined />}
            onClick={() => {
              setDrawerOpen(false)
              navigate('/assignments')
            }}
            style={{ marginTop: 16 }}
          >
            Moje zadania
          </Button>
        )}
        {isAuthenticated && (isTeacher || isAdmin) && (
          <Button
            block
            icon={<TeamOutlined />}
            onClick={() => {
              setDrawerOpen(false)
              navigate('/manage/classes')
            }}
            style={{ marginTop: 12 }}
          >
            Zarządzanie klasami
          </Button>
        )}
        {isAuthenticated && (
          <Button
            block
            icon={<CommentOutlined />}
            onClick={() => {
              setDrawerOpen(false)
              dispatch(openFeedback())
            }}
            style={{ marginTop: 16 }}
          >
            Zgłoś uwagę
          </Button>
        )}
        {isAuthenticated && (
          <Button block danger icon={<LogoutOutlined />} onClick={logout} style={{ marginTop: 12 }}>
            Wyloguj
          </Button>
        )}
      </Drawer>

      <Content className="app-content">
        <div ref={pageRef} className="app-container">
          <Outlet />
        </div>
      </Content>
      <Footer className="app-footer" style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        <Flex className="app-container" justify="space-between" align="center" wrap gap={8}>
          <BrandMark size={22} />
          <Flex align="center" gap={16} wrap>
            <Link to="/about" className="app-footer-link">
              <InfoCircleOutlined /> O aplikacji
            </Link>
            <Typography.Text type="secondary" style={{ fontSize: 14 }}>
              React 19 · Ant Design · Redux Toolkit
            </Typography.Text>
          </Flex>
        </Flex>
      </Footer>
      <BottomNav selected={selected} />
    </Layout>
  )
}
