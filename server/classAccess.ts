import type { ClassSummary } from '../src/shared/quiz/types'
import * as auth0 from './auth0Management'
import * as classes from './classesRepo'
import type { Viewer } from './viewer'

/**
 * Who may do what with classes (shared by the REST routes and the MCP tools):
 * - a teacher (`manage:classes`) reads and changes only classes they own;
 * - an admin (`manage:users`) may additionally read every class, but never changes someone else's.
 */

/** A class the viewer may read (null = not found for them). */
export async function readableClass(v: Viewer, classId: string): Promise<ClassSummary | null> {
  if (v.teacher) {
    const own = await classes.getClass(classId, v.userId)
    if (own) return own
  }
  return v.admin ? classes.getClassAny(classId) : null
}

/** A class the viewer may change: only the owner's. */
export async function writableClass(v: Viewer, classId: string): Promise<ClassSummary | null> {
  return v.teacher ? classes.getClass(classId, v.userId) : null
}

/** `own` = the viewer's classes; `all` = every class (admins only, otherwise falls back to own). */
export async function visibleClasses(v: Viewer, scope: 'own' | 'all'): Promise<ClassSummary[]> {
  if (scope === 'all' && v.admin) return classes.listAllClasses()
  return v.teacher ? classes.listClasses(v.userId) : []
}

export type Resolved = { name: string | null; email: string | null }

/**
 * A student must be a real account: either known from the app (profile row) or an Auth0 user. Returns the
 * identity to show to the teacher, or null when no such user exists.
 */
export async function resolveStudent(userId: string): Promise<Resolved | null> {
  if (auth0.managementConfigured) {
    try {
      const user = await auth0.getUser(userId)
      return { name: user.name, email: user.email }
    } catch (error) {
      if (!(error instanceof auth0.ManagementError) || error.status !== 404) throw error
    }
  }
  return classes.profileOf(userId)
}
