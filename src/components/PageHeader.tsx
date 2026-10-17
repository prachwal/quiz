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
    <header className="page-header">
      {back && (
        <Link
          to={back.to}
          className="muted-link page-back"
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
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <Typography.Title className="page-title" style={{ margin: 0, letterSpacing: -0.6, lineHeight: 1.2 }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Paragraph
              type="secondary"
              className="page-subtitle"
              style={{ margin: '8px 0 0', maxWidth: 720, lineHeight: 1.6 }}
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
        {extra && (
          <Flex gap="small" wrap className="page-header-extra">
            {extra}
          </Flex>
        )}
      </Flex>
    </header>
  )
}
