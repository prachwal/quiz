import { randomInt } from 'node:crypto'
import type { ClassMember, ClassSummary, MyClass, StudentListItem } from '../../src/shared/quiz/types'
import { pool } from '../db'

/** Classes and their members: creation, join codes, the teacher's roster and the student's own classes. */

/** No 0/O/1/I so codes are easy to read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')

interface ClassRow {
  id: string
  name: string
  owner_id: string
  owner_name: string | null
  join_code: string
  member_count: number
  assignment_count: number
  joining_open: boolean
  archived_at: Date | null
  created_at: Date
}

const toClass = (r: ClassRow): ClassSummary => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  joinCode: r.join_code,
  memberCount: r.member_count,
  assignmentCount: r.assignment_count,
  joiningOpen: r.joining_open,
  archived: r.archived_at !== null,
  createdAt: r.created_at.toISOString(),
})

const CLASS_SELECT = `
  SELECT c.id, c.name, c.owner_id, op.display_name AS owner_name, c.join_code, c.joining_open, c.archived_at, c.created_at,
         (SELECT COUNT(*)::int FROM class_members m WHERE m.class_id = c.id) AS member_count,
         (SELECT COUNT(*)::int FROM assignments a WHERE a.class_id = c.id) AS assignment_count
  FROM classes c
  LEFT JOIN user_profiles op ON op.user_id = c.owner_id`

export async function createClass(ownerId: string, name: string): Promise<ClassSummary> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await pool().query<{ id: string }>(
        'INSERT INTO classes (name, owner_id, join_code) VALUES ($1, $2, $3) RETURNING id',
        [name, ownerId, newCode()],
      )
      return (await getClass(rows[0].id, ownerId))!
    } catch (error) {
      // unique violation on join_code: draw another code
      if ((error as { code?: string }).code !== '23505') throw error
    }
  }
  throw new Error('Could not generate a unique class code')
}

export async function listClasses(ownerId: string): Promise<ClassSummary[]> {
  const { rows } = await pool().query<ClassRow>(
    `${CLASS_SELECT} WHERE c.owner_id = $1 AND c.archived_at IS NULL ORDER BY c.created_at DESC`,
    [ownerId],
  )
  return rows.map(toClass)
}

/** Every active class of every teacher (read-only admin overview). */
export async function listAllClasses(): Promise<ClassSummary[]> {
  const { rows } = await pool().query<ClassRow>(`${CLASS_SELECT} WHERE c.archived_at IS NULL ORDER BY c.created_at DESC`)
  return rows.map(toClass)
}

/** A class regardless of its owner - callers must have checked that the viewer is allowed to see everything. */
export async function getClassAny(id: string): Promise<ClassSummary | null> {
  const { rows } = await pool().query<ClassRow>(`${CLASS_SELECT} WHERE c.id = $1`, [id])
  return rows[0] ? toClass(rows[0]) : null
}

/** Only the owner can see a class (anything else looks like "not found"). */
export async function getClass(id: string, ownerId: string): Promise<ClassSummary | null> {
  const { rows } = await pool().query<ClassRow>(`${CLASS_SELECT} WHERE c.id = $1 AND c.owner_id = $2`, [id, ownerId])
  return rows[0] ? toClass(rows[0]) : null
}

export async function renameClass(id: string, ownerId: string, name: string) {
  const r = await pool().query('UPDATE classes SET name = $3 WHERE id = $1 AND owner_id = $2', [id, ownerId, name])
  return (r.rowCount ?? 0) > 0
}

export async function setJoiningOpen(id: string, ownerId: string, open: boolean) {
  const r = await pool().query('UPDATE classes SET joining_open = $3 WHERE id = $1 AND owner_id = $2', [id, ownerId, open])
  return (r.rowCount ?? 0) > 0
}

export async function archiveClass(id: string, ownerId: string) {
  const r = await pool().query(
    'UPDATE classes SET archived_at = now() WHERE id = $1 AND owner_id = $2 AND archived_at IS NULL',
    [id, ownerId],
  )
  return (r.rowCount ?? 0) > 0
}

export async function regenerateCode(id: string, ownerId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await pool().query<{ join_code: string }>(
        'UPDATE classes SET join_code = $3 WHERE id = $1 AND owner_id = $2 RETURNING join_code',
        [id, ownerId, newCode()],
      )
      return rows[0]?.join_code ?? null
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error
    }
  }
  return null
}

export async function listMembers(classId: string): Promise<ClassMember[]> {
  const { rows } = await pool().query(
    `SELECT m.user_id, m.joined_at, p.display_name, p.email
     FROM class_members m LEFT JOIN user_profiles p ON p.user_id = m.user_id
     WHERE m.class_id = $1 ORDER BY m.joined_at`,
    [classId],
  )
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    email: r.email,
    joinedAt: r.joined_at.toISOString(),
  }))
}

/**
 * Adds a student by Auth0 id. The id must be a known account (someone who already used the app, or an
 * Auth0 user checked by the caller); `identity` fills the name / e-mail shown to the teacher when we have none.
 */
