// Smoke test of the MCP endpoint with the official client: lists tools, creates, reads, replaces and deletes a
// throw-away quiz. Needs a token with write access.
//   node --env-file=.env scripts/mcp-smoke.mjs [url]   (default: production /api/mcp, token from PROD_API)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = process.argv[2] ?? 'https://fabulous-dieffenbachia.netlify.app/api/mcp'
const token = process.env.PROD_API
const client = new Client({ name: 'smoke', version: '1' })
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args })
  return { err: r.isError ?? false, text: r.content[0].text }
}
console.log('tools', (await client.listTools()).tools.length)
const quiz = { title: 'MCP smoke', questions: [{ type: 'single', prompt: '2+2?', options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] }], sampleSize: null }
const created = await call('create_quiz', { quiz })
console.log('create', created.err, JSON.parse(created.text).questions.length)
const id = JSON.parse(created.text).id
console.log('list', JSON.parse((await call('list_quizzes', {})).text).some((q) => q.id === id))
const full = JSON.parse((await call('get_quiz', { id, withAnswers: true })).text)
console.log('get answers', full.questions[0].options.some((o) => o.isCorrect))
console.log('update', (await call('update_quiz', { id, quiz: { ...quiz, title: 'MCP smoke 2', shuffleOptions: true } })).err)
console.log('verbs', JSON.parse((await call('list_irregular_verbs', { limit: 3 })).text).length)
console.log('schema', JSON.parse((await call('get_quiz_schema', {})).text).title)
try { const bad = await call('create_quiz', { quiz: { title: '', questions: [] } }); console.log('invalid ->', bad.err, bad.text.slice(0, 80)) } catch (e) { console.log('invalid -> rejected:', String(e.message).slice(0, 90)) }
console.log('delete', (await call('delete_quiz', { id, confirm: true })).err)
await client.close()
