import { useContext, useMemo, type ReactNode } from 'react'
import type { MediaMap } from '../../shared/media/types'
import { MediaContext } from './mediaContext'

/**
 * Provides the media map of a subtree. Nested providers merge with the outer map; entries of the
 * inner map win, so a result's map can add to the quiz's map without dropping it.
 */
export function MediaProvider({ media, children }: { media: MediaMap | undefined; children: ReactNode }) {
  const parent = useContext(MediaContext)
  const merged = useMemo(() => (media ? { ...parent, ...media } : parent), [parent, media])
  return <MediaContext.Provider value={merged}>{children}</MediaContext.Provider>
}
