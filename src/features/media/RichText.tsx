import { MEDIA_MAX_IMAGES_PER_FIELD, parseRichText } from '../../shared/media/richText'
import type { RichTextPart } from '../../shared/media/richText'
import { MediaImage } from './MediaImage'

/** An image as a block of its own, with a small vertical gap around it. */
export function MediaBlock({ mediaId, alt }: { mediaId: string; alt: string }) {
  return (
    <span className="rich-text-image">
      <MediaImage mediaId={mediaId} alt={alt} />
    </span>
  )
}

/**
 * Text with optional images (`![opis](media:<uuid>)`). Text is rendered as plain text nodes, never as HTML.
 * Text without images is one `<span>`, the same visible result as the plain text it replaces.
 * Images beyond `imageMaxCount` are not rendered; their description stays as text.
 */
export function RichText({ text, imageMaxCount = MEDIA_MAX_IMAGES_PER_FIELD }: { text: string; imageMaxCount?: number }) {
  const parts = parseRichText(text)
  if (!parts.some((part) => part.type === 'image')) return <span>{text}</span>

  return (
    <>
      {limitImages(parts, imageMaxCount).map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.text}</span>
        if (!part.shown) return <span key={i}>{part.alt}</span>
        return <MediaBlock key={i} mediaId={part.mediaId} alt={part.alt} />
      })}
    </>
  )
}

type LimitedPart = { type: 'text'; text: string } | { type: 'image'; alt: string; mediaId: string; shown: boolean }

/** Marks the images past the limit (in reading order) as not shown. */
function limitImages(parts: RichTextPart[], max: number): LimitedPart[] {
  let seen = 0
  return parts.map((part) => {
    if (part.type === 'text') return part
    seen += 1
    return { ...part, shown: seen <= max }
  })
}
