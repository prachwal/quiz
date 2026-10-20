/** Pure daily-limit check for media uploads (constants in constants.ts). */
import { MEDIA_DAILY_BYTES, MEDIA_DAILY_FILES } from './constants'

/** True when the author has room for one more file of `sizeBytes` today. */
export function withinDailyLimits(today: { files: number; bytes: number }, sizeBytes: number): boolean {
  return today.files < MEDIA_DAILY_FILES && today.bytes + sizeBytes <= MEDIA_DAILY_BYTES
}
