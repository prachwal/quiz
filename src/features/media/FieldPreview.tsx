import { parseRichText } from '../../shared/media/richText'
import { RichText } from './RichText'

/** Live preview under an editor field: shown only when the text contains an image (the map comes from MediaProvider). */
export default function FieldPreview({ text }: { text: string }) {
  if (!parseRichText(text).some((part) => part.type === 'image')) return null
  return (
    <div className="media-field-preview" style={{ marginTop: 8 }}>
      <RichText text={text} />
    </div>
  )
}
