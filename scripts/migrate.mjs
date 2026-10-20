// Applies db/migrations/*.sql to one environment's database (docs/vercel.md, "Środowiska i bazy danych").
// Usage:
//   npm run db:migrate                  DATABASE_URL (as before; no --env flag)
//   npm run db:migrate:dev|e2e|preview  one environment, see the npm scripts in package.json
//   npm run db:migrate:prod -- --confirm-production
//   node scripts/migrate.mjs --env=<dev|e2e|preview|prod> [--dry] [--confirm-production]
// --dry prints the pending migrations and the target database, applies nothing and writes nothing (prod too).
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import pg from 'pg'

// the variable that holds each environment's connection string (never printed)
const ENV_VARIABLES = {
  dev: ['DATABASE_URL_UNPOOLED', 'DATABASE_URL'],
  e2e: ['NEON_E2E_DATABASE_URL_UNPOOLED'],
  preview: ['NEON_PREVIEW_DATABASE_URL_UNPOOLED'],
  prod: ['NEON_PROD_DATABASE_URL_UNPOOLED'],
}

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const confirmProduction = args.includes('--confirm-production')
const envArg = args.find((arg) => arg.startsWith('--env='))
const envName = envArg ? envArg.slice('--env='.length) : null
const unknown = args.filter((arg) => arg !== '--dry' && arg !== '--confirm-production' && !arg.startsWith('--env='))
if (unknown.length > 0 || (envName !== null && !(envName in ENV_VARIABLES))) {
  console.error('usage: node scripts/migrate.mjs [--env=dev|e2e|preview|prod] [--dry] [--confirm-production]')
  process.exit(2)
}
if (envName === 'prod' && !dry && !confirmProduction) {
  console.error('refusing: pass --confirm-production to migrate production')
  process.exit(2)
}

// without --env the variable is DATABASE_URL, as before; --env=dev prefers the direct (unpooled) connection of the branch
const variables = envName === null ? ['DATABASE_URL'] : ENV_VARIABLES[envName]
const connectionString = variables.map((name) => process.env[name]).find(Boolean)
if (!connectionString) {
  console.error(`${variables.join(' or ')} is not set`)
  process.exit(1)
}

const dir = path.resolve('db/migrations')
const client = new pg.Client({ connectionString })
await client.connect()

try {
  const { rows: target } = await client.query('SELECT current_database() AS database')
  const host = new URL(connectionString).hostname.split('.')[0]
  console.log(`target: ${envName ?? 'DATABASE_URL'} host ${host} database ${target[0].database}${dry ? ' (dry run)' : ''}`)

  // a dry run only reads: no CREATE TABLE, and a missing schema_migrations table means nothing is applied yet
  const { rows: tableRows } = await client.query("SELECT to_regclass('schema_migrations') IS NOT NULL AS present")
  let applied = new Set()
  if (tableRows[0].present) {
    const { rows } = await client.query('SELECT name FROM schema_migrations')
    applied = new Set(rows.map((row) => row.name))
  } else if (!dry) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`)
  }
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const pending = files.filter((file) => !applied.has(file))

  if (dry) {
    console.log(`applied: ${applied.size}, pending: ${pending.length}`)
    for (const file of pending) console.log(`  pending ${file}`)
  } else {
    let ran = 0
    for (const file of pending) {
      const sql = await readFile(path.join(dir, file), 'utf8')
      console.log(`applying ${file}`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
      }
      ran += 1
    }
    console.log(ran === 0 ? 'database is up to date' : `applied ${ran} migration(s)`)
  }
} finally {
  await client.end()
}
