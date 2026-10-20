/** A media file as the client needs it: the address and the size (to reserve the space before loading). */
export interface MediaInfo {
  url: string
  width: number | null
  height: number | null
}

/** Media id (uuid) -> its info. Only the ids that a response's content actually uses are present. */
export type MediaMap = Record<string, MediaInfo>
