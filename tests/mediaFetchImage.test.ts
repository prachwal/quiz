import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchImage, FetchImageError, FETCH_HEADERS } from '../server/media/fetchImage.ts'
import type { FetchDeps, FetchRequest, FetchResponse } from '../server/media/fetchImage.ts'

// No network anywhere in this file: DNS and the HTTP transport are fakes. Addresses are documentation or public
// values that the tests never connect to.

const PUBLIC_A = '93.184.216.34'
const PUBLIC_B = '151.101.1.69'
const PRIVATE = '10.0.0.5'
const LIMITS = { maxBytes: 4096, timeoutMs: 8000 }

/** A body that yields the given chunks and records how many were pulled and whether it was closed. */
function body(chunks: Uint8Array[], probe: { pulled: number; closed: boolean } = { pulled: 0, closed: false }) {
  return {
    probe,
    stream: (async function* () {
      try {
        for (const chunk of chunks) {
          probe.pulled += 1
          yield chunk
        }
      } finally {
        probe.closed = true
      }
    })(),
  }
}

const ok = (chunks: Uint8Array[], headers: Record<string, string> = {}): FetchResponse => ({
  status: 200,
  headers,
  body: body(chunks).stream,
})

const redirect = (status: number, location: string): FetchResponse => ({
  status,
  headers: { location },
  body: body([]).stream,
})

interface Harness {
  deps: FetchDeps
  requests: FetchRequest[]
  resolves: string[]
}

/**
 * Fake DNS and transport. `answers` maps a host to its address list (a function gives a new answer per call);
 * `responses` maps a full URL to the response the transport returns for it.
 */
function harness(options: {
  answers?: Record<string, string[] | ((call: number) => string[])>
  responses?: Record<string, () => FetchResponse | Promise<FetchResponse>>
  now?: () => number
}): Harness {
  const requests: FetchRequest[] = []
  const resolves: string[] = []
  const counts = new Map<string, number>()
  const deps: FetchDeps = {
    resolve: async (hostname) => {
      resolves.push(hostname)
      const answer = options.answers?.[hostname] ?? [PUBLIC_A]
      const call = (counts.get(hostname) ?? 0) + 1
      counts.set(hostname, call)
      return typeof answer === 'function' ? answer(call) : answer
    },
    request: async (request) => {
      requests.push(request)
      const make = options.responses?.[request.url.href]
      if (!make) throw new Error(`fake transport: no response for ${request.url.href}`)
      return make()
    },
    ...(options.now ? { now: options.now } : {}),
  }
  return { deps, requests, resolves }
}

async function expectFetchError(promise: Promise<unknown>, code: string, pattern?: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof FetchImageError, `expected FetchImageError, got ${String(error)}`)
    assert.equal(error.code, code)
    if (pattern) assert.match(error.message, pattern)
    return true
  })
}

test('success: bytes come back, the request is pinned to the checked address and sends only two headers', async () => {
  const h = harness({
    responses: { 'https://images.example.org/cat.png': () => ok([new Uint8Array([1, 2]), new Uint8Array([3])]) },
  })
  const result = await fetchImage('https://images.example.org/cat.png', h.deps, LIMITS)
  assert.deepEqual([...result.bytes], [1, 2, 3])
  assert.equal(result.finalUrl, 'https://images.example.org/cat.png')
  assert.equal(h.requests.length, 1)
  const [request] = h.requests
  assert.equal(request.address, PUBLIC_A)
  assert.equal(request.family, 4)
  assert.equal(request.url.hostname, 'images.example.org')
  assert.deepEqual(request.headers, FETCH_HEADERS)
  assert.deepEqual(Object.keys(request.headers).sort(), ['Accept', 'User-Agent'])
  assert.equal(request.headers['User-Agent'], 'quiz-media-fetcher/1')
})

test('an IP literal is used as its own address without a DNS lookup', async () => {
  const h = harness({ responses: { 'https://8.8.8.8/a.png': () => ok([new Uint8Array([9])]) } })
  await fetchImage('https://8.8.8.8/a.png', h.deps, LIMITS)
  assert.equal(h.resolves.length, 0)
  assert.equal(h.requests[0].address, '8.8.8.8')
})

test('redirect chain: each hop is resolved, checked and pinned; the final URL is reported', async () => {
  const h = harness({
    answers: { 'images.example.org': [PUBLIC_A], 'cdn.example.net': [PUBLIC_B] },
    responses: {
      'https://images.example.org/a.png': () => redirect(302, '/b.png'),
      'https://images.example.org/b.png': () => redirect(301, 'https://cdn.example.net/c.png'),
      'https://cdn.example.net/c.png': () => ok([new Uint8Array([7])]),
    },
  })
  const result = await fetchImage('https://images.example.org/a.png', h.deps, LIMITS)
  assert.equal(result.finalUrl, 'https://cdn.example.net/c.png')
  assert.deepEqual(
    h.requests.map((r) => r.address),
    [PUBLIC_A, PUBLIC_A, PUBLIC_B],
  )
  assert.deepEqual(h.resolves, ['images.example.org', 'images.example.org', 'cdn.example.net'])
})

