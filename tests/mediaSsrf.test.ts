import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkImageUrl, classifyIp, isPublicIp, nextRedirect, MAX_IMAGE_URL_LENGTH } from '../server/media/ssrf.ts'

const refused = (raw: string) => {
  const result = checkImageUrl(raw)
  assert.equal(result.ok, false, `expected refusal for ${raw}`)
  return result.ok ? '' : result.reason
}
const allowed = (raw: string) => {
  const result = checkImageUrl(raw)
  assert.equal(result.ok, true, `expected acceptance for ${raw}: ${result.ok ? '' : result.reason}`)
  return result.ok ? result.url : null
}

test('IPv4 loopback, private, link-local and metadata addresses are not public', () => {
  assert.equal(classifyIp('127.0.0.1'), 'loopback')
  assert.equal(classifyIp('127.255.255.255'), 'loopback')
  assert.equal(classifyIp('10.0.0.1'), 'private')
  assert.equal(classifyIp('10.255.255.255'), 'private')
  assert.equal(classifyIp('192.168.1.1'), 'private')
  assert.equal(classifyIp('169.254.169.254'), 'metadata')
  assert.equal(classifyIp('169.254.1.1'), 'link-local')
  assert.equal(classifyIp('0.0.0.0'), 'reserved')
  assert.equal(classifyIp('0.1.2.3'), 'reserved')
  assert.equal(isPublicIp('127.0.0.1'), false)
  assert.equal(isPublicIp('169.254.169.254'), false)
})

test('172.16/12 boundaries: 172.15 and 172.32 are public, 172.16 and 172.31 are private', () => {
  assert.equal(classifyIp('172.15.255.255'), 'public')
  assert.equal(classifyIp('172.16.0.0'), 'private')
  assert.equal(classifyIp('172.16.0.1'), 'private')
  assert.equal(classifyIp('172.31.255.255'), 'private')
  assert.equal(classifyIp('172.32.0.0'), 'public')
})

test('carrier-grade NAT 100.64/10 boundaries', () => {
  assert.equal(classifyIp('100.63.255.255'), 'public')
  assert.equal(classifyIp('100.64.0.1'), 'private')
  assert.equal(classifyIp('100.127.255.255'), 'private')
  assert.equal(classifyIp('100.128.0.0'), 'public')
})

test('reserved IPv4 blocks: protocol assignments, benchmarking, documentation, multicast, broadcast', () => {
  assert.equal(classifyIp('192.0.0.1'), 'reserved')
  assert.equal(classifyIp('192.0.2.7'), 'reserved')
  assert.equal(classifyIp('198.18.0.1'), 'reserved')
  assert.equal(classifyIp('198.19.255.255'), 'reserved')
  assert.equal(classifyIp('198.20.0.1'), 'public')
  assert.equal(classifyIp('224.0.0.1'), 'reserved')
  assert.equal(classifyIp('240.0.0.1'), 'reserved')
  assert.equal(classifyIp('255.255.255.255'), 'reserved')
})

test('public IPv4 addresses stay public', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1']) {
    assert.equal(classifyIp(ip), 'public', ip)
    assert.equal(isPublicIp(ip), true, ip)
  }
})

test('malformed IPv4 is invalid, including leading zeros and out-of-range octets', () => {
  for (const ip of ['256.0.0.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.04', 'abc', '', ' 1.2.3.4', '1.2.3.-4', '1..2.3']) {
    assert.equal(classifyIp(ip), 'invalid', JSON.stringify(ip))
    assert.equal(isPublicIp(ip), false, JSON.stringify(ip))
  }
})

