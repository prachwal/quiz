import { z } from 'zod'
import { auth0UserId } from '../../../src/shared/quiz/schema'
import { audit, text } from '../context'

/** Schemas shared by the class_*, student_* and assignment_* tools (their guards are in ./classGuards.ts). */

export const classId = z.string().uuid().describe('Id klasy (UUID) z class_list')

export const studentId = auth0UserId.describe(
  'Identyfikator Auth0 ucznia, np. google-oauth2|123 lub discord|456 (widoczny w student_list i w Ustawieniach → Użytkownicy)',
)

export const confirm = z.literal(true).describe('Musi być true - potwierdzenie operacji nieodwracalnej')

export { audit, text }
