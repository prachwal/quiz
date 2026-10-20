/**
 * Image syntax of quiz and lesson text (Media-Storage-Plan, "Zapis obrazu w treści", D2/D4/D5).
 *
 * The only accepted form is `![opis](media:<uuid>)` on one line. This is not Markdown: no emphasis, links or
 * HTML. Pure and import-free, so the frontend, the server and the tests share one definition.
 *
 * Decision on UUIDs: lowercase hex only. `media:` followed by an uppercase uuid is rejected as a malformed
 * reference (the server always writes lowercase ids, so the author gets one canonical spelling).
 */

/** Alt text (the description) is 1..200 characters; an empty or whitespace-only one is rejected by `imageSyntaxErrors` (D5). */
export const MEDIA_ALT_MAX_LENGTH = 200
/** At most three images in one text field (question prompt, explanation, one option). */
export const MEDIA_MAX_IMAGES_PER_FIELD = 3
/** At most 100 image references in one quiz. */
export const MEDIA_MAX_REFERENCES_PER_QUIZ = 100

/** A complete, valid image. Groups: 1 = alt text, 2 = media id. */
const VALID_IMAGE = /!\[([^\]\n]{0,200})\]\(media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g
/** Anything shaped like an image: `![...](...)`. Used to find attempts that are not valid images. */
const IMAGE_SHAPE = /!\[([^\]\n]*)\]\(([^)\n]*)\)/g
const UUID_TARGET = /^media:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const EXTERNAL_TARGET = /^https?:\/\//i

export type RichTextPart = { type: 'text'; text: string } | { type: 'image'; alt: string; mediaId: string }

/** Splits text into text and image parts. Empty text parts are dropped; plain text gives one text part. */
export function parseRichText(text: string): RichTextPart[] {
  const parts: RichTextPart[] = []
  let last = 0
  for (const match of text.matchAll(VALID_IMAGE)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ type: 'text', text: text.slice(last, index) })
    parts.push({ type: 'image', alt: match[1], mediaId: match[2] })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}

/** Media ids of the valid images, in order of appearance (duplicates removed). */
export function extractMediaIds(text: string): string[] {
  return [...new Set([...text.matchAll(VALID_IMAGE)].map((match) => match[2]))]
}

/** Number of valid image references in the text (duplicates counted). */
export function countImages(text: string): number {
  return [...text.matchAll(VALID_IMAGE)].length
}

/** The text without its images (the text parts joined). */
export function stripImages(text: string): string {
  return text.replace(VALID_IMAGE, '')
}

/** True when the text contains anything shaped like an image, valid or not. */
export function hasImageSyntax(text: string): boolean {
  return [...text.matchAll(IMAGE_SHAPE)].length > 0
}

/**
 * Problems with the image syntax of one text field, in Polish, for the author. Empty list = fine.
 * Checks: external addresses (D4), targets that are not `media:<lowercase uuid>`, empty or blank alt (D5),
 * alt longer than 200 characters, more than three images in the field.
 */
export function imageSyntaxErrors(text: string): string[] {
  const problems = new Set<string>()
  let validCount = 0
  for (const match of text.matchAll(IMAGE_SHAPE)) {
    const alt = match[1]
    // no trim: the JSON Schema pattern matches the target exactly (a trailing space is malformed in both)
    const target = match[2]
    if (UUID_TARGET.test(target)) {
      validCount += 1
      if (alt.trim() === '') problems.add(EMPTY_ALT)
      else if (alt.length > MEDIA_ALT_MAX_LENGTH) problems.add(LONG_ALT)
    } else if (EXTERNAL_TARGET.test(target)) {
      problems.add(EXTERNAL)
    } else {
      problems.add(MALFORMED)
    }
  }
  if (validCount > MEDIA_MAX_IMAGES_PER_FIELD) problems.add(TOO_MANY)
  return [...problems]
}

const EXTERNAL =
  'Obrazu z zewnętrznego adresu nie można użyć w treści. Najpierw wyślij obraz do magazynu mediów ' +
  '(narzędzie MCP media_upload_from_url albo media_upload), a w treść wstaw zapis ![opis](media:<id>).'
const MALFORMED =
  'Niepoprawny zapis obrazu. Jedyna dozwolona postać to ![opis](media:<uuid>) w jednym wierszu, z uuid małymi literami. ' +
  'Obraz najpierw wyślij do magazynu (media_upload_from_url albo media_upload) i użyj zwróconego identyfikatora.'
const EMPTY_ALT = 'Obraz wymaga opisu: wpisz tekst w nawiasach kwadratowych, np. ![Mapa Polski](media:<id>).'
const LONG_ALT = `Opis obrazu może mieć najwyżej ${MEDIA_ALT_MAX_LENGTH} znaków.`
const TOO_MANY = `W jednym polu może być najwyżej ${MEDIA_MAX_IMAGES_PER_FIELD} obrazy.`
