import { useEffect } from 'react'

let active = 0

/**
 * Marks a "focus" screen (running quiz, lesson slides): on phones the bottom tab bar is hidden and the
 * screen's own sticky action bar takes the thumb zone (see `.focus-mode` in index.css).
 */
export function useFocusMode(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    active += 1
    document.body.classList.add('focus-mode')
    return () => {
      active -= 1
      if (active === 0) document.body.classList.remove('focus-mode')
    }
  }, [enabled])
}
