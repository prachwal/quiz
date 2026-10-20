import { readableClass, writableClass } from '../../classAccess'
import { canReadClasses } from '../../viewer'
import { classNotFound, needTeacher, needTeacherOrAdmin, notOwner, text } from '../context'
import type { Ctx } from '../context'

/**
 * Read/change guards for the class tools: they call the class-access functions, so they belong to the classes
 * module, not to the shared schemas in ./shared.ts.
 */

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
