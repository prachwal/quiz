import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { startsAtEdge, swipeDirection } from './swipe'
import type { SwipeDirection } from './swipe'

/**
 * Horizontal swipe on touch screens with plain pointer events. Pair the element with
 * `touch-action: pan-y` (class `.swipe-area`) so vertical scrolling stays native: when the browser
 * takes over a vertical pan it fires `pointercancel` and the gesture is dropped.
 */
export function useSwipe<T extends HTMLElement>(ref: RefObject<T | null>, onSwipe: (direction: SwipeDirection) => void) {
  const handler = useRef(onSwipe)
  useEffect(() => {
    handler.current = onSwipe
  }, [onSwipe])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { id: number; x: number; y: number; t: number } | null = null

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !e.isPrimary || startsAtEdge(e.clientX, window.innerWidth)) return
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const direction = swipeDirection(e.clientX - start.x, e.clientY - start.y, e.timeStamp - start.t)
      start = null
      if (direction) handler.current(direction)
    }
    const cancel = () => {
      start = null
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
    }
  }, [ref])
}