test('IPv6 loopback, unspecified, unique-local, link-local and multicast', () => {
  assert.equal(classifyIp('::1'), 'loopback')
  assert.equal(classifyIp('::'), 'reserved')
  assert.equal(classifyIp('fc00::1'), 'private')
  assert.equal(classifyIp('fd12:3456:789a::1'), 'private')
  assert.equal(classifyIp('fe80::1'), 'link-local')
  assert.equal(classifyIp('febf::1'), 'link-local')
  assert.equal(classifyIp('fec0::1'), 'reserved')
  assert.equal(classifyIp('ff02::1'), 'reserved')
  assert.equal(classifyIp('2001:db8::1'), 'reserved')
  assert.equal(classifyIp('fd00:ec2::254'), 'metadata')
})

test('IPv6 expanded and compressed notations name the same address', () => {
  assert.equal(classifyIp('0:0:0:0:0:0:0:1'), 'loopback')
  assert.equal(classifyIp('0000:0000:0000:0000:0000:0000:0000:0001'), 'loopback')
  assert.equal(classifyIp('0:0:0:0:0:0:0:0'), 'reserved')
  assert.equal(classifyIp('2001:0db8:0000:0000:0000:0000:0000:0001'), 'reserved')
  assert.equal(classifyIp('2606:4700:4700::1111'), 'public')
  assert.equal(classifyIp('2a00:1450:0:0:0:0:0:1'), 'public')
  assert.equal(isPublicIp('2606:4700:4700::1111'), true)
})

test('IPv4-mapped IPv6 (::ffff:a.b.c.d) is judged by the embedded IPv4 address', () => {
  assert.equal(classifyIp('::ffff:127.0.0.1'), 'loopback')
  assert.equal(classifyIp('::ffff:7f00:1'), 'loopback')
  assert.equal(classifyIp('::ffff:169.254.169.254'), 'metadata')
  assert.equal(classifyIp('::ffff:10.0.0.1'), 'private')
  assert.equal(classifyIp('::ffff:8.8.8.8'), 'public')
  assert.equal(classifyIp('0:0:0:0:0:ffff:7f00:0001'), 'loopback')
})

test('NAT64 (64:ff9b::/96) is judged by the embedded IPv4 address; the local-use prefix is refused', () => {
  assert.equal(classifyIp('64:ff9b::7f00:1'), 'loopback')
  assert.equal(classifyIp('64:ff9b::a9fe:a9fe'), 'metadata')
  assert.equal(classifyIp('64:ff9b::808:808'), 'public')
  assert.equal(classifyIp('64:ff9b:1::1'), 'reserved')
})

test('6to4 (2002::/16) is judged by the embedded IPv4 address', () => {
  assert.equal(classifyIp('2002:7f00:1::'), 'loopback')
  assert.equal(classifyIp('2002:808:808::'), 'public')
})

