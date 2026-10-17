import { Typography, theme } from 'antd'

export const LETTERS = 'ABCDEFGHIJKLMNOPQRST'

export default function ChoiceTile({
  label,
  text,
  selected,
  kind,
  onClick,
}: {
  label: string
  text: string
  selected: boolean
  kind: 'radio' | 'checkbox'
  onClick: () => void
}) {
  const { token } = theme.useToken()
  return (
    <button
      type="button"
      role={kind}
      aria-checked={selected}
      className="choice-tile"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        minHeight: 76,
        padding: '14px 18px',
        borderRadius: token.borderRadiusLG,
        border: `2px solid ${selected ? token.colorPrimary : token.colorBorder}`,
        background: selected ? token.colorPrimaryBg : token.colorBgContainer,
        boxShadow: selected ? `0 0 0 4px ${token.colorPrimaryBg}` : 'var(--app-shadow-sm)',
        color: token.colorText,
      }}
    >
      <span
        aria-hidden
        style={{
          flex: 'none',
          width: 34,
          height: 34,
          display: 'grid',
          placeItems: 'center',
          borderRadius: kind === 'radio' ? '50%' : token.borderRadiusSM,
          fontWeight: 700,
          fontSize: 15,
          transition: 'background-color 0.15s, color 0.15s',
          background: selected ? token.colorPrimary : token.colorFillSecondary,
          color: selected ? token.colorTextLightSolid : token.colorTextSecondary,
        }}
      >
        {label}
      </span>
      <Typography.Text style={{ fontSize: 18, lineHeight: 1.4, fontWeight: selected ? 600 : 500, wordBreak: 'break-word' }}>{text}</Typography.Text>
    </button>
  )
}
