import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { classInput } from '../../../src/shared/quiz/schema'
import { visibleClasses } from '../../classAccess'
import { canReadClasses } from '../../viewer'
import * as classes from '../../classesRepo'
import { needTeacher, needTeacherOrAdmin, text } from '../context'
import type { Ctx } from '../context'
import type { ClassGuards } from './classGuards'
import { audit, classId, confirm } from './shared'

/** class_list, class_get, class_create, class_update, class_regenerate_code, class_archive. */
export function registerClassCrudTools(server: McpServer, ctx: Ctx, guards: ClassGuards) {
  const { reading, changing } = guards
  const v = ctx.viewer

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
}
