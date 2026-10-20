/**
 * Matching of verb illustration files to verbs for `scripts/upload-verb-images.ts` (Media-Storage-Plan L2). Pure: no
 * file system and no database, so the tests load it directly. A file `<base>.webp` illustrates the verb whose base
 * form is <base>, compared case-insensitively. Anything else is reported, never guessed.
 */

export interface VerbRef {
  id: number
  base: string
  imageMediaId: string | null
}

export type PlannedAction = 'set' | 'replace' | 'skip-has-image'

export interface PlannedMatch {
  file: string
  verbId: number
  base: string
  action: PlannedAction
}

export interface VerbImagePlan {
  /** one entry per file that names exactly one verb */
  matches: PlannedMatch[]
  /** `.webp` files whose base form matches no verb */
  unmatchedFiles: string[]
  /** files that are not `.webp` (ignored) */
  ignoredFiles: string[]
  /** base forms with more than one file (e.g. `Go.webp` and `go.webp`): nothing is done for them */
  ambiguous: { base: string; files: string[] }[]
  /** verbs (base forms) without any file */
  verbsWithoutFile: string[]
}

const WEBP = /\.webp$/i

/** The base form a file names (`Go.webp` -> `go`), or null for a file that is not a .webp image. */
export function baseOfFile(fileName: string): string | null {
  if (!WEBP.test(fileName)) return null
  const base = fileName.replace(WEBP, '').trim().toLowerCase()
  return base === '' ? null : base
}

/**
 * Plans the upload of the given file names. `replace` decides whether a verb that already has an image gets the
 * file (action `replace`) or is left alone (action `skip-has-image`).
 */
export function planVerbImages(fileNames: readonly string[], verbs: readonly VerbRef[], replace: boolean): VerbImagePlan {
  const verbsByBase = new Map<string, VerbRef[]>()
  for (const verb of verbs) {
    const key = verb.base.toLowerCase()
    verbsByBase.set(key, [...(verbsByBase.get(key) ?? []), verb])
  }

  const filesByBase = new Map<string, string[]>()
  const ignoredFiles: string[] = []
  for (const file of [...fileNames].sort()) {
    const base = baseOfFile(file)
    if (base === null) {
      ignoredFiles.push(file)
      continue
    }
    filesByBase.set(base, [...(filesByBase.get(base) ?? []), file])
  }

  const matches: PlannedMatch[] = []
  const unmatchedFiles: string[] = []
  const ambiguous: VerbImagePlan['ambiguous'] = []
  for (const [base, files] of filesByBase) {
    const targets = verbsByBase.get(base) ?? []
    if (targets.length === 0) {
      unmatchedFiles.push(...files)
      continue
    }
    if (files.length > 1 || targets.length > 1) {
      ambiguous.push({ base, files })
      continue
    }
    const [verb] = targets
    const action: PlannedAction = verb.imageMediaId ? (replace ? 'replace' : 'skip-has-image') : 'set'
    matches.push({ file: files[0], verbId: verb.id, base: verb.base, action })
  }

  const matchedBases = new Set(filesByBase.keys())
  const verbsWithoutFile = verbs
    .filter((verb) => !matchedBases.has(verb.base.toLowerCase()))
    .map((verb) => verb.base)
    .sort()

  return {
    matches: matches.sort((a, b) => a.base.localeCompare(b.base)),
    unmatchedFiles: unmatchedFiles.sort(),
    ignoredFiles,
    ambiguous: ambiguous.sort((a, b) => a.base.localeCompare(b.base)),
    verbsWithoutFile,
  }
}

/**
 * Why `--apply` must not run, or null. The memory driver keeps objects in one process (or a temporary directory),
 * so an upload from this script would not reach the bucket the app reads from.
 */
export function applyBlockReason(env: Readonly<Record<string, string | undefined>>): string | null {
  return (env.MEDIA_DRIVER ?? '').trim().toLowerCase() === 'memory'
    ? '--apply odmówione: MEDIA_DRIVER=memory zapisuje pliki lokalnie, a nie w bucketcie. Ustaw MEDIA_DRIVER=s3 (domyślnie) i S3_* w .env.local.'
    : null
}
