import { useContext } from 'react'
import type { MediaMap } from '../../shared/media/types'
import { MediaContext } from './mediaContext'

/** The media map of the nearest `MediaProvider` (empty object when there is none). */
export const useMedia = (): MediaMap => useContext(MediaContext)
