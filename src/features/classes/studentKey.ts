/** Value of one option in the student picker: a student in one of their classes (a student can be in several). */
export const studentKey = (classId: string, userId: string) => `${classId}::${userId}`

export const parseStudentKey = (key: string) => {
  const [classId, ...rest] = key.split('::')
  return { classId, userId: rest.join('::') }
}
