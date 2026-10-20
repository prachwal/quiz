/**
 * Second safety net behind scripts/e2e-browser.sh: the suite writes to the shared database and the real bucket, so
 * every entry point (global setup and teardown, the fixtures and the database helper) calls this first.
 */
export function assertRemoteDbAllowed(): void {
  if (process.env.E2E_ALLOW_REMOTE_DB !== '1') {
    throw new Error('E2E_ALLOW_REMOTE_DB=1 is required: the browser suite writes to the shared database and the real bucket (npm run test:e2e).')
  }
}

/** The owner every row and media object of this suite belongs to (contains "mcp-e2e", so the other cleanups match it). */
export const E2E_OWNER = 'dev|mcp-e2e-browser'

/** Title prefix of every quiz, course and lesson the suite creates. */
export const E2E_TITLE_PREFIX = '[E2E]'
