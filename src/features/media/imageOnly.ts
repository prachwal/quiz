import { parseRichText } from '../../shared/media/richText'

/**
 * The image of an option that consists of exactly one image (whitespace around it is ignored);
 * null for text, for text with an image, and for several images.
 */
export function imageOnlyOption(text: string): { mediaId: string; alt: string } | null {
  const parts = parseRichText(text).filter((part) => part.type === 'image' || part.text.trim() !== '')
  const [only] = parts
  if (parts.length !== 1 || only?.type !== 'image') return null
  return { mediaId: only.mediaId, alt: only.alt }
}
