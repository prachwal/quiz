import pg from 'pg'
import { assertRemoteDbAllowed } from './guard'

/** Runs one block on a short-lived client of DATABASE_URL (the shared Neon database, see guard.ts). */
export async function withDb<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  assertRemoteDbAllowed()
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set (.env.local)')
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}
