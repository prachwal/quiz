import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { analyzeClass } from '../../../src/shared/quiz/classAnalysis'
import { canReadClasses } from '../../viewer'
import * as classes from '../../classesRepo'
import * as courses from '../../coursesRepo'
import { needTeacherOrAdmin, text } from '../context'
import type { Ctx } from '../context'
import type { ClassGuards } from './classGuards'
import { audit, classId, confirm } from './shared'

/** course_list, assignment_create/update_due/delete and the two class reports. */
export function registerAssignmentTools(server: McpServer, ctx: Ctx, guards: ClassGuards) {
  const { reading, changing } = guards
  const v = ctx.viewer

  server.registerTool(
    'course_list',
    {
      title: 'Lista kursów',
      description: 'Kursy, które można przydzielić klasie (id, tytuł, liczba lekcji i czasowników). lessonList: lekcje kursu z id (do lesson_get i lesson_update).',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      // courses and lessons are visible to every signed-in user over REST, so authors with write:quizzes may list them
      // too (lesson_get / lesson_update need the lesson ids)
      if (!canReadClasses(v) && !ctx.canWriteQuizzes) return needTeacherOrAdmin()
      const [list, lessons] = await Promise.all([courses.listCourses(null), courses.listLessonBriefs()])
      return text(
        list.map((c) => ({
          id: c.id,
          title: c.title,
          lessons: c.lessonCount,
          verbs: c.verbCount,
          lessonList: lessons.get(c.id) ?? [],
        })),
      )
    },
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
