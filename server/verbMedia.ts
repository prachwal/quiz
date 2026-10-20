/**
 * Verb illustrations in API responses (Media-Storage-Plan L2). Pure: no database access, so the tests load this
 * module directly. The media addresses themselves come from resolveMedia (server/media/resolve.ts).
 */
import type { MediaMap } from '../src/shared/media/types'
import type { IrregularVerb } from '../src/shared/quiz/types'

/** The `imageMediaId` part of a verb object: the key is absent for a verb without an image (JSON unchanged). */
export function imageField(imageMediaId: string | null): { imageMediaId?: string } {
  return imageMediaId ? { imageMediaId } : {}
}

/** Image ids of the given verbs, one per verb that has an image (the caller's query de-duplicates them). */
export function verbImageIds(verbs: readonly Pick<IrregularVerb, 'imageMediaId'>[]): string[] {
  return verbs.flatMap((verb) => (verb.imageMediaId ? [verb.imageMediaId] : []))
}

/**
 * Body of the verb list. The plain array is answered (JSON unchanged) unless the map has an entry, then the
 * list comes with `media`: `{ verbs, media }`. Clients accept both shapes.
 */
export function verbListBody(verbs: IrregularVerb[], media: MediaMap): IrregularVerb[] | { verbs: IrregularVerb[]; media: MediaMap } {
  return Object.keys(media).length === 0 ? verbs : { verbs, media }
}
