// Removes personal data and user state from a NON-production Neon branch (a copy of production made with
// "neon branches create --parent main"). Usage (docs/vercel.md, "Środowiska i bazy danych"):
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/scrub-neon-branch.mjs <preview|dev|e2e> [--apply]
// Default is a dry run that prints how many rows each step would touch. --apply runs every step in one transaction.
// The connection string comes from the variable of the branch (below) and is never printed; only its host prefix is.
// The bucket of the branch is NOT touched here: empty it separately (see docs/vercel.md).
import process from 'node:process'
import pg from 'pg'

const BRANCH_VARIABLES = {
  preview: 'NEON_PREVIEW_DATABASE_URL_UNPOOLED',
  dev: 'DATABASE_URL_UNPOOLED',
  e2e: 'NEON_E2E_DATABASE_URL_UNPOOLED',
}
const PRODUCTION_VARIABLES = ['NEON_PROD_DATABASE_URL', 'NEON_PROD_DATABASE_URL_UNPOOLED']

const branch = process.argv[2]
const apply = process.argv.includes('--apply')
if (!(branch in BRANCH_VARIABLES)) {
  console.error('usage: node scripts/scrub-neon-branch.mjs <preview|dev|e2e> [--apply]')
  process.exit(2)
}

// hostname without the -pooler suffix, so the pooled and direct hosts of one compute compare equal
const hostOf = (url) => new URL(url).hostname.replace('-pooler', '')
const productionHosts = PRODUCTION_VARIABLES.map((name) => process.env[name]).filter(Boolean).map(hostOf)
if (productionHosts.length === 0) {
  console.error('refusing: NEON_PROD_DATABASE_URL(_UNPOOLED) is not set, so the production host cannot be checked')
  process.exit(2)
}
const connectionString = process.env[BRANCH_VARIABLES[branch]]
if (!connectionString) {
  console.error(`${BRANCH_VARIABLES[branch]} is not set`)
  process.exit(2)
}
const host = hostOf(connectionString)
if (productionHosts.includes(host)) {
  console.error(`refusing: the ${branch} branch is the production compute (host ${host.split('.')[0]})`)
  process.exit(3)
}

// order matters (children first); generated quizzes go after the attempts that reference them.
// count: how many rows the step touches (read-only); run: the change itself.
const STEPS = [
  ['quiz_attempts', 'SELECT count(*)::int AS n FROM quiz_attempts', 'DELETE FROM quiz_attempts'],
  ['verb_reviews', 'SELECT count(*)::int AS n FROM verb_reviews', 'DELETE FROM verb_reviews'],
  ['daily_activity', 'SELECT count(*)::int AS n FROM daily_activity', 'DELETE FROM daily_activity'],
  ['lesson_progress', 'SELECT count(*)::int AS n FROM lesson_progress', 'DELETE FROM lesson_progress'],
  ['feedback', 'SELECT count(*)::int AS n FROM feedback', 'DELETE FROM feedback'],
  ['assignments', 'SELECT count(*)::int AS n FROM assignments', 'DELETE FROM assignments'],
  ['class_members', 'SELECT count(*)::int AS n FROM class_members', 'DELETE FROM class_members'],
  ['classes', 'SELECT count(*)::int AS n FROM classes', 'DELETE FROM classes'],
  ['api_tokens', 'SELECT count(*)::int AS n FROM api_tokens', 'DELETE FROM api_tokens'],
  ['admin_audit_log', 'SELECT count(*)::int AS n FROM admin_audit_log', 'DELETE FROM admin_audit_log'],
  ['user_profiles', 'SELECT count(*)::int AS n FROM user_profiles', 'DELETE FROM user_profiles'],
  [
    "quizzes (kind='generated')",
    "SELECT count(*)::int AS n FROM quizzes WHERE kind = 'generated'",
    "DELETE FROM quizzes WHERE kind = 'generated'",
  ],
  [
    'irregular_verbs.image_media_id -> NULL',
    'SELECT count(*)::int AS n FROM irregular_verbs WHERE image_media_id IS NOT NULL',
    'UPDATE irregular_verbs SET image_media_id = NULL WHERE image_media_id IS NOT NULL',
  ],
  ['media_refs', 'SELECT count(*)::int AS n FROM media_refs', 'DELETE FROM media_refs'],
  ['media', 'SELECT count(*)::int AS n FROM media', 'DELETE FROM media'],
]

const client = new pg.Client({ connectionString })
await client.connect()
try {
  const { rows } = await client.query('SELECT current_database() AS database')
  console.log(`branch ${branch} host ${host.split('.')[0]} database ${rows[0].database} mode ${apply ? 'APPLY' : 'DRY RUN'}`)

  if (!apply) {
    for (const [label, countSql] of STEPS) {
      const { rows: counted } = await client.query(countSql)
      console.log(`  would affect ${label}: ${counted[0].n}`)
    }
  } else {
    await client.query('BEGIN')
    try {
      for (const [label, , run] of STEPS) {
        const result = await client.query(run)
        console.log(`  ${label}: ${result.rowCount}`)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    const { rows: left } = await client.query(
      `SELECT (SELECT count(*) FROM quizzes)::int AS quizzes,
              (SELECT count(*) FROM courses)::int AS courses,
              (SELECT count(*) FROM lessons)::int AS lessons,
              (SELECT count(*) FROM irregular_verbs)::int AS verbs,
              (SELECT count(*) FROM quiz_attempts)::int AS attempts,
              (SELECT count(*) FROM api_tokens)::int AS tokens,
              (SELECT count(*) FROM user_profiles)::int AS profiles,
              (SELECT count(*) FROM admin_audit_log)::int AS audit,
              (SELECT count(*) FROM media)::int AS media`,
    )
    console.log('after:', JSON.stringify(left[0]))
  }
} finally {
  await client.end()
}
