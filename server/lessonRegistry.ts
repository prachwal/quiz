import { createLessonRegistry } from './lessonHooks'

/** Process-wide lesson registry; modules subscribe once in `createApp` (server/app.ts). */
export const lessonRegistry = createLessonRegistry()
