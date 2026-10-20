/**
 * Address classification and URL validation for the image fetcher (Media-Storage-Plan, "C. MCP - media_upload_from_url").
 * Pure and import-free: no DNS, no sockets. The fetcher (fetchImage.ts) resolves names and connects; this file only
 * decides whether an address or a URL may be used at all. Polish reasons are user-facing.
 */

export type IpClass = 'public' | 'private' | 'loopback' | 'link-local' | 'metadata' | 'reserved' | 'invalid'

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

/** Longest URL accepted (the fetcher never needs more). */
export const MAX_IMAGE_URL_LENGTH = 2048
/** Redirects followed in total (the original request is not counted). */
export const MAX_REDIRECTS = 3

// ---- IPv4 ---------------------------------------------------------------------------------------

/** Four decimal octets; leading zeros are refused (they are read as octal by some resolvers). */
function parseIpv4(text: string): [number, number, number, number] | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }
  return [octets[0], octets[1], octets[2], octets[3]]
}

const toUint32 = (o: readonly number[]): number => ((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3]

interface V4Range {
  base: number
  prefix: number
  cls: IpClass
}

const range = (address: string, prefix: number, cls: IpClass): V4Range => {
  const octets = parseIpv4(address)
  if (!octets) throw new Error(`ssrf: bad built-in address ${address}`)
  return { base: toUint32(octets), prefix, cls }
}

// Order matters only for the metadata exception, which is checked before the link-local range it sits in.
const V4_RANGES: readonly V4Range[] = [
  range('0.0.0.0', 8, 'reserved'), // "this network"
  range('10.0.0.0', 8, 'private'),
  range('100.64.0.0', 10, 'private'), // carrier-grade NAT, reached from inside the provider network
  range('127.0.0.0', 8, 'loopback'),
  range('169.254.0.0', 16, 'link-local'),
  range('172.16.0.0', 12, 'private'),
  range('192.0.0.0', 24, 'reserved'), // IETF protocol assignments
  range('192.0.2.0', 24, 'reserved'), // documentation
  range('192.168.0.0', 16, 'private'),
  range('198.18.0.0', 15, 'reserved'), // benchmarking
  range('198.51.100.0', 24, 'reserved'), // documentation
  range('203.0.113.0', 24, 'reserved'), // documentation
  range('224.0.0.0', 4, 'reserved'), // multicast
  range('240.0.0.0', 4, 'reserved'), // future use and 255.255.255.255
]

const METADATA_V4 = toUint32(parseIpv4('169.254.169.254') as number[])

function classifyV4(octets: readonly number[]): IpClass {
  const value = toUint32(octets)
  if (value === METADATA_V4) return 'metadata'
  for (const entry of V4_RANGES) {
    const shift = 32 - entry.prefix
    if (value >>> shift === entry.base >>> shift) return entry.cls
  }
  return 'public'
}

// ---- IPv6 ---------------------------------------------------------------------------------------

/** Expands an IPv6 text (compressed or not, optional trailing dotted IPv4) to eight 16-bit groups. */
function parseIpv6(text: string): number[] | null {
  if (text.includes('%')) return null // zone ids are never accepted
  const halves = text.split('::')
  if (halves.length > 2) return null
  const compressed = halves.length === 2
  const splitGroups = (part: string): string[] => (part === '' ? [] : part.split(':'))
  const left = splitGroups(halves[0])
  const right = compressed ? splitGroups(halves[1]) : []

  // a dotted IPv4 tail is allowed only as the last group of the whole address
  const last = compressed ? right : left
  const tailIndex = last.length - 1
  if (tailIndex >= 0 && last[tailIndex].includes('.')) {
    const octets = parseIpv4(last[tailIndex])
    if (!octets) return null
    last.splice(tailIndex, 1, ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16))
  }

  const groups = [...left, ...right]
  if (groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null
  if (compressed ? groups.length > 7 : groups.length !== 8) return null
  const zeros = 8 - groups.length
  const values = [...left.map((g) => parseInt(g, 16)), ...Array<number>(zeros).fill(0), ...right.map((g) => parseInt(g, 16))]
  return values.length === 8 ? values : null
}

const v4FromGroups = (hi: number, lo: number): number[] => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]

const isZeroFrom = (g: readonly number[], from: number, to: number): boolean => {
  for (let i = from; i < to; i++) if (g[i] !== 0) return false
  return true
}

