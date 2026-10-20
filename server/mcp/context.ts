import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Request } from 'express'
import { ZodError } from 'zod'
import { currentUserId, hasPermission, WRITE_QUIZZES } from '../auth'
import { writeAudit } from '../adminRepo'
import { ManagementError } from '../auth0Management'
import { viewerOf } from '../classAccess'
import type { Viewer } from '../classAccess'
import { HttpError } from '../http'

/** Everything a tool needs to know about the caller and to answer in one consistent way. */
export interface Ctx {
  viewer: Viewer
  canWriteQuizzes: boolean
  userId: string
}

export const contextOf = (req: Request): Ctx => ({
  viewer: viewerOf(req),
  canWriteQuizzes: hasPermission(req, WRITE_QUIZZES),
  userId: currentUserId(req) as string,
})

export const text = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

export const failure = (message: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: message }] })

// one wording per kind of refusal, so that every tool answers the same way
export const needQuizWrite = () => failure('Ta operacja wymaga uprawnienia write:quizzes (admin z prawem zapisu).')
export const needTeacher = () => failure('Ta operacja wymaga roli nauczyciela (token z dostępem do klas albo logowanie nauczyciela).')
export const needTeacherOrAdmin = () => failure('Ta operacja wymaga roli nauczyciela lub admina.')
export const classNotFound = () => failure('Nie znaleziono klasy.')
export const notOwner = () => failure('Klasę może zmieniać tylko jej właściciel. Admin ma tylko podgląd.')

/** Every change made through MCP is written to the audit log (the same one the admin panel shows). */
export async function audit(ctx: Ctx, tool: string, target: { id?: string; label?: string }, details: Record<string, unknown> = {}) {
  await writeAudit({
    actorId: ctx.userId,
    actorLabel: null,
    action: 'mcp.call',
    targetId: target.id ?? null,
    targetLabel: target.label ?? tool,
    details: { tool, ...details },
  })
}
export const needAdmin = () => failure('Ta operacja wymaga roli admina (uprawnienie manage:users, logowanie OAuth; token osobisty go nie ma).')

/**
 * Runs an admin action whose expected refusals are thrown as `HttpError` (the shared logic in `server/userAdmin.ts`)
 * or as Auth0 `ManagementError`, and turns them into the usual refusal. Anything unexpected still propagates.
 */
export async function refusing(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof HttpError || error instanceof ManagementError) return failure(error.message)
    if (error instanceof ZodError) return failure(error.issues.map((i) => i.message).join('; '))
    throw error
  }
}
