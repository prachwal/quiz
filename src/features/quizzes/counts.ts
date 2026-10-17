/** Question-count limits accepted by the quiz generators (must match the server schemas). */
export const GENERATE_COUNT = { min: 5, max: 50 } as const
export const EXAM_COUNT = { min: 5, max: 40 } as const
export const REVIEW_COUNT = { min: 1, max: 30 } as const

export const clampCount = (n: number, limits: { min: number; max: number }) =>
  Math.min(limits.max, Math.max(limits.min, Math.round(n)))
