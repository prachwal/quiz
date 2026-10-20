import { createGradeRegistry } from './gradeHooks'

/** Process-wide grade hook registry; modules register their handlers once in `createApp` (server/app.ts). */
export const gradeRegistry = createGradeRegistry()
