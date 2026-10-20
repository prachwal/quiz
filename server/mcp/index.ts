import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { Request, RequestHandler, Response } from 'express'
import { contextOf } from './context'
import { registerAdminTools } from './tools/admin'
import { registerUserTools } from './tools/users'
import { registerOperationTools } from './tools/operations'
import { registerClassTools } from './classTools'
import { registerQuizTools } from './quizTools'

/**
 * Model Context Protocol endpoint (`POST /api/mcp`, Streamable HTTP, stateless, JSON responses).
 * It sits behind the normal authentication, so a client authenticates with `Authorization: Bearer qz_...`
 * (a personal API token) or an Auth0 login and gets exactly the permissions of that identity:
 *   - quizzes (`quiz_*`, `verbs_list`): reading for everybody, changes with `write:quizzes`;
 *   - classes (`class_*`, `student_*`, `assignment_*`, `course_list`): teachers (`manage:classes`) work on their
 *     own classes, admins (`manage:users`, OAuth login only) can read every class;
 *   - admin tools (`attempt_*`): `manage:users` only, so OAuth login only.
 * Tool names follow `<object>_<action>`; destructive tools require `confirm: true`; every change is audited.
 */
function buildServer(req: Request) {
  const ctx = contextOf(req)
  const server = new McpServer({
    name: 'quiz',
    title: 'Quiz',
    version: '2.0.1',
    icons: [{ src: 'https://quiz-vercel-rho.vercel.app/mcp-icon.png', mimeType: 'image/png', sizes: ['1254x1254'] }],
  })
  registerQuizTools(server, ctx)
  registerClassTools(server, ctx)
  registerAdminTools(server, ctx)
  registerUserTools(server, ctx)
  registerOperationTools(server, ctx)
  return server
}

/**
 * Stateless: a fresh server + transport per request, which is what a serverless function needs.
 * Uses the web-standard transport - the Node one reads raw headers that the serverless adapter's fake
 * request does not provide - and copies the resulting `Response` to Express.
 */
export const mcpHandler: RequestHandler = async (req: Request, res: Response) => {
  const server = buildServer(req)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    // clients must send both Accept types; be lenient so that simple HTTP clients work too
    const webRequest = new Request(`https://${req.headers.host ?? 'localhost'}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    })
    const response = await transport.handleRequest(webRequest, { parsedBody: req.body })
    res.status(response.status)
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.send(await response.text())
  } finally {
    void transport.close()
    void server.close()
  }
}

export const mcpNotAllowed: RequestHandler = (_req, res) => {
  res
    .status(405)
    .set('Allow', 'POST')
    .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST (stateless server).' }, id: null })
}
