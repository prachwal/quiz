/**
 * Uploads verb illustrations (Media-Storage-Plan L2) from a folder and sets them on the verbs.
 *
 *   npm run media:verb-images -- --dir <folder>
 *       DRY RUN (default): lists which <base>.webp file matches which verb, which files and verbs have no
 *       counterpart, and which verbs already have an image. Nothing is written.
 *
 *   npm run media:verb-images -- --dir <folder> --owner <auth0 id> --apply
 *       uploads the matched files and sets them as the verbs' images.
 *
 *   --replace   also replaces the images that verbs already have (without it those verbs are skipped)
 *
 * File names: `<base>.webp`, the base form of the verb (`go.webp` illustrates "go"; the case does not matter).
 * Only the top level of the folder is read; other files are listed as ignored, names that match no verb as
 * unmatched, and two files for one verb (`Go.webp` and `go.webp`) as ambiguous - nothing is done for those.
 *
 * `--apply` goes through the same path as the MCP tools: the bytes are sniffed (PNG, JPEG or WebP only, at most
 * MEDIA_MAX_BYTES), the author's ready copy with the same SHA-256 is reused, the daily limits apply, the object gets
 * a random key and the row becomes ready; then the verb gets the image and its media reference in one transaction
 * (server/irregularVerbs.ts setVerbImage). A new file writes one `media.upload` audit row (source `script`).
 * The verb change itself is not audited (a known gap, see the Media-Storage-Plan).
 *
 * Refuses `--apply` with MEDIA_DRIVER=memory: the files would not reach the bucket. Needs DATABASE_URL and the
 * S3_* / MEDIA_PUBLIC_BASE_URL settings (npm bundles this file and runs it with .env and .env.local).
 * Exit code: 0 when everything planned is done (or nothing was asked for), 1 when a file failed, 2 for bad usage.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { writeAudit } from '../server/adminRepo'
import { closePool } from '../server/db'
import { allVerbImageRefs, setVerbImage } from '../server/irregularVerbs'
import { mediaRuntime, storeBytes } from '../server/media/service'
import { applyBlockReason, planVerbImages, type PlannedMatch } from '../server/verbImageMatch'

const USAGE = 'Użycie: npm run media:verb-images -- --dir <katalog> [--owner <auth0 id> --apply] [--replace]'

function fail(message: string, code: number): never {
  console.error(message)
  process.exit(code)
}

function printPlan(dir: string, plan: ReturnType<typeof planVerbImages>, replace: boolean) {
  console.log(`Katalog: ${dir}`)
  console.log(`\nPasujące pliki (${plan.matches.length}):`)
  for (const m of plan.matches) {
    const note = m.action === 'skip-has-image' ? ' - czasownik ma już obraz, pominięty (użyj --replace)' : m.action === 'replace' ? ' - zastąpi obecny obraz' : ''
    console.log(`  ${m.file} -> ${m.base} (id ${m.verbId}): ${m.action === 'set' ? 'ustawi obraz' : m.action === 'replace' ? 'zastąpi obraz' : 'pominięty'}${note}`)
  }
  console.log(`\nPliki bez czasownika (${plan.unmatchedFiles.length}):`)
  for (const file of plan.unmatchedFiles) console.log(`  ${file}`)
  console.log(`\nNiejednoznaczne (${plan.ambiguous.length}, nic nie zrobię):`)
  for (const a of plan.ambiguous) console.log(`  ${a.base}: ${a.files.join(', ')}`)
  console.log(`\nIgnorowane (nie .webp, ${plan.ignoredFiles.length}):`)
  for (const file of plan.ignoredFiles) console.log(`  ${file}`)
  console.log(`\nCzasowniki bez pliku (${plan.verbsWithoutFile.length}):`)
  console.log(`  ${plan.verbsWithoutFile.join(', ') || '-'}`)
  const toDo = plan.matches.filter((m) => m.action !== 'skip-has-image').length
  console.log(`\nDo wysłania: ${toDo} (zastąpienie: ${replace ? 'tak' : 'nie'}).`)
}

async function applyPlan(dir: string, owner: string, matches: PlannedMatch[]): Promise<number> {
  let failures = 0
  for (const match of matches) {
    try {
      const bytes = new Uint8Array(await readFile(join(dir, match.file)))
      const stored = await storeBytes(mediaRuntime(), { ownerId: owner, bytes, source: 'script' })
      const change = await setVerbImage(match.verbId, stored.row.id)
      if (!change) throw new Error('Nie znaleziono czasownika')
      if (!stored.reused) {
        await writeAudit({
          actorId: owner,
          actorLabel: null,
          action: 'media.upload',
          targetId: stored.row.id,
          targetLabel: 'obraz',
          details: { outcome: 'ready', source: 'script', sizeBytes: stored.row.sizeBytes, sha256: stored.row.sha256.slice(0, 12) },
        })
      }
      console.log(`OK    ${match.file} -> ${match.base}${stored.reused ? ' (istniejący plik tego autora)' : ''}`)
    } catch (error) {
      failures += 1
      // refusals (MediaRequestError, MediaRefError) carry a Polish message; anything else is printed as it is
      const reason = error instanceof Error ? error.message : String(error)
      console.log(`BŁĄD  ${match.file} -> ${match.base}: ${reason}`)
    }
  }
  return failures
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      owner: { type: 'string' },
      apply: { type: 'boolean', default: false },
      replace: { type: 'boolean', default: false },
    },
    strict: true,
  })
  if (!values.dir) fail(USAGE, 2)
  if (values.apply) {
    if (!values.owner) fail(`${USAGE}\n--apply wymaga --owner (id Auth0 autora plików).`, 2)
    const blocked = applyBlockReason(process.env)
    if (blocked) fail(blocked, 2)
  }

  const dir = values.dir
  const entries = await readdir(dir, { withFileTypes: true })
  const names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  const plan = planVerbImages(names, await allVerbImageRefs(), values.replace)
  printPlan(dir, plan, values.replace)

  if (!values.apply) {
    console.log('\nTryb próbny: nic nie zapisano. Dodaj --owner <auth0 id> --apply, aby wysłać.')
    return 0
  }
  const toDo = plan.matches.filter((m) => m.action !== 'skip-has-image')
  console.log(`\nWysyłanie (${toDo.length}) jako ${values.owner}:`)
  const failures = await applyPlan(dir, values.owner as string, toDo)
  console.log(`\nGotowe: ${toDo.length - failures} z ${toDo.length}, błędów: ${failures}.`)
  return failures > 0 ? 1 : 0
}

main()
  .then((code) => closePool().then(() => process.exit(code)))
  .catch((error) => {
    console.error(`Nieoczekiwany błąd: ${(error as Error).message}`)
    closePool().finally(() => process.exit(1))
  })
