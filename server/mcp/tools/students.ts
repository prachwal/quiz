import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { analyzeStudent } from '../../../src/shared/quiz/studentAnalysis'
import { maskEmail } from '../../../src/shared/quiz/maskEmail'
import { addMemberInput } from '../../../src/shared/quiz/schema'
import { canReadClasses, readableClass, resolveStudent, visibleClasses } from '../../classAccess'
import * as classes from '../../classesRepo'
import { weakVerbDetails } from '../../userResults'
import { classNotFound, needTeacherOrAdmin, text } from '../context'
import type { Ctx } from '../context'
import { audit, classId, confirm, studentId, type ClassGuards } from './shared'

/** student_list, student_search, student_add, student_remove, student_results, student_analyze. */
export function registerStudentTools(server: McpServer, ctx: Ctx, guards: ClassGuards) {
  const { reading, changing } = guards
  const v = ctx.viewer

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
    'student_search',
    {
      title: 'Wyszukaj ucznia do dodania',
      description:
        'Szuka kont (po fragmencie imienia, e-maila lub identyfikatora Auth0; min. 3 znaki, do 8 wyników, e-mail zamaskowany); inClass=true oznacza, że ta osoba już jest w klasie. Znajduje tylko osoby, które logowały się do aplikacji. Wynik daje identyfikator do student_add.',
      inputSchema: { classId, query: z.string().trim().min(3).max(100) },
      annotations: { readOnlyHint: true },
    },
    ({ classId: id, query }) =>
      changing(id, async (cls) =>
        (await classes.searchCandidates(cls.id, ctx.userId, query)).map((f) => ({ userId: f.userId, name: f.name, emailMasked: maskEmail(f.email), inClass: f.inClass })),
      ),
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
        const weakVerbs = await weakVerbDetails(userId, 8)
        return {
          student: { userId, name: results.name, email: results.email, joinedAt: results.joinedAt },
          lessonsCompleted: results.lessonsCompleted,
          weakVerbCount: results.weakVerbs,
          weakVerbs,
          analysis: analyzeStudent(results),
        }
      }),
  )
}
