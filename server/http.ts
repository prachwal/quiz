import type { Request } from 'express'
import { z } from 'zod'
import { currentUserId } from './auth'

/**
 * Shared request/response helpers for the route modules.
 *
 * Note: handlers answer `{ ok: true }` instead of `204 No Content` - a status that must not carry a
 * body is fragile through serverless adapters and proxies.
 */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const idSchema = z.uuid()

/** Path parameter of a quiz: a non-UUID looks like "not found" rather than a validation error. */
export const parseId = (value: unknown) => {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success) throw new HttpError(404, 'Quiz not found')
  return parsed.data
}

/** Path parameter of a course: a non-UUID looks like "not found". */
export const parseCourseId = (value: unknown) => {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success) throw new HttpError(404, 'Course not found')
  return parsed.data
}

/** Generic UUID path parameter (tokens, assignments, feedback...). */
export const idParam = (value: unknown) => {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success) throw new HttpError(404, 'Not found')
  return parsed.data
}

/** Id of the caller; every route except /health runs behind `requireAuthenticated`. */
export const userOf = (req: Request) => currentUserId(req) as string

export const notFound = () => new HttpError(404, 'Quiz not found')
export const courseNotFound = () => new HttpError(404, 'Course not found')
