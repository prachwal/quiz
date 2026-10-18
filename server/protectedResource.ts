// OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP endpoint. MCP clients that only
// get a server URL (Claude connectors, ChatGPT...) read it after a 401 to find the authorization
// server (Auth0); without it they guess `/authorize` and `/register` on this site and hit 404s.
// Import-free so tests can load it.

export const METADATA_PATH = '/.well-known/oauth-protected-resource'
export const MCP_PATH = '/api/mcp'

type Headers = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim()

/** Public origin of the request (behind Netlify's proxy: X-Forwarded-*). */
export function publicOrigin(headers: Headers): string | null {
  const host = first(headers['x-forwarded-host']) ?? first(headers.host)
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null
  const proto = first(headers['x-forwarded-proto']) ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')
  return `${proto === 'http' ? 'http' : 'https'}://${host}`
}

export const metadataUrl = (origin: string) => `${origin}${METADATA_PATH}${MCP_PATH}`

export function protectedResourceMetadata(origin: string, auth0Domain: string) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [`https://${auth0Domain}/`],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'profile', 'email'],
    resource_name: 'Quiz MCP',
  }
}
