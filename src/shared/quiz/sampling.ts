/**
 * Pure helpers for quizzes that draw a sample from a larger question pool and for shuffle overrides.
 * Import-free on purpose (used by the player, the server and node:test).
 */

/** Fisher-Yates copy. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** `size` random items from the pool (everything when size is null or not smaller than the pool). */
export function sampleFromPool<T>(pool: readonly T[], size: number | null | undefined, random: () => number = Math.random): T[] {
  if (!size || size >= pool.length) return [...pool]
  return shuffle(pool, random).slice(0, size)
}

/** The quiz can override the player's own shuffle setting (null = follow the player). */
export const effectiveShuffle = (quizSetting: boolean | null | undefined, playerSetting: boolean) =>
  quizSetting ?? playerSetting

/**
 * Which questions a submission is graded on. Quizzes without a sample (or with a pool not larger than it)
 * grade everything. For sampled quizzes the client sends the ids it was shown: they must be distinct questions
 * of the quiz and exactly `sampleSize` of them. Returns null for an invalid selection; a missing list (old
 * clients) falls back to the whole pool.
 */
export function resolveGradedIds(
  allIds: readonly string[],
  requested: readonly string[] | undefined,
  sampleSize: number | null | undefined,
): string[] | null {
  if (!sampleSize || sampleSize >= allIds.length || requested === undefined) return [...allIds]
  const known = new Set(allIds)
  const unique = new Set(requested)
  if (unique.size !== requested.length || requested.length !== sampleSize) return null
  return requested.every((id) => known.has(id)) ? [...requested] : null
}
