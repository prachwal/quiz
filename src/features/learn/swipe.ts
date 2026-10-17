export type SwipeDirection = 'left' | 'right'

export const SWIPE = {
  /** minimal horizontal travel in px */
  minDistance: 50,
  /** horizontal travel must dominate vertical travel by this factor */
  dominance: 1.5,
  /** slower drags are treated as reading / scrolling, not a swipe */
  maxDuration: 800,
  /** ignore gestures starting this close to the screen edge (iOS / Android back gestures) */
  edge: 24,
} as const

/** Classifies a finished touch gesture; `null` when it is not a deliberate horizontal swipe. */
export function swipeDirection(dx: number, dy: number, duration: number): SwipeDirection | null {
  if (duration > SWIPE.maxDuration) return null
  if (Math.abs(dx) < SWIPE.minDistance) return null
  if (Math.abs(dx) < Math.abs(dy) * SWIPE.dominance) return null
  return dx < 0 ? 'left' : 'right'
}

/** True when a gesture starting at `x` would collide with the system edge-swipe (history back). */
export function startsAtEdge(x: number, viewportWidth: number): boolean {
  return x < SWIPE.edge || x > viewportWidth - SWIPE.edge
}
