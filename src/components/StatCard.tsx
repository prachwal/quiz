import { Card, Flex, Typography, theme } from 'antd'
import type { ReactNode } from 'react'

/** A labelled number with an icon, used in result summaries. */
export default function StatCard({ label, value, icon, color }: { label: string; value: ReactNode; icon: ReactNode; color: string }) {
  const { token } = theme.useToken()
  return (
    <Card styles={{ body: { padding: 20 } }} style={{ height: '100%' }}>
      <Flex align="center" gap={16}>
        <span
          aria-hidden
          style={{
            flex: 'none',
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 12,
            fontSize: 20,
            color,
            background: token.colorFillQuaternary,
          }}
        >
          {icon}
        </span>
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            {label}
          </Typography.Text>
          <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{value}</span>
        </Flex>
      </Flex>
    </Card>
  )
}
