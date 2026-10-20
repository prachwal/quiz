/**
 * Audit entry of a verb illustration set by the upload script (`scripts/upload-verb-images.ts --apply`). Pure: no
 * database access, so the tests load this module directly. The MCP and REST paths audit through their own entries.
 */
import type { AuditEntry } from './types'

export interface VerbImageAuditInput {
  verbId: number
  /** The verb's base form, shown as the target label. */
  base: string
  mediaBefore: string | null
  mediaAfter: string | null
  /** The `--owner` id: the author of the files and the actor of the change. */
  ownerId: string
}

/** What `writeAudit` stores for one changed verb: action `verb.image`, details `{ verbId, mediaBefore, mediaAfter, source, ownerId }`. */
export function verbImageAudit(input: VerbImageAuditInput): {
  action: AuditEntry['action']
  targetId: string
  targetLabel: string
  details: Record<string, unknown>
} {
  return {
    action: 'verb.image',
    targetId: String(input.verbId),
    targetLabel: input.base,
    details: {
      verbId: input.verbId,
      mediaBefore: input.mediaBefore,
      mediaAfter: input.mediaAfter,
      source: 'script',
      ownerId: input.ownerId,
    },
  }
}

const shortId = (id: unknown) => (typeof id === 'string' && id ? id.slice(0, 8) : '—')

/** Details line of the admin audit table: `<before> → <after>`, the ids shortened; `—` for no image. */
export function describeVerbImage(details: Record<string, unknown>): string {
  const source = details.source === 'script' ? ' (skrypt)' : ''
  return `${shortId(details.mediaBefore)} → ${shortId(details.mediaAfter)}${source}`
}
