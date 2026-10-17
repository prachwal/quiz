import { ArrowLeftOutlined } from '@ant-design/icons'
import { Flex, Typography, theme } from 'antd'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Consistent page heading: optional back link / eyebrow, title, subtitle, meta row and actions on the right. */
export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  back,
  meta,
  extra,
}: {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  back?: { to: string; label: ReactNode }
  meta?: ReactNode
  extra?: ReactNode
}) {
  const { token } = theme.useToken()
  return (
    <header style={{ marginBottom: 28 }}>
      {back && (
        <Link
          to={back.to}
          className="muted-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          <ArrowLeftOutlined style={{ fontSize: 13 }} /> {back.label}
        </Link>
      )}
      {eyebrow && !back && (
        <Typography.Text
          style={{
            display: 'block',
            marginBottom: 6,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: token.colorPrimary,
          }}
        >
          {eyebrow}
        </Typography.Text>
      )}
      <Flex justify="space-between" align="flex-end" wrap gap={16}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <Typography.Title style={{ margin: 0, letterSpacing: -0.6, lineHeight: 1.2 }}>{title}</Typography.Title>
          {subtitle && (
            <Typography.Paragraph
              type="secondary"
              style={{ margin: '8px 0 0', fontSize: 17, maxWidth: 720, lineHeight: 1.6 }}
            >
              {subtitle}
            </Typography.Paragraph>
          )}
          {meta && (
            <Flex wrap gap={6} align="center" style={{ marginTop: 12 }}>
              {meta}
            </Flex>
          )}
        </div>
        {extra && <Flex gap="small" wrap>{extra}</Flex>}
      </Flex>
    </header>
  )
}
