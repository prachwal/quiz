// Applies db/migrations/*.sql to the database from DATABASE_URL.
// Run it after pulling a deploy or when the schema changes: `npm run db:migrate`.
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import pg from 'pg'

const dir = path.resolve('db/migrations')
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)

  const { rows } = await client.query('SELECT name FROM schema_migrations')
  const applied = new Set(rows.map((row) => row.name))
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) continue
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
} finally {
  await client.end()
}