test('a redirect to a private address is refused before any connection to it', async () => {
  const h = harness({
    responses: { 'https://images.example.org/a.png': () => redirect(302, `https://${PRIVATE}/secret.png`) },
  })
  await expectFetchError(fetchImage('https://images.example.org/a.png', h.deps, LIMITS), 'refused', /przekierowanie|Przekierowanie/)
  assert.equal(h.requests.length, 1, 'only the first hop was requested')
})

test('a redirect to http is refused', async () => {
  const h = harness({
    responses: { 'https://images.example.org/a.png': () => redirect(302, 'http://images.example.org/a.png') },
  })
  await expectFetchError(fetchImage('https://images.example.org/a.png', h.deps, LIMITS), 'refused', /https/)
  assert.equal(h.requests.length, 1)
})

test('a fourth redirect is refused', async () => {
  const responses: Record<string, () => FetchResponse> = {}
  for (let i = 0; i < 4; i++) responses[`https://images.example.org/${i}.png`] = () => redirect(302, `/${i + 1}.png`)
  const h = harness({ responses })
  await expectFetchError(fetchImage('https://images.example.org/0.png', h.deps, LIMITS), 'refused', /przekierowań/)
  assert.equal(h.requests.length, 4)
})

test('DNS answering with a mix of public and private addresses is refused, nothing is requested', async () => {
  const h = harness({
    answers: { 'mixed.example.org': [PUBLIC_A, PRIVATE] },
    responses: { 'https://mixed.example.org/a.png': () => ok([new Uint8Array([1])]) },
  })
  await expectFetchError(fetchImage('https://mixed.example.org/a.png', h.deps, LIMITS), 'refused', /niedozwolony adres/)
  assert.equal(h.requests.length, 0)
})

test('DNS answering only loopback or metadata addresses is refused', async () => {
  const h = harness({
    answers: { 'evil.example.org': ['127.0.0.1'], 'meta.example.org': ['169.254.169.254'] },
    responses: {},
  })
  await expectFetchError(fetchImage('https://evil.example.org/a.png', h.deps, LIMITS), 'refused')
  await expectFetchError(fetchImage('https://meta.example.org/a.png', h.deps, LIMITS), 'refused', /metadanych/)
  assert.equal(h.requests.length, 0)
})

test('DNS rebinding: the connection uses the address that was checked, not a later answer', async () => {
  // first answer public, second answer private: a fetch that looked up again would connect to 10.0.0.5
  const h = harness({
    answers: { 'rebind.example.org': (call) => (call === 1 ? [PUBLIC_A] : [PRIVATE]) },
    responses: { 'https://rebind.example.org/a.png': () => ok([new Uint8Array([5])]) },
  })
  const result = await fetchImage('https://rebind.example.org/a.png', h.deps, LIMITS)
  assert.deepEqual([...result.bytes], [5])
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].address, PUBLIC_A, 'the transport must be told to connect to the checked address')
})

test('DNS rebinding across a redirect: a second lookup of the same host that turns private is refused', async () => {
  const h = harness({
    answers: { 'rebind.example.org': (call) => (call === 1 ? [PUBLIC_A] : [PRIVATE]) },
    responses: {
      'https://rebind.example.org/a.png': () => redirect(302, '/b.png'),
      'https://rebind.example.org/b.png': () => ok([new Uint8Array([5])]),
    },
  })
  await expectFetchError(fetchImage('https://rebind.example.org/a.png', h.deps, LIMITS), 'refused')
  assert.deepEqual(
    h.requests.map((r) => r.address),
    [PUBLIC_A],
    'the second hop was never connected',
  )
})

test('a body larger than the limit without Content-Length aborts the stream', async () => {
  const probe = { pulled: 0, closed: false }
  const chunks = Array.from({ length: 10 }, () => new Uint8Array(1024))
  let signalAborted = false
  const h = harness({
    responses: {
      'https://images.example.org/big.png': () => ({ status: 200, headers: {}, body: body(chunks, probe).stream }),
    },
  })
  const original = h.deps.request
  h.deps.request = async (request) => {
    const response = await original(request)
    request.signal.addEventListener('abort', () => (signalAborted = true))
    return response
  }
  await expectFetchError(fetchImage('https://images.example.org/big.png', h.deps, LIMITS), 'size', /4096/)
  assert.equal(probe.pulled, 5, 'the stream stops at the chunk that crosses the limit')
  assert.equal(probe.closed, true, 'the body is closed')
  assert.equal(signalAborted, true, 'the request is aborted')
})