test('zone ids and malformed IPv6 are invalid', () => {
  for (const ip of ['fe80::1%eth0', 'fe80::1%25eth0', '1::2::3', ':::1', '12345::1', 'gggg::1', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7']) {
    assert.equal(classifyIp(ip), 'invalid', ip)
  }
})

test('localhost variants are refused', () => {
  refused('https://localhost/a.png')
  refused('https://LOCALHOST/a.png')
  refused('https://localhost./a.png')
  refused('https://api.localhost/a.png')
  refused('https://printer.local/a.png')
  refused('https://db.internal/a.png')
  refused('https://metadata.google.internal/computeMetadata/v1/')
  refused('https://box.localdomain/a.png')
  refused('https://intranet/a.png')
})

test('loopback and metadata IP literals are refused in every notation the URL parser accepts', () => {
  refused('https://127.0.0.1/a.png')
  refused('https://169.254.169.254/latest/meta-data/')
  refused('https://0.0.0.0/a.png')
  refused('https://10.1.2.3/a.png')
  refused('https://[::1]/a.png')
  refused('https://[::]/a.png')
  refused('https://[::ffff:127.0.0.1]/a.png')
  refused('https://[::ffff:7f00:1]/a.png')
  refused('https://[64:ff9b::7f00:1]/a.png')
  refused('https://[2001:db8::1]/a.png')
  refused('https://[fc00::1]/a.png')
  refused('https://[fe80::1]/a.png')
})

test('decimal, octal and hex hosts are normalised by the URL parser and refused as loopback', () => {
  // WHATWG URL turns these into dotted decimal before any check, so they must come out as 127.0.0.1
  for (const raw of ['https://2130706433/a.png', 'https://0x7f.1/a.png', 'https://0x7f000001/a.png', 'https://017700000001/a.png']) {
    const reason = refused(raw)
    assert.match(reason, /127\.0\.0\.1/, raw)
  }
  const parsed = new URL('https://2130706433/a.png')
  assert.equal(parsed.hostname, '127.0.0.1')
})

test('a public IP literal is accepted', () => {
  const url = allowed('https://8.8.8.8/a.png')
  assert.equal(url?.hostname, '8.8.8.8')
})

test('only https is accepted', () => {
  refused('http://example.com/a.png')
  refused('ftp://example.com/a.png')
  refused('file:///etc/passwd')
  refused('javascript:alert(1)')
  refused('data:image/png;base64,AAAA')
})

test('ports other than 443 are refused; an explicit 443 is accepted', () => {
  refused('https://example.com:8443/a.png')
  refused('https://example.com:80/a.png')
  assert.equal(allowed('https://example.com:443/a.png')?.port, '')
  assert.equal(allowed('https://example.com/a.png')?.port, '')
})

test('credentials in the URL are refused', () => {
  refused('https://user:pass@example.com/a.png')
  refused('https://user@example.com/a.png')
  refused('https://:pass@example.com/a.png')
})

test('malformed, empty and too long URLs are refused', () => {
  refused('not a url')
  refused('')
  refused('https://')
  refused(`https://example.com/${'a'.repeat(MAX_IMAGE_URL_LENGTH)}`)
  assert.equal(allowed(`https://example.com/${'a'.repeat(MAX_IMAGE_URL_LENGTH - 'https://example.com/'.length)}`) !== null, true)
})

test('surrounding whitespace is trimmed and a normal image URL is accepted', () => {
  const url = allowed('   https://images.example.org/cats/tabby.webp?size=large   ')
  assert.equal(url?.hostname, 'images.example.org')
  assert.equal(url?.pathname, '/cats/tabby.webp')
})

test('redirect to a private IP literal is refused', () => {
  const base = new URL('https://images.example.org/a.png')
  for (const location of ['https://127.0.0.1/a.png', 'https://169.254.169.254/', '//10.0.0.5/a.png', 'https://[::1]/']) {
    const result = nextRedirect(base, location, 0)
    assert.equal(result.ok, false, location)
  }
})

test('redirect to http is refused, and a relative redirect stays on https', () => {
  const base = new URL('https://images.example.org/a/b.png')
  const downgrade = nextRedirect(base, 'http://images.example.org/c.png', 0)
  assert.equal(downgrade.ok, false)
  const relative = nextRedirect(base, '../c.png', 0)
  assert.equal(relative.ok, true)
  if (relative.ok) assert.equal(relative.url.href, 'https://images.example.org/c.png')
})

test('the fourth redirect is refused; the third is allowed', () => {
  const base = new URL('https://images.example.org/a.png')
  assert.equal(nextRedirect(base, '/b.png', 0).ok, true)
  assert.equal(nextRedirect(base, '/b.png', 2).ok, true)
  const fourth = nextRedirect(base, '/b.png', 3)
  assert.equal(fourth.ok, false)
  if (!fourth.ok) assert.match(fourth.reason, /przekierowań/)
})

test('a redirect without a Location header is refused', () => {
  assert.equal(nextRedirect(new URL('https://images.example.org/a.png'), null, 0).ok, false)
  assert.equal(nextRedirect(new URL('https://images.example.org/a.png'), '', 0).ok, false)
})

test('reasons are Polish', () => {
  assert.equal(refused('http://example.com/a.png'), 'Dozwolony jest tylko protokół https.')
  assert.match(refused('https://example.com:8443/'), /port 443/)
})
