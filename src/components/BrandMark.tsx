import { RocketFilled } from '@ant-design/icons'
import { theme } from 'antd'

/** Logo: gradient badge with a rocket plus the wordmark. */
export default function BrandMark({ size = 34, showName = true }: { size?: number; showName?: boolean }) {
  const { token } = theme.useToken()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          display: 'grid',
          placeItems: 'center',
          borderRadius: size * 0.3,
          color: '#fff',
          fontSize: size * 0.5,
          background: `linear-gradient(135deg, ${token.colorPrimary} 0%, #8b5cf6 55%, #d946ef 100%)`,
          boxShadow: `0 6px 16px -6px ${token.colorPrimary}`,
        }}
      >
        <RocketFilled />
      </span>
      {showName && (
        <span
          style={{
            fontSize: size * 0.58,
            fontWeight: 700,
            letterSpacing: -0.4,
            color: token.colorText,
            lineHeight: 1,
          }}
        >
          Quiz
        </span>
      )}
    </span>
  )
}
