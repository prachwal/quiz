/**
 * The real network for fetchImage.ts: the system resolver and node:https. Deliberately small and NOT unit-tested
 * (the tests use fakes; this file is the only place that talks to the network).
 *
 * Connection pinning: the request names the original host (SNI, certificate check and the Host header all use it),
 * but the `lookup` hook returns only the address that fetchImage checked. Node therefore never asks DNS again for
 * this connection. Not verified on a real deployment yet (see Media-Storage-Plan, M5 "Stan wykonania").
 */
import dns from 'node:dns/promises'
import https from 'node:https'
import type { FetchDeps, FetchRequest, FetchResponse } from './fetchImage'

/** Every address the system resolver returns for a name (IPv4 and IPv6). */
export async function systemResolve(hostname: string): Promise<string[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

export function httpsRequest(request: FetchRequest): Promise<FetchResponse> {
  const { url, address, family, headers, signal } = request
  // Node expects bracketless IPv6 for the host; the URL keeps the brackets for IPv6 literals
  const hostname = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname
  return new Promise<FetchResponse>((resolve, reject) => {
    const req = https.request(
      {
        protocol: 'https:',
        host: hostname,
        servername: hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { ...headers },
        agent: false,
        signal,
        lookup: (_host, _options, callback) => {
          // always the pinned address, whatever the name; `all` callers get an array, others the plain form
          if (_options.all) callback(null, [{ address, family }])
          else callback(null, address, family)
        },
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: res,
          discard: () => res.destroy(),
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

/** The dependencies for production use. */
export const nodeFetchDeps: FetchDeps = {
  resolve: systemResolve,
  request: httpsRequest,
  now: Date.now,
}
