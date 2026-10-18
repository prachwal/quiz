import { withLambda } from '@netlify/aws-lambda-compat'
import type { Config } from '@netlify/functions'
import serverless from 'serverless-http'
import { createApp } from '../../server/app'

// Express app served by a single modern (v2) function. The Lambda adapter keeps Express working,
// while the v2 runtime is what provides the Netlify Database connection (a plain
// `export const handler` function gets none and fails with MissingDatabaseConnectionError).
const handler = serverless(createApp())

export default withLambda(handler as unknown as Parameters<typeof withLambda>[0])

// The OAuth metadata for MCP clients must live at the site root (RFC 9728), outside /api.
export const config: Config = {
  path: ['/api/*', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/*'],
}
