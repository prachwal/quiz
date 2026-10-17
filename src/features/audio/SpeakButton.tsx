import { SoundOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useSpeech } from './useSpeech'

/** Reads `parts` aloud (English). Renders nothing when the device has no English voice. */
export default function SpeakButton({
  speakKey,
  parts,
  label = 'Odsłuchaj',
  size = 'middle',
}: {
  speakKey: string
  parts: string[]
  label?: string
  size?: 'small' | 'middle' | 'large'
}) {
  const { available, activeKey, speak } = useSpeech()
  if (!available) return null
  const playing = activeKey === speakKey
  return (
    <Button
      shape="circle"
      size={size}
      type={playing ? 'primary' : 'default'}
      icon={<SoundOutlined />}
      aria-label={playing ? 'Zatrzymaj odczyt' : label}
      aria-pressed={playing}
      onClick={() => speak(speakKey, parts)}
    />
  )
}
