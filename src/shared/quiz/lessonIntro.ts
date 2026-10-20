/**
 * Rules for the lesson intro (`lessons.intro`) and title, shared by the server (validation on write) and the
 * frontend (which slides the intro gets). Pure and import-free apart from the image rules in `shared/media`.
 */
import { extractMediaIds, imageSyntaxErrors } from '../media/richText'

/** The intro is plain text with the quiz image syntax; at most this many characters (code points). */
export const LESSON_INTRO_MAX_LENGTH = 2000
export const LESSON_TITLE_MAX_LENGTH = 120
/** An intro longer than this (or one with an image) gets its own first slide instead of the page subtitle. */
export const LESSON_INTRO_SLIDE_MIN_LENGTH = 140

const length = (text: string) => Array.from(text).length

/** Problems with a lesson intro, in Polish, for the author. Empty list = fine. */
export function validateLessonIntro(text: string): string[] {
  const problems: string[] = []
  if (length(text) > LESSON_INTRO_MAX_LENGTH) {
    problems.push(`Wstęp lekcji może mieć najwyżej ${LESSON_INTRO_MAX_LENGTH} znaków.`)
  }
  problems.push(...imageSyntaxErrors(text))
  return problems
}

/** True when the intro is shown as the first slide ("Wstęp"): it has an image or is longer than 140 characters. */
export function introNeedsSlide(text: string): boolean {
  return extractMediaIds(text).length > 0 || length(text) > LESSON_INTRO_SLIDE_MIN_LENGTH
}
