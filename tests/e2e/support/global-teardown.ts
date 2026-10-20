import { assertRemoteDbAllowed } from './guard'
import { sweepE2eData } from './cleanup'

/** Runs after every spec, also after a failure: the same sweep as the specs, keyed on the owner and the [E2E] titles. */
export default async function globalTeardown(): Promise<void> {
  assertRemoteDbAllowed()
  const removed = await sweepE2eData()
  console.log(`e2e teardown: removed ${removed.media} media, ${removed.quizzes} quizzes, ${removed.courses} courses`)
}
