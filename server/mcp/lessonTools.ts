import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { extractMediaIds } from '../../src/shared/media/richText'
import { LESSON_TITLE_MAX_LENGTH, validateLessonIntro } from '../../src/shared/quiz/lessonIntro'
import { DIFFICULTIES, POPULARITIES } from '../../src/shared/quiz/schema'
import * as courses from '../coursesRepo'
import { listVerbs, setVerbImage } from '../irregularVerbs'
import { MediaRefError } from '../media/repo'
import { audit, failure, needQuizWrite, text } from './context'
import type { Ctx } from './context'

const courseId = z.string().uuid().describe('Id kursu (course_list albo GET /api/courses)')
const lessonId = z.string().uuid().describe('Id lekcji (course_list, GET /api/courses/:id)')

/** lesson_get and lesson_update: the intro and title of a lesson; verbs_list and verb_set_image: the verb catalog and its illustrations. Reading and changing need write:quizzes (verbs_list is open). */
export function registerLessonTools(server: McpServer, ctx: Ctx) {
  server.registerTool(
    'lesson_get',
    {
      title: 'Pobierz lekcję',
      description:
        'Lekcja kursu: tytuł, wstęp (intro) w zapisie przechowywanym, pozycja, czasowniki (tylko id i forma podstawowa) oraz referencedMedia - id obrazów użytych we wstępie. Składnię obrazów opisuje quiz_schema (wstęp działa jak tekst pytania); gotowy zapis ![opis](media:<id>) daje media_upload albo media_upload_from_url. Wymaga write:quizzes.',
      inputSchema: { courseId, lessonId },
      annotations: { readOnlyHint: true },
    },
    async ({ courseId: course, lessonId: lesson }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      const detail = await courses.getLesson(course, lesson, null)
      return detail ? text(lessonView(detail)) : failure('Nie znaleziono lekcji.')
    },
  )

  server.registerTool(
    'lesson_update',
    {
      title: 'Zmień lekcję',
      description:
        'Zmienia tytuł (1-120 znaków) i/lub wstęp lekcji (intro, najwyżej 2000 znaków); podaj co najmniej jedno z pól. Obrazy we wstępie: zapis ![opis](media:<id>), najwyżej trzy, bez zewnętrznych adresów - reguły sprawdź w quiz_schema, a plik wyślij przez media_upload albo media_upload_from_url. Pusty wstęp usuwa tekst i obrazy. Wstęp z obrazem albo dłuższy niż 140 znaków pokazuje się uczniom jako pierwszy slajd. Zmiana trafia do audytu. Wymaga write:quizzes.',
      inputSchema: {
        courseId,
        lessonId,
        title: z.string().min(1).max(LESSON_TITLE_MAX_LENGTH).optional().describe('Nowy tytuł lekcji'),
        intro: z.string().optional().describe('Nowy wstęp lekcji (zastępuje poprzedni w całości)'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ courseId: course, lessonId: lesson, title, intro }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      if (title === undefined && intro === undefined) return failure('Podaj tytuł, wstęp albo oba pola.')
      if (intro !== undefined) {
        const problems = validateLessonIntro(intro)
        if (problems.length) return failure(problems.join(' '))
      }
      let result: Awaited<ReturnType<typeof courses.updateLesson>>
      try {
        result = await courses.updateLesson(course, lesson, { title, intro })
      } catch (error) {
        if (error instanceof MediaRefError) return failure(error.message)
        throw error
      }
      if (!result) return failure('Nie znaleziono lekcji.')

      // the audit holds lengths only, never the text of the intro
      const details: Record<string, unknown> = { courseId: course }
      if (title !== undefined) details.titleLength = { before: result.before.title.length, after: result.after.title.length }
      if (intro !== undefined) details.introLength = { before: result.before.intro.length, after: result.after.intro.length }
      await audit(ctx, 'lesson_update', { id: lesson, label: result.after.title }, details)

      const detail = await courses.getLesson(course, lesson, null)
      return detail ? text(lessonView(detail)) : failure('Nie znaleziono lekcji.')
    },
  )

  server.registerTool(
    'verbs_list',
    {
      title: 'Katalog czasowników nieregularnych',
      description: 'Czasowniki nieregularne (formy, znaczenia, przykłady) - materiał do tworzenia quizów. Maksymalnie 100 wyników.',
      inputSchema: {
        difficulty: z.enum(DIFFICULTIES).optional(),
        popularity: z.enum(POPULARITIES).optional(),
        pattern: z.enum(['AAA', 'ABA', 'ABB', 'ABC']).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, ...filter }) => text((await listVerbs(filter)).slice(0, limit)),
  )

  server.registerTool(
    'verb_set_image',
    {
      title: 'Ilustracja czasownika',
      description:
        'Ustawia ilustrację czasownika nieregularnego (verbId z verbs_list; mediaId z media_upload albo media_upload_from_url). Plik musi być gotowy (nie w stanie pending). mediaId=null usuwa ilustrację. Ilustracja pokazuje się na slajdzie lekcji i w katalogu czasowników. Zmiana trafia do audytu (poprzednie i nowe id pliku). Wymaga write:quizzes.',
      inputSchema: {
        verbId: z.number().int().positive().describe('Id czasownika z verbs_list'),
        mediaId: z.string().uuid().nullable().describe('Id gotowego pliku albo null, aby usunąć ilustrację'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ verbId, mediaId }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      let change: Awaited<ReturnType<typeof setVerbImage>>
      try {
        change = await setVerbImage(verbId, mediaId)
      } catch (error) {
        if (error instanceof MediaRefError) return failure(error.message)
        throw error
      }
      if (!change) return failure('Nie znaleziono czasownika.')
      await audit(ctx, 'verb_set_image', { id: String(verbId) }, { verbId, mediaBefore: change.before, mediaAfter: change.after })
      return text({ verbId, imageMediaId: change.after })
    },
  )
}

/** The shape both tools answer with: raw title and intro, verb ids with base forms, referenced image ids. */
function lessonView(lesson: NonNullable<Awaited<ReturnType<typeof courses.getLesson>>>) {
  return {
    courseId: lesson.courseId,
    courseTitle: lesson.courseTitle,
    lessonId: lesson.id,
    position: lesson.position,
    title: lesson.title,
    intro: lesson.intro,
    verbs: lesson.verbs.map((v) => ({ id: v.id, base: v.base })),
    referencedMedia: extractMediaIds(lesson.intro),
  }
}
