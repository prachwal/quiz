import { createContext } from 'react'
import type { MediaMap } from '../../shared/media/types'

/** Media map of the current subtree (see `MediaProvider`). Empty when no provider is above. */
export const MediaContext = createContext<MediaMap>({})
