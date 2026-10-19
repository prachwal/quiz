import { z } from 'zod'
import { auth0UserId } from '../../../src/shared/quiz/schema'
import { canReadClasses, readableClass, writableClass } from '../../classAccess'
import { audit, classNotFound, needTeacher, needTeacherOrAdmin, notOwner, text } from '../context'
import type { Ctx } from '../context'

/** Schemas and permission guards shared by the class_*, student_* and assignment_* tools. */

export const classId = z.string().uuid().describe('Id klasy (UUID) z class_list')

export const studentId = auth0UserId.describe(
  'Identyfikator Auth0 ucznia, np. google-oauth2|123 lub discord|456 (widoczny w student_list i w Ustawieniach → Użytkownicy)',
)

export const confirm = z.literal(true).describe('Musi być true - potwierdzenie operacji nieodwracalnej')

type ReadableClass = NonNullable<Awaited<ReturnType<typeof readableClass>>>
type WritableClass = NonNullable<Awaited<ReturnType<typeof writableClass>>>
/** Shape every MCP tool returns (text content or a refusal). */
type ToolResult = Awaited<ReturnType<typeof text>>

export interface ClassGuards {
  /** Runs `work` on a class the caller may read; handles the refusals in one place. */
  reading: (id: string, work: (cls: ReadableClass) => Promise<unknown>) => Promise<ToolResult>
  /** Runs `work` on a class the caller owns. */
  changing: (id: string, work: (cls: WritableClass) => Promise<unknown>) => Promise<ToolResult>
}

export function classGuards(ctx: Ctx): ClassGuards {
  const v = ctx.viewer
  return {
    reading: async (id, work) => {
      if (!canReadClasses(v)) return needTeacherOrAdmin()
      const cls = await readableClass(v, id)
      return cls ? text(await work(cls)) : classNotFound()
    },
    changing: async (id, work) => {
      if (!v.teacher) return needTeacher()
      const cls = await writableClass(v, id)
      if (cls) return text(await work(cls))
      return (await readableClass(v, id)) ? notOwner() : classNotFound()
    },
  }
}

export { audit, text }
