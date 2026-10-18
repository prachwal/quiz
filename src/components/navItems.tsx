import {
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  ReadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

export interface NavItem {
  key: string
  label: string
  icon: ReactNode
  /** shown in the phone bottom tab bar (the rest lives in the user menu) */
  tab: boolean
}

export const navItems: NavItem[] = [
  { key: '/', label: 'Quizy', icon: <AppstoreOutlined />, tab: true },
  { key: '/learn', label: 'Nauka', icon: <ReadOutlined />, tab: true },
  { key: '/verbs', label: 'Czasowniki', icon: <BookOutlined />, tab: true },
  { key: '/results', label: 'Wyniki', icon: <BarChartOutlined />, tab: true },
  { key: '/settings', label: 'Ustawienia', icon: <SettingOutlined />, tab: true },
]

/** Nav key of the section a path belongs to (quiz player/editor count as "Quizy"). */
export const selectedNavKey = (pathname: string) =>
  navItems.find((item) => item.key !== '/' && pathname.startsWith(item.key))?.key ?? '/'
