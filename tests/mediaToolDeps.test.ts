import assert from 'node:assert/strict'
import { test } from 'node:test'
import { referenceNames } from '../server/media/ownerNames.ts'

// The media tools name the quizzes that use a file through the injected `ownerLabels` (MediaToolDeps, built in
// server/mcp/index.ts). Here the pure naming step gets the titles from a stub in place of that lookup: the tools
// module itself pulls in pg, which the node test bundle cannot load, so the e2e run covers the wiring.
const refs = [
  { ownerKind: 'quiz', ownerId: 'q1' },
  { ownerKind: 'quiz', ownerId: 'q-gone' },
  { ownerKind: 'verb', ownerId: 'v7' },
]

test('the injected owner labels name quizzes; unknown quizzes fall back to their id', async () => {
  const calls: { kind: string; ids: readonly string[] }[] = []
  const deps = {
    ownerLabels: async (kind: string, ids: readonly string[]) => {
      calls.push({ kind, ids })
      return new Map(ids.filter((id) => id === 'q1').map((id) => [id, 'Czasowniki'] as const))
    },
  }
  const titles = await deps.ownerLabels('quiz', refs.filter((r) => r.ownerKind === 'quiz').map((r) => r.ownerId))
  assert.deepEqual(calls, [{ kind: 'quiz', ids: ['q1', 'q-gone'] }])
  assert.deepEqual(referenceNames(refs, titles), ['quiz „Czasowniki”', 'quiz „q-gone”', 'verb v7'])
})

test('references of other owner kinds keep the kind and id wording', () => {
  assert.deepEqual(referenceNames([{ ownerKind: 'lesson', ownerId: 'l1' }], new Map()), ['lesson l1'])
})
