#!/usr/bin/env node
/**
 * Copies data from the Netlify database (source) to the Vercel/Neon database (target).
 *
 * The schema is not created here — run `npm run db:migrate` against the target first.
 * Tables are read in foreign-key order, copied inside one transaction, and every table is
 * verified by row count at the end.
 *
 * Usage:
 *   npm run db:sync -- --to "$DATABASE_URL"                 # source resolved from Netlify CLI
 *   npm run db:sync -- --from postgres://… --to postgres://… --replace
 *   npm run db:sync -- --dry-run                            # only report counts
 *
 * Options:
 *   --from <url>     Source connection string (default: `netlify database status --branch <branch>`)
 *   --to <url>       Target connection string (default: $TARGET_DATABASE_URL ?? $DATABASE_URL)
 *   --branch <name>  Netlify branch to read (default: production)
 *   --tables a,b,c   Copy only these tables (still in dependency order)
 *   --exclude a,b    Skip these tables
 *   --replace        TRUNCATE the target tables first (required when they contain rows)
 *   --dry-run        Report what would be copied, write nothing
 *   --batch <n>      Rows per INSERT statement (default: 500)
 *   --help
 *
 * The Netlify source is resolved read-only; set NETLIFY_DB_URL to skip the CLI call.
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import pg from 'pg'

const BATCH_DEFAULT = 500
const MAX_PARAMS = 60_000
const SKIP_TABLES = new Set(['schema_migrations'])
const NETLIFY_CLI = process.platform === 'win32' ? 'netlify.cmd' : 'netlify'

const args = process.argv.slice(2)
const opt = (name) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const flag = (name) => args.includes(`--${name}`)

if (flag('help') || args.includes('-h')) {
  console.log(
    [
      'Sync Netlify DB -> Vercel (Neon) DB',
      '',
      '  npm run db:sync -- --to "$DATABASE_URL"',
      '  npm run db:sync -- --from <url> --to <url> --replace',
      '',
      'Options: --from --to --branch --tables --exclude --replace --dry-run --batch',
    ].join('\n'),
  )
  process.exit(0)
}

const list = (value) =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined

/** `vercel env pull` writes quoted values; accept them in CLI args too. */
const cleanUrl = (value) => value?.trim().replace(/^["']|["']$/g, '') || undefined

const branch = opt('branch') ?? 'production'
const dryRun = flag('dry-run')
const replace = flag('replace')
const batchSize = Number(opt('batch') ?? BATCH_DEFAULT)
const only = list(opt('tables'))
const excluded = new Set(list(opt('exclude')) ?? [])

/** Connection string of the Netlify database; the CLI reports a read-only user. */
function netlifyConnectionString() {
  if (process.env.NETLIFY_DB_URL) return process.env.NETLIFY_DB_URL
  let raw
  try {
    raw = execFileSync(
      'npx',
      ['--no-install', NETLIFY_CLI, 'database', 'status', '--branch', branch, '--json', '--show-credentials'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    )
  } catch {
    throw new Error(
      `Cannot read the Netlify database connection string. Run \`netlify database status --branch ${branch}\`, ` +
        'or pass --from <url> / set NETLIFY_DB_URL.',
    )
  }
  const parsed = JSON.parse(raw)
  const connectionString = parsed?.database?.connectionString
  if (!connectionString) throw new Error(`Netlify CLI returned no connection string for branch "${branch}".`)
  return connectionString
}

const sourceUrl = cleanUrl(opt('from') ?? netlifyConnectionString())
const targetUrl = cleanUrl(opt('to') ?? process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL)

if (!targetUrl) {
  console.error('Missing target: pass --to <url>, or set TARGET_DATABASE_URL / DATABASE_URL.')
  process.exit(1)
}
if (!Number.isInteger(batchSize) || batchSize < 1) {
  console.error('--batch must be a positive integer')
  process.exit(1)
}

const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`

const client = (connectionString, label) => {
  const instance = new pg.Client({
    connectionString,
    // Managed Postgres providers terminate TLS with a public CA; local/Netlify URLs already say sslmode=require.
    ssl: /sslmode=disable/.test(connectionString) ? undefined : { rejectUnauthorized: false },
  })
  instance.on('error', (error) => console.error(`[${label}] ${error.message}`))
  return instance
}

async function tableNames(db) {
  const { rows } = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`)
  return rows.map((row) => row.table_name).filter((name) => !SKIP_TABLES.has(name))
}

/** Child tables before parents would break FKs; sort so every referenced table comes first. */
async function dependencyOrder(db, tables) {
  const known = new Set(tables)
  const { rows } = await db.query(`
    SELECT child.relname AS child, parent.relname AS parent
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = child.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
      AND child.relname <> parent.relname`)

  const parents = new Map(tables.map((table) => [table, new Set()]))
  for (const row of rows) {
    if (known.has(row.child) && known.has(row.parent)) parents.get(row.child).add(row.parent)
  }

  const ordered = []
  const placed = new Set()
  while (ordered.length < tables.length) {
    const ready = tables
      .filter((table) => !placed.has(table) && [...parents.get(table)].every((parent) => placed.has(parent)))
      .sort()
    if (ready.length === 0) {
      // A cycle: copy the rest alphabetically and let the database reject it if the order is wrong.
      const rest = tables.filter((table) => !placed.has(table)).sort()
      console.warn(`! foreign-key cycle between: ${rest.join(', ')}`)
      ordered.push(...rest)
      break
    }
    for (const table of ready) {
      ordered.push(table)
      placed.add(table)
    }
  }
  return ordered
}

async function columnsOf(db, table) {
  const { rows } = await db.query(
    `SELECT column_name, is_generated, is_identity
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  )
  return rows
}

async function countRows(db, table) {
  const { rows } = await db.query(`SELECT COUNT(*)::bigint AS n FROM ${quote(table)}`)
  return Number(rows[0].n)
}

async function copyTable(from, to, table, batch) {
  const encoded = await columnsOf(to, table)
  if (encoded.length === 0) throw new Error(`table "${table}" does not exist in the target — run: npm run db:migrate`)

  const target = new Map(encoded.map((column) => [column.column_name, column]))
  const columns = (await columnsOf(from, table))
    .filter((column) => column.is_generated !== 'ALWAYS')
    .filter((column) => {
      if (!target.has(column.column_name)) {
        throw new Error(`column "${table}.${column.column_name}" is missing in the target — run: npm run db:migrate`)
      }
      return true
    })
    .map((column) => column.column_name)

  const identity = encoded.some((column) => column.is_identity === 'YES')
  const select = `SELECT ${columns.map(quote).join(', ')} FROM ${quote(table)}`
  const { rows } = await from.query(select)
  if (rows.length === 0) return 0

  const perStatement = Math.max(1, Math.min(batch, Math.floor(MAX_PARAMS / columns.length)))
  const overriding = identity ? ' OVERRIDING SYSTEM VALUE' : ''
  for (let offset = 0; offset < rows.length; offset += perStatement) {
    const chunk = rows.slice(offset, offset + perStatement)
    const values = []
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column])
        return `$${values.length}`
      })
      return `(${placeholders.join(', ')})`
    })
    await to.query(
      `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')})${overriding} VALUES ${tuples.join(', ')}`,
      values,
    )
  }
  return rows.length
}