export async function addMember(
  classId: string,
  userId: string,
  identity?: { name?: string | null; email?: string | null },
): Promise<'added' | 'already'> {
  if (identity && (identity.name || identity.email)) {
    await pool().query(
      `INSERT INTO user_profiles (user_id, display_name, email) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = COALESCE(user_profiles.display_name, $2),
         email = COALESCE(user_profiles.email, $3)`,
      [userId, identity.name ?? null, identity.email ?? null],
    )
  }
  const r = await pool().query(
    'INSERT INTO class_members (class_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [classId, userId],
  )
  return (r.rowCount ?? 0) > 0 ? 'added' : 'already'
}

/**
 * Accounts that could be added to a class, found by part of the name, e-mail or Auth0 id (not the searching
 * teacher; members of the class are returned flagged `inClass`). Only people who have used the app are known
 * (a `user_profiles` row). Callers must require a few characters and mask the e-mail: this is a directory lookup.
 */
export async function searchCandidates(classId: string, searcherId: string, q: string, limit = 8) {
  const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
  const { rows } = await pool().query<{ user_id: string; display_name: string | null; email: string | null; in_class: boolean }>(
    `SELECT p.user_id, p.display_name, p.email,
            EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = $2 AND m.user_id = p.user_id) AS in_class
     FROM user_profiles p
     WHERE (p.display_name ILIKE $1 OR p.email ILIKE $1 OR p.user_id ILIKE $1)
       AND p.user_id <> $3
     ORDER BY in_class, p.display_name NULLS LAST, p.user_id
     LIMIT $4`,
    [pattern, classId, searcherId, limit],
  )
  return rows.map((r) => ({ userId: r.user_id, name: r.display_name, email: r.email, inClass: r.in_class }))
}

/** What the app knows about a user from their logins (null when they never used the app). */
export async function profileOf(userId: string): Promise<{ name: string | null; email: string | null } | null> {
  const { rows } = await pool().query('SELECT display_name, email FROM user_profiles WHERE user_id = $1', [userId])
  return rows[0] ? { name: rows[0].display_name, email: rows[0].email } : null
}

/** Students of the given classes (optionally one class), each with the classes they are in. */
export async function listStudents(classIds: string[]): Promise<StudentListItem[]> {
  if (classIds.length === 0) return []
  const { rows } = await pool().query(
    `SELECT m.user_id, p.display_name, p.email, c.id AS class_id, c.name AS class_name
     FROM class_members m
     JOIN classes c ON c.id = m.class_id
     LEFT JOIN user_profiles p ON p.user_id = m.user_id
     WHERE m.class_id = ANY($1::uuid[])
     ORDER BY COALESCE(p.display_name, p.email, m.user_id), c.name`,
    [classIds],
  )
  const students = new Map<string, StudentListItem>()
  for (const r of rows) {
    const item: StudentListItem = students.get(r.user_id) ?? { userId: r.user_id, name: r.display_name, email: r.email, classes: [] }
    item.classes.push({ id: r.class_id, name: r.class_name })
    students.set(r.user_id, item)
  }
  return [...students.values()]
}

export async function removeMember(classId: string, userId: string) {
  const r = await pool().query('DELETE FROM class_members WHERE class_id = $1 AND user_id = $2', [classId, userId])
  return (r.rowCount ?? 0) > 0
}

// ---- student side ----------------------------------------------------------------------

export async function joinClass(userId: string, code: string): Promise<MyClass | 'closed' | null> {
  const { rows } = await pool().query<{ id: string; name: string; joining_open: boolean }>(
    'SELECT id, name, joining_open FROM classes WHERE join_code = $1 AND archived_at IS NULL',
    [code],
  )
  const found = rows[0]
  if (!found) return null
  if (!found.joining_open) {
    // students already in the class can still "join" again (idempotent), newcomers cannot
    const member = await pool().query('SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2', [found.id, userId])
    if (member.rows.length === 0) return 'closed'
  }
  const inserted = await pool().query<{ joined_at: Date }>(
    `INSERT INTO class_members (class_id, user_id) VALUES ($1, $2)
     ON CONFLICT (class_id, user_id) DO UPDATE SET class_id = EXCLUDED.class_id RETURNING joined_at`,
    [found.id, userId],
  )
  return { id: found.id, name: found.name, joinedAt: inserted.rows[0].joined_at.toISOString() }
}

export async function leaveClass(userId: string, classId: string) {
  return removeMember(classId, userId)
}

export async function listMyClasses(userId: string): Promise<MyClass[]> {
  const { rows } = await pool().query(
    `SELECT c.id, c.name, m.joined_at FROM class_members m JOIN classes c ON c.id = m.class_id
     WHERE m.user_id = $1 AND c.archived_at IS NULL ORDER BY m.joined_at DESC`,
    [userId],
  )
  return rows.map((r) => ({ id: r.id, name: r.name, joinedAt: r.joined_at.toISOString() }))
}