test('a Content-Length that lies low does not help: the stream is still counted and aborted', async () => {
  const probe = { pulled: 0, closed: false }
  const chunks = Array.from({ length: 10 }, () => new Uint8Array(1024))
  const h = harness({
    responses: {
      'https://images.example.org/liar.png': () => ({ status: 200, headers: { 'content-length': '10' }, body: body(chunks, probe).stream }),
    },
  })
  await expectFetchError(fetchImage('https://images.example.org/liar.png', h.deps, LIMITS), 'size')
  assert.equal(probe.pulled, 5)
  assert.equal(probe.closed, true)
})

test('a declared Content-Length above the limit is refused before reading the body', async () => {
  const probe = { pulled: 0, closed: false }
  const h = harness({
    responses: {
      'https://images.example.org/huge.png': () => ({ status: 200, headers: { 'content-length': '999999' }, body: body([new Uint8Array(1)], probe).stream }),
    },
  })
  await expectFetchError(fetchImage('https://images.example.org/huge.png', h.deps, LIMITS), 'size')
  assert.equal(probe.pulled, 0)
})

test('a body exactly at the limit is accepted', async () => {
  const h = harness({
    responses: {
      'https://images.example.org/edge.png': () => ok([new Uint8Array(4096)]),
    },
  })
  const result = await fetchImage('https://images.example.org/edge.png', h.deps, LIMITS)
  assert.equal(result.bytes.byteLength, 4096)
})

test('a request that never answers times out and is aborted', async () => {
  const h = harness({
    responses: {
      'https://images.example.org/slow.png': () =>
        new Promise<FetchResponse>((_resolve, reject) => {
          // the transport rejects when the signal aborts, as node:https does
          setTimeout(() => reject(new Error('socket hang up')), 5000).unref()
        }),
    },
  })
  const original = h.deps.request
  let aborted = false
  h.deps.request = (request) => {
    request.signal.addEventListener('abort', () => (aborted = true))
    return original(request)
  }
  await expectFetchError(fetchImage('https://images.example.org/slow.png', h.deps, { maxBytes: 4096, timeoutMs: 30 }), 'timeout', /limit czasu/)
  assert.equal(aborted, true)
})

test('a body that stalls times out', async () => {
  const stalled = (async function* () {
    yield new Uint8Array(1)
    await new Promise(() => undefined) // never resolves
  })()
  const h = harness({
    responses: { 'https://images.example.org/stall.png': () => ({ status: 200, headers: {}, body: stalled }) },
  })
  await expectFetchError(fetchImage('https://images.example.org/stall.png', h.deps, { maxBytes: 4096, timeoutMs: 30 }), 'timeout')
})

test('the time budget is checked between hops with the injected clock', async () => {
  let clock = 0
  const h = harness({
    now: () => clock,
    responses: {
      'https://images.example.org/a.png': () => {
        clock += 9000 // the first hop took 9 seconds
        return redirect(302, '/b.png')
      },
      'https://images.example.org/b.png': () => ok([new Uint8Array(1)]),
    },
  })
  await expectFetchError(fetchImage('https://images.example.org/a.png', h.deps, LIMITS), 'timeout')
  assert.equal(h.requests.length, 1, 'the second hop never starts')
})

test('a non-200 status is refused and its body is not read', async () => {
  for (const status of [404, 500, 304]) {
    const h = harness({
      responses: { 'https://images.example.org/x.png': () => ({ status, headers: {}, body: body([new Uint8Array(1)]).stream }) },
    })
    await expectFetchError(fetchImage('https://images.example.org/x.png', h.deps, LIMITS), 'status', new RegExp(String(status)))
  }
})

test('http is refused before any DNS lookup or request', async () => {
  const h = harness({ responses: {} })
  await expectFetchError(fetchImage('http://images.example.org/a.png', h.deps, LIMITS), 'refused', /https/)
  assert.equal(h.resolves.length, 0)
  assert.equal(h.requests.length, 0)
})

test('a URL with a non-443 port or credentials is refused before any lookup', async () => {
  const h = harness({ responses: {} })
  await expectFetchError(fetchImage('https://images.example.org:8443/a.png', h.deps, LIMITS), 'refused', /443/)
  await expectFetchError(fetchImage('https://user:pw@images.example.org/a.png', h.deps, LIMITS), 'refused')
  assert.equal(h.resolves.length, 0)
})

test('a failing lookup is a network error with a Polish message', async () => {
  const deps: FetchDeps = {
    resolve: async () => {
      throw new Error('ENOTFOUND')
    },
    request: async () => {
      throw new Error('must not be called')
    },
  }
  await expectFetchError(fetchImage('https://nope.example.org/a.png', deps, LIMITS), 'network', /rozwiązać nazwy nope\.example\.org/)
})

test('an empty DNS answer is a network error', async () => {
  const h = harness({ answers: { 'empty.example.org': [] }, responses: {} })
  await expectFetchError(fetchImage('https://empty.example.org/a.png', h.deps, LIMITS), 'network')
})
