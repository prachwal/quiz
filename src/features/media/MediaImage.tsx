import { theme } from 'antd'
import type { MediaInfo } from '../../shared/media/types'
import { isTrustedMediaUrl } from './trustedUrl'
import { useMedia } from './useMedia'

/** Shown instead of an image that is missing from the map or whose address is not trusted. */
function MediaPlaceholder({ alt }: { alt: string }) {
  const { token } = theme.useToken()
  return (
    <span
      role="img"
      aria-label={alt}
      className="media-placeholder"
      style={{
        background: token.colorFillQuaternary,
        border: `1px dashed ${token.colorBorder}`,
        borderRadius: token.borderRadius,
        color: token.colorTextSecondary,
      }}
    >
      Obraz niedostępny
    </span>
  )
}

const dimension = (value: number | null) => (typeof value === 'number' && value > 0 ? value : undefined)

/** One image of a text, by its media id. The address comes from the media map, never from the text. */
export function MediaImage({ mediaId, alt }: { mediaId: string; alt: string }) {
  const { token } = theme.useToken()
  const map = useMedia()
  const info: MediaInfo | undefined = Object.prototype.hasOwnProperty.call(map, mediaId) ? map[mediaId] : undefined
  if (!info || !isTrustedMediaUrl(info.url)) return <MediaPlaceholder alt={alt} />

  const width = dimension(info.width)
  const height = dimension(info.height)
  return (
    <img
      className="media-image"
      src={info.url}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      // the box is known before the file loads, so the layout does not jump
      style={{
        aspectRatio: width && height ? `${width} / ${height}` : undefined,
        background: token.colorFillQuaternary,
        borderRadius: token.borderRadius,
      }}
    />
  )
}
