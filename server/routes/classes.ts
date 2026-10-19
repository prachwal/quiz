import type { RequestHandler, Router } from 'express'
import { z } from 'zod'
import { reportToCsv } from '../../src/shared/quiz/csv'
import { addMemberInput, assignmentInput, assignmentPatchInput, classInput, classPatchInput, joinInput } from '../../src/shared/quiz/schema'
import { analyzeClass } from '../../src/shared/quiz/classAnalysis'
import { maskEmail } from '../../src/shared/quiz/maskEmail'
import { MANAGE_CLASSES, identityOf, requirePermission } from '../auth'
import { canReadClasses, readableClass, resolveStudent, viewerOf, visibleClasses, writableClass } from '../classAccess'
import * as classes from '../classesRepo'
import { HttpError, idParam, userOf } from '../http'
import * as progress from '../progressRepo'

/**
 * Classes: the student's side (join, own classes and assignments) and the teacher's side.
 * A class is visible only to its owner; admins (`manage:users`) may read every class but never change one
 * they do not own.
 */
export function registerClassRoutes(router: Router) {
  // ---- classes: student side (any signed-in user) -------------------------------------
  router.post('/classes/join', async (req, res) => {
    const { code } = joinInput.parse(req.body)
    const identity = identityOf(req)
    if (identity?.via === 'jwt') await progress.syncIdentity(identity.userId, identity)
    const joined = await classes.joinClass(userOf(req), code)
    if (!joined) throw new HttpError(404, 'Nie znaleziono klasy o takim kodzie')
    if (joined === 'closed') throw new HttpError(403, 'Ta klasa nie przyjmuje nowych uczniów')
    res.status(201).json(joined)
  })

  router.get('/my/classes', async (req, res) => {
    res.json(await classes.listMyClasses(userOf(req)))
  })

  router.delete('/my/classes/:id', async (req, res) => {
    if (!(await classes.leaveClass(userOf(req), idParam(req.params.id)))) throw new HttpError(404, 'Class not found')
    res.json({ ok: true })
  })

  router.get('/my/assignments', async (req, res) => {
    res.json(await classes.myAssignments(userOf(req)))
  })

  // ---- classes: teacher side (permission manage:classes; a class is visible only to its owner) ----
  const teacherOnly = requirePermission(MANAGE_CLASSES)
  // reading is also open to admins (`manage:users`), who see every class; changing stays with the owner
  const classReader: RequestHandler = (req, res, next) => {
    if (canReadClasses(viewerOf(req))) next()
    else res.status(403).json({ error: 'Ta operacja wymaga roli nauczyciela' })
  }
  const ownedClass = async (req: Parameters<typeof userOf>[0] & { params: Record<string, unknown> }) => {
    const found = await writableClass(viewerOf(req), idParam(req.params.id))
    if (!found) throw new HttpError(404, 'Class not found')
    return found
  }
  const viewableClass = async (req: Parameters<typeof userOf>[0] & { params: Record<string, unknown> }) => {
    const found = await readableClass(viewerOf(req), idParam(req.params.id))
    if (!found) throw new HttpError(404, 'Class not found')
    return found
  }

  router.get('/classes', classReader, async (req, res) => {
    const scope = z.enum(['own', 'all']).default('own').parse(req.query.scope)
    res.json(await visibleClasses(viewerOf(req), scope))
  })

  // students of the viewer's classes (one class with ?classId=), each with the classes they share
  router.get('/students', classReader, async (req, res) => {
    const classId = z.string().uuid().optional().parse(req.query.classId)
    const scopeParam = z.enum(['own', 'all']).default('own').parse(req.query.scope)
    const viewer = viewerOf(req)
    const scope = classId ? [await readableClass(viewer, classId)].flatMap((c) => (c ? [c] : [])) : await visibleClasses(viewer, scopeParam)
    if (classId && scope.length === 0) throw new HttpError(404, 'Class not found')
    res.json(await classes.listStudents(scope.map((c) => c.id)))
  })

  router.post('/classes', teacherOnly, async (req, res) => {
    const { name } = classInput.parse(req.body)
    res.status(201).json(await classes.createClass(userOf(req), name))
  })

  router.get('/classes/:id', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    const [members, assignments] = await Promise.all([classes.listMembers(cls.id), classes.listAssignments(cls.id)])
    res.json({ ...cls, members, assignments })
  })

  router.patch('/classes/:id', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const patch = classPatchInput.parse(req.body)
    if (patch.name !== undefined) await classes.renameClass(cls.id, userOf(req), patch.name)
    if (patch.joiningOpen !== undefined) await classes.setJoiningOpen(cls.id, userOf(req), patch.joiningOpen)
    res.json({ ...cls, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.joiningOpen !== undefined ? { joiningOpen: patch.joiningOpen } : {}) })
  })

  router.delete('/classes/:id', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    await classes.archiveClass(cls.id, userOf(req))
    res.json({ ok: true })
  })

  router.post('/classes/:id/code', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const code = await classes.regenerateCode(cls.id, userOf(req))
    if (!code) throw new HttpError(503, 'Nie udało się wygenerować kodu, spróbuj ponownie')
    res.json({ joinCode: code })
  })

  // type-ahead for "add a student": min. 3 characters, at most 8 hits, e-mail masked
  router.get('/classes/:id/student-candidates', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const q = z.string().trim().min(3).max(100).parse(req.query.q)
    const found = await classes.searchCandidates(cls.id, userOf(req), q)
    res.json(found.map((f) => ({ userId: f.userId, name: f.name, emailMasked: maskEmail(f.email), inClass: f.inClass })))
  })

  // add a student by Auth0 id (the id must belong to a real account)
  router.post('/classes/:id/members', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const { userId } = addMemberInput.parse(req.body)
    const student = await resolveStudent(userId)
    if (!student) throw new HttpError(404, 'Nie znaleziono użytkownika o takim identyfikatorze Auth0')
    const status = await classes.addMember(cls.id, userId, student)
    res.status(status === 'added' ? 201 : 200).json({ userId, status })
  })

  router.delete('/classes/:id/members/:userId', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    if (!(await classes.removeMember(cls.id, String(req.params.userId)))) throw new HttpError(404, 'Member not found')
    res.json({ ok: true })
  })

  router.post('/classes/:id/assignments', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const input = assignmentInput.parse(req.body)
    const created = await classes.createAssignment(cls.id, userOf(req), input)
    if (!created) throw new HttpError(404, 'Nie znaleziono wskazanego kursu lub quizu')
    res.status(201).json(created)
  })

  router.patch('/classes/:id/assignments/:assignmentId', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const { dueAt } = assignmentPatchInput.parse(req.body)
    if (!(await classes.setAssignmentDue(cls.id, idParam(req.params.assignmentId), dueAt))) {
      throw new HttpError(404, 'Assignment not found')
    }
    res.json({ ok: true })
  })

  router.get('/classes/:id/students/:userId', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    const results = await classes.studentResults(cls.id, String(req.params.userId))
    if (!results) throw new HttpError(404, 'Student not found')
    res.json(results)
  })

  router.delete('/classes/:id/assignments/:assignmentId', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    if (!(await classes.deleteAssignment(cls.id, idParam(req.params.assignmentId)))) {
      throw new HttpError(404, 'Assignment not found')
    }
    res.json({ ok: true })
  })

  router.get('/classes/:id/report', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    res.json(await classes.classReport(cls.id))
  })

  router.get('/classes/:id/analysis', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    res.json({ class: { id: cls.id, name: cls.name }, ...analyzeClass(await classes.classReport(cls.id)) })
  })

  router.get('/classes/:id/report.csv', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    const csv = reportToCsv(await classes.classReport(cls.id))
    res
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="raport-klasy.csv"')
      .send(`\ufeff${csv}`) // BOM so Excel reads Polish characters correctly
  })
}
