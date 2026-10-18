import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { analyzeClass } from '../../src/shared/quiz/classAnalysis'
import { addMemberInput, auth0UserId, classInput } from '../../src/shared/quiz/schema'
import { analyzeStudent } from '../../src/shared/quiz/studentAnalysis'
import { canReadClasses, readableClass, resolveStudent, visibleClasses, writableClass } from '../classAccess'
import * as classes from '../classesRepo'
import * as courses from '../coursesRepo'
import { listVerbs } from '../irregularVerbs'
import * as reviews from '../reviewsRepo'
import { audit, classNotFound, needTeacher, needTeacherOrAdmin, notOwner, text } from './context'
import type { Ctx } from './context'

const classId = z.string().uuid().describe('Id klasy (UUID) z class_list')
const studentId = auth0UserId.describe('Identyfikator Auth0 ucznia, np. google-oauth2|123 lub discord|456 (widoczny w student_list i w Ustawieniach → Użytkownicy)')
const confirm = z.literal(true).describe('Musi być true - potwierdzenie operacji nieodwracalnej')

/**
 * class_*, student_*, assignment_*, course_list. Reading needs the teacher or admin role (admins see every
 * class, teachers their own); every change needs the teacher role and ownership of the class.
 */
export function registerClassTools(server: McpServer, ctx: Ctx) {
  const v = ctx.viewer

  /** Runs `work` on a class the caller may read; handles the refusals in one place. */
  const reading = async (id: string, work: (cls: NonNullable<Awaited<ReturnType<typeof readableClass>>>) => Promise<unknown>) => {
    if (!canReadClasses(v)) return needTeacherOrAdmin()
    const cls = await readableClass(v, id)
    return cls ? text(await work(cls)) : classNotFound()
  }

  /** Runs `work` on a class the caller owns. */
  const changing = async (id: string, work: (cls: NonNullable<Awaited<ReturnType<typeof writableClass>>>) => Promise<unknown>) => {
    if (!v.teacher) return needTeacher()
    const cls = await writableClass(v, id)
    if (cls) return text(await work(cls))
    return (await readableClass(v, id)) ? notOwner() : classNotFound()
  }

  // ---- classes ------------------------------------------------------------------------------

  server.registerTool(
    'class_list',
    {
      title: 'Lista klas',
      description: 'Klasy (id, nazwa, właściciel, liczba uczniów i zadań, kod dołączenia, czy zapisy są otwarte). scope=all (tylko admin) pokazuje klasy wszystkich nauczycieli.',
      inputSchema: { scope: z.enum(['own', 'all']).default('own') },
      annotations: { readOnlyHint: true },
    },
    async ({ scope }) => (canReadClasses(v) ? text(await visibleClasses(v, scope)) : needTeacherOrAdmin()),
  )

  server.registerTool(
    'class_get',
    {
      title: 'Szczegóły klasy',
      description: 'Klasa z listą uczniów (id Auth0, imię, e-mail) i zadań (kurs lub quiz, termin).',
      inputSchema: { classId },
      annotations: { readOnlyHint: true },
    },
    ({ classId: id }) =>
      reading(id, async (cls) => {
        const [members, assignments] = await Promise.all([classes.listMembers(cls.id), classes.listAssignments(cls.id)])
        return { ...cls, members, assignments }
      }),
  )

  server.registerTool(
    'class_create',
    { title: 'Utwórz klasę', description: 'Tworzy klasę dla nauczyciela i zwraca jej kod dołączenia.', inputSchema: { name: classInput.shape.name } },
    async ({ name }) => {
      if (!v.teacher) return needTeacher()
      const created = await classes.createClass(ctx.userId, name)
      await audit(ctx, 'class_create', { id: created.id, label: name })
      return text(created)
    },
  )

  server.registerTool(
    'class_update',
    {
      title: 'Zmień klasę',
      description: 'Zmienia nazwę klasy i/lub otwiera lub zamyka zapisy po kodzie (joiningOpen).',
      inputSchema: { classId, name: classInput.shape.name.optional(), joiningOpen: z.boolean().optional() },
      annotations: { idempotentHint: true },
    },
    ({ classId: id, name, joiningOpen }) =>
      changing(id, async (cls) => {
        if (name === undefined && joiningOpen === undefined) throw new Error('Podaj name lub joiningOpen')
        if (name !== undefined) await classes.renameClass(cls.id, ctx.userId, name)
        if (joiningOpen !== undefined) await classes.setJoiningOpen(cls.id, ctx.userId, joiningOpen)
        await audit(ctx, 'class_update', { id: cls.id, label: cls.name }, { name, joiningOpen })
        return { ...cls, ...(name !== undefined ? { name } : {}), ...(joiningOpen !== undefined ? { joiningOpen } : {}) }
      }),
  )

  server.registerTool(
    'class_regenerate_code',
    {
      title: 'Nowy kod klasy',
      description: 'Generuje nowy kod dołączenia. Stary przestaje działać, uczniowie już w klasie zostają.',
      inputSchema: { classId, confirm },
      annotations: { destructiveHint: true },
    },
    ({ classId: id }) =>
      changing(id, async (cls) => {
        const code = await classes.regenerateCode(cls.id, ctx.userId)
        if (!code) throw new Error('Nie udało się wygenerować kodu, spróbuj ponownie')
        await audit(ctx, 'class_regenerate_code', { id: cls.id, label: cls.name })
        return { joinCode: code }
      }),
  )

  server.registerTool(
    'class_archive',
    {
      title: 'Archiwizuj klasę',
      description: 'Ukrywa klasę na listach. Wyniki zostają zachowane; przywrócenie wymaga interwencji w bazie.',
      inputSchema: { classId, confirm },
      annotations: { destructiveHint: true },
    },
    ({ classId: id }) =>
      changing(id, async (cls) => {
        await classes.archiveClass(cls.id, ctx.userId)
        await audit(ctx, 'class_archive', { id: cls.id, label: cls.name })
        return { ok: true }
      }),
  )

  // ---- students -----------------------------------------------------------------------------

  server.registerTool(
    'student_list',
    {
      title: 'Lista uczniów',
      description: 'Uczniowie z klas (id Auth0, imię, e-mail i klasy, do których należą). Z classId tylko jedna klasa; bez niego wszystkie klasy z zakresu scope.',
      inputSchema: { classId: classId.optional(), scope: z.enum(['own', 'all']).default('own') },
      annotations: { readOnlyHint: true },
    },
    async ({ classId: id, scope }) => {
      if (!canReadClasses(v)) return needTeacherOrAdmin()
      if (id) {
        const cls = await readableClass(v, id)
        return cls ? text(await classes.listStudents([cls.id])) : classNotFound()
      }
      return text(await classes.listStudents((await visibleClasses(v, scope)).map((c) => c.id)))
    },
  )

  server.registerTool(
    'student_add',
    {
      title: 'Dodaj ucznia do klasy',
      description: 'Dodaje ucznia po identyfikatorze Auth0 (konto musi istnieć). Uczeń zobaczy klasę w „Zadania” i może ją opuścić. Odpowiedź: added albo already.',
      inputSchema: { classId, userId: addMemberInput.shape.userId.describe(studentId.description ?? '') },
    },
    ({ classId: id, userId }) =>
      changing(id, async (cls) => {
        const student = await resolveStudent(userId)
        if (!student) throw new Error('Nie znaleziono użytkownika o takim identyfikatorze Auth0')
        const status = await classes.addMember(cls.id, userId, student)
        if (status === 'added') await audit(ctx, 'student_add', { id: userId, label: student.name ?? student.email ?? userId }, { classId: cls.id })
        return { userId, status, name: student.name, email: student.email }
      }),
  )

  server.registerTool(
    'student_remove',
    {
      title: 'Usuń ucznia z klasy',
      description: 'Usuwa ucznia z klasy (jego wyniki w aplikacji zostają). Wymaga confirm=true.',
      inputSchema: { classId, userId: studentId, confirm },
      annotations: { destructiveHint: true },
    },
    ({ classId: id, userId }) =>
      changing(id, async (cls) => {
        if (!(await classes.removeMember(cls.id, userId))) throw new Error('Nie znaleziono ucznia w tej klasie')
        await audit(ctx, 'student_remove', { id: userId }, { classId: cls.id })
        return { ok: true }
      }),
  )

  server.registerTool(
    'student_results',
    {
      title: 'Wyniki ucznia',
      description: 'Surowe wyniki ucznia z klasy: postęp w zadaniach oraz podejścia z odpowiedziami na każde pytanie (tylko zadania przydzielone w tej klasie).',
      inputSchema: { classId, userId: studentId },
      annotations: { readOnlyHint: true },
    },
    ({ classId: id, userId }) =>
      reading(id, async (cls) => {
        const results = await classes.studentResults(cls.id, userId)
        if (!results) throw new Error('Nie znaleziono ucznia w tej klasie')
        return results
      }),
  )

  server.registerTool(
    'student_analyze',
    {
      title: 'Analiza wyników ucznia',
      description:
        'Gotowa analiza ucznia z klasy: średnia, najlepszy i ostatni wynik, trend, zadania po terminie, dni bez aktywności, pytania najczęściej błędnie rozwiązywane, wyniki w podziale na zadania, najsłabsze czasowniki i ostrzeżenia. Na tej podstawie napisz wnioski i zaproponuj dalszą pracę.',
      inputSchema: { classId, userId: studentId },
      annotations: { readOnlyHint: true },
    },
    ({ classId: id, userId }) =>
      reading(id, async (cls) => {
        const results = await classes.studentResults(cls.id, userId)
        if (!results) throw new Error('Nie znaleziono ucznia w tej klasie')
        const weak = await reviews.weakVerbs(userId, 8)
        const verbs = weak.length ? await listVerbs({ ids: weak.map((w) => w.verbId) }) : []
        const weakVerbs = weak.flatMap((w) => {
          const verb = verbs.find((x) => x.id === w.verbId)
          return verb
            ? [
                {
                  verb: verb.base,
                  forms: [verb.base, verb.pastSimple[0], verb.pastParticiple[0]].join(' – '),
                  meanings: verb.meanings,
                  accuracyPercent: Math.round(w.accuracy * 100),
                  attempts: w.attempts,
                },
              ]
            : []
        })
        return {
          student: { userId, name: results.name, email: results.email, joinedAt: results.joinedAt },
          lessonsCompleted: results.lessonsCompleted,
          weakVerbCount: results.weakVerbs,
          weakVerbs,
          analysis: analyzeStudent(results),
        }
      }),
  )

  // ---- assignments ---------------------------------------------------------------------------

  server.registerTool(
    'course_list',
    {
      title: 'Lista kursów',
      description: 'Kursy, które można przydzielić klasie (id, tytuł, liczba lekcji i czasowników).',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      canReadClasses(v)
        ? text((await courses.listCourses(null)).map((c) => ({ id: c.id, title: c.title, lessons: c.lessonCount, verbs: c.verbCount })))
        : needTeacherOrAdmin(),
  )

  server.registerTool(
    'assignment_create',
    {
      title: 'Przydziel zadanie klasie',
      description: 'Przydziela klasie kurs (z egzaminem) albo ręczny quiz (id z quiz_list), opcjonalnie z terminem (ISO 8601).',
      inputSchema: {
        classId,
        kind: z.enum(['course', 'quiz']),
        targetId: z.string().uuid().describe('Id kursu (course_list) lub quizu (quiz_list)'),
        dueAt: z.string().datetime().nullish().describe('Termin, np. 2026-11-30T20:00:00Z'),
      },
    },
    ({ classId: id, kind, targetId, dueAt }) =>
      changing(id, async (cls) => {
        const created = await classes.createAssignment(cls.id, ctx.userId, {
          kind,
          ...(kind === 'course' ? { courseId: targetId } : { quizId: targetId }),
          dueAt: dueAt ?? null,
        })
        if (!created) throw new Error('Nie znaleziono wskazanego kursu lub quizu')
        await audit(ctx, 'assignment_create', { id: created.id, label: created.title }, { classId: cls.id, dueAt })
        return created
      }),
  )

  server.registerTool(
    'assignment_update_due',
    {
      title: 'Zmień termin zadania',
      description: 'Ustawia nowy termin zadania albo usuwa go (dueAt=null).',
      inputSchema: { classId, assignmentId: z.string().uuid(), dueAt: z.string().datetime().nullable() },
      annotations: { idempotentHint: true },
    },
    ({ classId: id, assignmentId, dueAt }) =>
      changing(id, async (cls) => {
        if (!(await classes.setAssignmentDue(cls.id, assignmentId, dueAt))) throw new Error('Nie znaleziono zadania')
        await audit(ctx, 'assignment_update_due', { id: assignmentId }, { classId: cls.id, dueAt })
        return { ok: true }
      }),
  )

  server.registerTool(
    'assignment_delete',
    {
      title: 'Usuń zadanie',
      description: 'Usuwa zadanie z klasy (wyniki uczniów w aplikacji zostają). Wymaga confirm=true.',
      inputSchema: { classId, assignmentId: z.string().uuid(), confirm },
      annotations: { destructiveHint: true },
    },
    ({ classId: id, assignmentId }) =>
      changing(id, async (cls) => {
        if (!(await classes.deleteAssignment(cls.id, assignmentId))) throw new Error('Nie znaleziono zadania')
        await audit(ctx, 'assignment_delete', { id: assignmentId }, { classId: cls.id })
        return { ok: true }
      }),
  )

  // ---- reports -------------------------------------------------------------------------------

  server.registerTool(
    'class_report',
    {
      title: 'Raport klasy',
      description: 'Uczniowie klasy z postępem w każdym zadaniu (status, najlepszy wynik), liczbą ukończonych lekcji, ostatnią aktywnością i liczbą słabych czasowników.',
      inputSchema: { classId },
      annotations: { readOnlyHint: true },
    },
    ({ classId: id }) => reading(id, (cls) => classes.classReport(cls.id)),
  )

  server.registerTool(
    'class_analyze',
    {
      title: 'Analiza klasy',
      description:
        'Zbiorcza analiza klasy: status i średni wynik każdego zadania, uczniowie wymagający uwagi (brak aktywności, zaległości po terminie, niska średnia) z powodami oraz podsumowanie. Szczegóły ucznia: student_analyze.',
      inputSchema: { classId },
      annotations: { readOnlyHint: true },
    },
    ({ classId: id }) => reading(id, async (cls) => ({ class: { id: cls.id, name: cls.name }, ...analyzeClass(await classes.classReport(cls.id)) })),
  )
}


