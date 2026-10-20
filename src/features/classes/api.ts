import { api } from '../../app/api'
import type { AssignmentItem, ClassDetail, ClassReport, StudentCandidate, StudentListItem, StudentResults, ClassSummary, MyAssignment, MyClass } from '../../shared/quiz/types'

export const classesApi = api.injectEndpoints({
  endpoints: (build) => ({
    listClasses: build.query<ClassSummary[], { scope?: 'own' | 'all' } | void>({
      query: (params) => ({ url: 'classes', params: params ?? undefined }),
      providesTags: ['Class'],
    }),
    createClass: build.mutation<ClassSummary, { name: string }>({
      query: (body) => ({ url: 'classes', method: 'POST', body }),
      invalidatesTags: ['Class'],
    }),
    getClass: build.query<ClassDetail, string>({
      query: (id) => `classes/${id}`,
      providesTags: ['Class'],
    }),
    archiveClass: build.mutation<void, string>({
      query: (id) => ({ url: `classes/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Class'],
    }),
    regenerateClassCode: build.mutation<{ joinCode: string }, string>({
      query: (id) => ({ url: `classes/${id}/code`, method: 'POST' }),
      invalidatesTags: ['Class'],
    }),
    addClassMember: build.mutation<{ userId: string; status: 'added' | 'already' }, { classId: string; userId: string }>({
      query: ({ classId, userId }) => ({ url: `classes/${classId}/members`, method: 'POST', body: { userId } }),
      invalidatesTags: ['Class'],
    }),
    removeClassMember: build.mutation<void, { classId: string; userId: string }>({
      query: ({ classId, userId }) => ({
        url: `classes/${classId}/members/${encodeURIComponent(userId)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Class'],
    }),
    createAssignment: build.mutation<
      AssignmentItem,
      { classId: string; kind: 'course' | 'quiz'; courseId?: string; quizId?: string; dueAt?: string | null }
    >({
      query: ({ classId, ...body }) => ({ url: `classes/${classId}/assignments`, method: 'POST', body }),
      invalidatesTags: ['Class', 'MyClass'],
    }),
    deleteAssignment: build.mutation<void, { classId: string; assignmentId: string }>({
      query: ({ classId, assignmentId }) => ({
        url: `classes/${classId}/assignments/${assignmentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Class', 'MyClass'],
    }),
    updateClass: build.mutation<ClassSummary, { id: string; name?: string; joiningOpen?: boolean }>({
      query: ({ id, ...body }) => ({ url: `classes/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Class'],
    }),
    updateAssignmentDue: build.mutation<void, { classId: string; assignmentId: string; dueAt: string | null }>({
      query: ({ classId, assignmentId, dueAt }) => ({
        url: `classes/${classId}/assignments/${assignmentId}`,
        method: 'PATCH',
        body: { dueAt },
      }),
      invalidatesTags: ['Class', 'MyClass'],
    }),
    listStudents: build.query<StudentListItem[], { scope?: 'own' | 'all'; classId?: string } | void>({
      query: (params) => ({ url: 'students', params: params ?? undefined }),
      providesTags: ['Class'],
    }),
    searchStudentCandidates: build.query<StudentCandidate[], { classId: string; q: string }>({
      query: ({ classId, q }) => ({ url: `classes/${classId}/student-candidates`, params: { q } }),
    }),
    getStudentResults: build.query<StudentResults, { classId: string; userId: string }>({
      query: ({ classId, userId }) => `classes/${classId}/students/${encodeURIComponent(userId)}`,
      providesTags: ['Class'],
    }),
    getClassReport: build.query<ClassReport, string>({
      query: (id) => `classes/${id}/report`,
      providesTags: ['Class'],
    }),
    joinClass: build.mutation<MyClass, { code: string }>({
      query: (body) => ({ url: 'classes/join', method: 'POST', body }),
      invalidatesTags: ['MyClass'],
    }),
    listMyClasses: build.query<MyClass[], void>({
      query: () => 'my/classes',
      providesTags: ['MyClass'],
    }),
    leaveClass: build.mutation<void, string>({
      query: (id) => ({ url: `my/classes/${id}`, method: 'DELETE' }),
      invalidatesTags: ['MyClass'],
    }),
    listMyAssignments: build.query<MyAssignment[], void>({
      query: () => 'my/assignments',
      providesTags: ['MyClass', 'Course', 'Attempt'],
    }),
  }),
})

export const {
  useListClassesQuery,
  useCreateClassMutation,
  useGetClassQuery,
  useArchiveClassMutation,
  useRegenerateClassCodeMutation,
  useAddClassMemberMutation,
  useRemoveClassMemberMutation,
  useCreateAssignmentMutation,
  useDeleteAssignmentMutation,
  useUpdateClassMutation,
  useUpdateAssignmentDueMutation,
  useListStudentsQuery,
  useSearchStudentCandidatesQuery,
  useGetStudentResultsQuery,
  useGetClassReportQuery,
  useJoinClassMutation,
  useListMyClassesQuery,
  useLeaveClassMutation,
  useListMyAssignmentsQuery,
} = classesApi
