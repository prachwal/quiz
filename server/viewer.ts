import type { Request } from 'express'
import { currentUserId, hasPermission, MANAGE_CLASSES, MANAGE_USERS } from './auth'

/**
 * Who the caller is for the class features (shared by the REST routes and the MCP tools):
 * a teacher (`manage:classes`) and/or an admin (`manage:users`). Request identity only, no class data.
 */
export interface Viewer {
  userId: string
  teacher: boolean
  admin: boolean
}

export const viewerOf = (req: Request): Viewer => ({
  userId: currentUserId(req) as string,
  teacher: hasPermission(req, MANAGE_CLASSES),
  admin: hasPermission(req, MANAGE_USERS),
})

export const canReadClasses = (v: Viewer) => v.teacher || v.admin
