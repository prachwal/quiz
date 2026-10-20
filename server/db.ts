import pg from 'pg'

/** Minimal structural view of the pg pool/client (typed locally to avoid duplicate `pg` typings). */
interface Queryable {
  query: <R = Record<string, any>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: R[]; rowCount: number | null }>
}

export interface PoolClient extends Queryable {
  release: () => void
}

interface Pool extends Queryable {
  connect: () => Promise<PoolClient>
}

let externalPool: pg.Pool | null = null

/**
 * Postgres pool from `DATABASE_URL` (Neon on Vercel, a local database for `npm run dev:full`).
 * The pool is module-scoped so a warm serverless instance reuses its connections.
 */
export const pool = (): Pool => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set - see .env.example and docs/vercel.md')
  }
  if (!externalPool) {
    externalPool = new pg.Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX ?? 5),
      // Neon and most managed providers terminate TLS with a certificate from a public CA, so the certificate is
      // verified. A `sslmode` in the connection string decides on its own; without one TLS is on unless
      // PGSSLMODE=disable (a local Postgres without TLS).
      ssl: process.env.PGSSLMODE === 'disable' || /[?&]sslmode=/.test(connectionString) ? undefined : true,
    })
    // an idle connection dropped by the server (Neon scales to zero) is emitted as 'error' on the pool; without a
    // listener Node would treat it as an uncaught exception and kill the process
    externalPool.on('error', (error) => console.error(JSON.stringify({ level: 'error', msg: 'idle pg client error', error: error.message })))
  }
  return externalPool as unknown as Pool
}
