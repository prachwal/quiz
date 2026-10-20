import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Ctx } from './context'
import { registerAssignmentTools } from './tools/assignments'
import { registerClassCrudTools } from './tools/classes'
import { classGuards } from './tools/classGuards'
import { registerStudentTools } from './tools/students'

/**
 * class_*, student_*, assignment_*, course_list. Reading needs the teacher or admin role (admins see every
 * class, teachers their own); every change needs the teacher role and ownership of the class.
 *
 * The tools live in `server/mcp/tools/`: `classes.ts` (class CRUD), `students.ts` (roster and per-student
 * results) and `assignments.ts` (assignments and class reports); `shared.ts` has the common schemas and the
 * read/change guards.
 */
export function registerClassTools(server: McpServer, ctx: Ctx) {
  const guards = classGuards(ctx)
  registerClassCrudTools(server, ctx, guards)
  registerStudentTools(server, ctx, guards)
  registerAssignmentTools(server, ctx, guards)
}
