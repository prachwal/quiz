import { api } from '../../app/api'
import type { MediaMap } from '../../shared/media/types'
import type { CourseDetail, CourseSummary, DifficultyCode, IrregularVerb, LessonDetail, PatternCode, PopularityCode, QuizDetail } from '../../shared/quiz/types'

/** The verb catalog with the images of its verbs (`media` is empty when no verb has an illustration). */
export interface VerbList {
  verbs: IrregularVerb[]
  media: MediaMap
}

/** The server answers the plain array while no verb has an image, otherwise `{ verbs, media }`. */
export const toVerbList = (body: unknown): VerbList => {
  if (Array.isArray(body)) return { verbs: body as IrregularVerb[], media: {} }
  const wrapped = body as Partial<VerbList>
  return { verbs: wrapped.verbs ?? [], media: wrapped.media ?? {} }
}

export const learnApi = api.injectEndpoints({
  endpoints: (build) => ({
    listIrregularVerbs: build.query<VerbList, { difficulty?: DifficultyCode; popularity?: PopularityCode; pattern?: PatternCode } | void>({
      query: (params) => ({ url: 'irregular-verbs', params: params ?? undefined }),
      transformResponse: toVerbList,
    }),
    listCourses: build.query<CourseSummary[], void>({
      query: () => 'courses',
      providesTags: ['Course'],
    }),
    getCourse: build.query<CourseDetail, string>({
      query: (id) => `courses/${id}`,
      providesTags: ['Course'],
    }),
    getLesson: build.query<LessonDetail, { courseId: string; lessonId: string }>({
      query: ({ courseId, lessonId }) => `courses/${courseId}/lessons/${lessonId}`,
      providesTags: ['Course'],
    }),
    completeLesson: build.mutation<void, { courseId: string; lessonId: string }>({
      query: ({ courseId, lessonId }) => ({
        url: `courses/${courseId}/lessons/${lessonId}/complete`,
        method: 'POST',
      }),
      invalidatesTags: ['Course', 'Progress', 'Review', 'Class', 'MyClass'],
    }),
    startExam: build.mutation<QuizDetail, { courseId: string; count?: number }>({
      query: ({ courseId, count }) => ({ url: `courses/${courseId}/exam`, method: 'POST', body: { count } }),
    }),
  }),
})

export const {
  useListIrregularVerbsQuery,
  useListCoursesQuery,
  useGetCourseQuery,
  useGetLessonQuery,
  useCompleteLessonMutation,
  useStartExamMutation,
} = learnApi