/** After copying explicit ids, move every sequence past the copied maximum. */
async function resetSequences(db, tables) {
  const { rows } = await db.query(
    `SELECT table_name, column_name, pg_get_serial_sequence(table_name, column_name) AS sequence
     FROM information_schema.columns
     WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'
       AND table_name = ANY($1::text[])`,
    [tables],
  )
  for (const row of rows) {
    if (!row.sequence) continue
    await db.query(
      `SELECT setval($1::regclass, COALESCE((SELECT MAX(${quote(row.column_name)}) FROM ${quote(row.table_name)}), 1), true)`,
      [row.sequence],
    )
  }
}

async function main() {
  const from = client(sourceUrl, 'source')
  const to = client(targetUrl, 'target')
  await from.connect()
  await to.connect()

  try {
    const sourceTables = await tableNames(from)
    const targetTables = await tableNames(to)
    const missing = sourceTables.filter((table) => !targetTables.includes(table))
    if (missing.length > 0) {
      throw new Error(`tables missing in the target: ${missing.join(', ')} — run: npm run db:migrate`)
    }

    let selected = sourceTables
    if (only) selected = selected.filter((table) => only.includes(table))
    selected = selected.filter((table) => !excluded.has(table))
    if (selected.length === 0) throw new Error('no tables selected')

    const ordered = await dependencyOrder(from, selected)
    const counts = new Map()
    for (const table of ordered) counts.set(table, await countRows(from, table))

    console.log(`source: ${new URL(sourceUrl).host}`)
    console.log(`target: ${new URL(targetUrl).host}`)
    console.log('')
    for (const table of ordered) console.log(`  ${table.padEnd(22)} ${String(counts.get(table)).padStart(8)} rows`)

    if (dryRun) {
      console.log('\ndry run — nothing written')
      return
    }

    const nonEmpty = []
    for (const table of ordered) {
      if ((await countRows(to, table)) > 0) nonEmpty.push(table)
    }
    if (nonEmpty.length > 0 && !replace) {
      throw new Error(
        `target already has rows in: ${nonEmpty.join(', ')}. Re-run with --replace to overwrite (TRUNCATE + insert).`,
      )
    }

    console.log('\ncopying in one transaction…')
    await to.query('BEGIN')
    try {
      if (nonEmpty.length > 0) {
        await to.query(`TRUNCATE ${ordered.map(quote).join(', ')} CASCADE`)
      }
      let total = 0
      for (const table of ordered) {
        const copied = await copyTable(from, to, table, batchSize)
        total += copied
        if (copied !== counts.get(table)) {
          throw new Error(`${table}: copied ${copied} of ${counts.get(table)} rows`)
        }
      }
      await resetSequences(to, ordered)

      const mismatched = []
      for (const table of ordered) {
        const actual = await countRows(to, table)
        if (actual !== counts.get(table)) mismatched.push(`${table}: ${actual} != ${counts.get(table)}`)
      }
      if (mismatched.length > 0) throw new Error(`row count mismatch: ${mismatched.join(', ')}`)

      await to.query('COMMIT')
      console.log(`done — ${total} rows copied across ${ordered.length} tables`)
    } catch (error) {
      await to.query('ROLLBACK')
      throw error
    }
  } finally {
    await from.end().catch(() => {})
    await to.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error(`\nsync failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
