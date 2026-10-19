/**
 * Class data access, split by concern:
 * - `classes/classes.ts`     — classes, join codes, members, students
 * - `classes/assignments.ts` - assignments, the student's list, the teacher's report
 * - `classes/results.ts`     - one student's results (teacher and admin views)
 *
 * This barrel keeps the existing `import * as classes from './classesRepo'` call sites unchanged.
 */

export {
  createClass,
  listClasses,
  listAllClasses,
  getClassAny,
  getClass,
  renameClass,
  setJoiningOpen,
  archiveClass,
  regenerateCode,
  listMembers,
  addMember,
  searchCandidates,
  profileOf,
  listStudents,
  removeMember,
  joinClass,
  leaveClass,
  listMyClasses,
} from './classes/classes'

export {
  listAssignments,
  createAssignment,
  setAssignmentDue,
  deleteAssignment,
  myAssignments,
  classReport,
} from './classes/assignments'

export {
  studentResults,
  allAttempts,
  totalLessonsCompleted,
  classesOfMember,
  searchUsers,
} from './classes/results'
