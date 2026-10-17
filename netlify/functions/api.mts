import serverless from 'serverless-http'
import { createApp } from '../../server/app'

// Express app behind a single function; /api/* is rewritten here via netlify.toml.
export const handler = serverless(createApp())