function classifyV6(g: number[]): IpClass {
  // unspecified and loopback
  if (isZeroFrom(g, 0, 8)) return 'reserved'
  if (isZeroFrom(g, 0, 7) && g[7] === 1) return 'loopback'
  // the AWS IPv6 instance metadata endpoint (inside fc00::/7, so it must be matched first)
  if (g[0] === 0xfd00 && g[1] === 0x0ec2 && isZeroFrom(g, 2, 7) && g[7] === 0x254) return 'metadata'
  // IPv4-mapped (::ffff:a.b.c.d), NAT64 well-known prefix (64:ff9b::/96) and the deprecated IPv4-compatible
  // ::/96 all carry an IPv4 address in the last 32 bits: judge that address
  if (isZeroFrom(g, 0, 5) && g[5] === 0xffff) return classifyV4(v4FromGroups(g[6], g[7]))
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    return isZeroFrom(g, 2, 6) ? classifyV4(v4FromGroups(g[6], g[7])) : 'reserved' // local-use NAT64 prefix is not judged
  }
  if (isZeroFrom(g, 0, 6)) return classifyV4(v4FromGroups(g[6], g[7]))
  // 6to4 (2002::/16) embeds the IPv4 address in the next 32 bits
  if (g[0] === 0x2002) return classifyV4(v4FromGroups(g[1], g[2]))
  if (g[0] === 0x2001 && g[1] === 0x0db8) return 'reserved' // documentation
  if (g[0] === 0x2001 && g[1] === 0) return 'reserved' // Teredo tunnels
  if ((g[0] & 0xfe00) === 0xfc00) return 'private' // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return 'link-local' // fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return 'reserved' // deprecated site-local fec0::/10
  if ((g[0] & 0xff00) === 0xff00) return 'reserved' // multicast ff00::/8
  return 'public'
}

/**
 * Class of one IP address (IPv4 dotted decimal or IPv6 text). Anything else, including IPv6 zone ids
 * (`fe80::1%eth0`) and non-canonical IPv4 such as leading zeros, is 'invalid'.
 */
export function classifyIp(ip: string): IpClass {
  if (typeof ip !== 'string' || ip === '') return 'invalid'
  if (ip.includes(':')) {
    const groups = parseIpv6(ip)
    return groups ? classifyV6(groups) : 'invalid'
  }
  const octets = parseIpv4(ip)
  return octets ? classifyV4(octets) : 'invalid'
}

/** True only for an address that classifies as 'public'. */
export const isPublicIp = (ip: string): boolean => classifyIp(ip) === 'public'

const REASON_BY_CLASS: Record<Exclude<IpClass, 'public'>, string> = {
  private: 'jest adresem prywatnym',
  loopback: 'jest adresem pętli zwrotnej (localhost)',
  'link-local': 'jest adresem link-local',
  metadata: 'jest adresem metadanych chmury',
  reserved: 'jest adresem zarezerwowanym',
  invalid: 'nie jest poprawnym adresem IP',
}

/** Polish reason for a non-public address, or null when the address is public. */
export function reasonForIp(ip: string): string | null {
  const cls = classifyIp(ip)
  return cls === 'public' ? null : `Adres ${ip} ${REASON_BY_CLASS[cls]}.`
}

// ---- URLs ---------------------------------------------------------------------------------------

const IPV4_LITERAL = /^[0-9.]+$/

/** Hostnames that name this machine or its private network, by label, after dropping one trailing dot. */
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain']

function checkHostname(hostname: string): string | null {
  if (hostname === '') return 'Adres nie ma nazwy hosta.'
  // IP literals (WHATWG has already normalised decimal, octal and hex forms to dotted or colon notation)
  if (hostname.startsWith('[')) {
    const ip = hostname.slice(1, -1)
    return reasonForIp(ip)
  }
  if (IPV4_LITERAL.test(hostname)) return reasonForIp(hostname)

  const name = hostname.toLowerCase().replace(/\.$/, '')
  if (name === 'localhost' || PRIVATE_SUFFIXES.some((suffix) => name.endsWith(suffix)) || name === 'localdomain') {
    return 'Adres wskazuje na sieć lokalną albo localhost. Podaj publiczny adres https.'
  }
  if (!name.includes('.')) return 'Nazwa hosta musi zawierać domenę (np. przyklad.pl), a nie samą nazwę.'
  return null
}

/**
 * Validates an image URL before any DNS lookup or connection: https only, port 443 or none, no credentials,
 * no local or private host name, and an IP literal must be public. Trims surrounding whitespace.
 */
export function checkImageUrl(raw: string): UrlCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'Adres musi być tekstem.' }
  const text = raw.trim()
  if (text.length > MAX_IMAGE_URL_LENGTH) return { ok: false, reason: `Adres jest za długi (maks. ${MAX_IMAGE_URL_LENGTH} znaków).` }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, reason: 'Adres nie jest poprawnym URL-em.' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Dozwolony jest tylko protokół https.' }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'Adres nie może zawierać loginu ani hasła.' }
  }
  // WHATWG drops an explicit default port, so anything left here is a non-default one
  if (url.port !== '' && url.port !== '443') return { ok: false, reason: 'Dozwolony jest tylko port 443.' }
  const hostReason = checkHostname(url.hostname)
  if (hostReason) return { ok: false, reason: hostReason }
  return { ok: true, url }
}

/**
 * The next hop of a redirect: resolves `location` against the current URL, enforces the redirect limit
 * (`hops` = redirects already followed) and validates the target like the original URL, so a switch to http
 * or to a private address is refused at the hop where it happens.
 */
export function nextRedirect(base: URL, location: string | null, hops: number): UrlCheck {
  if (hops >= MAX_REDIRECTS) return { ok: false, reason: `Za dużo przekierowań (maks. ${MAX_REDIRECTS}).` }
  if (!location) return { ok: false, reason: 'Przekierowanie bez adresu docelowego.' }
  let target: URL
  try {
    target = new URL(location, base)
  } catch {
    return { ok: false, reason: 'Przekierowanie wskazuje na niepoprawny adres.' }
  }
  return checkImageUrl(target.href)
}
