import { describe, expect, test } from 'bun:test'
import { assertPublicUrl, checkUrlShape, FetchBlockedError, isPrivateAddress, safeFetch } from './net-guard'

const publicResolver = async () => ['93.184.216.34']
const blocked = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => null, e => e)
  expect(error).toBeInstanceOf(FetchBlockedError)
  return (error as FetchBlockedError).reason
}

describe('isPrivateAddress', () => {
  test('IPv4 privadas y especiales', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255']) {
      expect(isPrivateAddress(ip)).toBe(true)
    }
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1']) expect(isPrivateAddress(ip)).toBe(false)
  })
  test('IPv6, incluidas formas mapeadas y NAT64', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', 'ff02::1', '2001:db8::1']) {
      expect(isPrivateAddress(ip)).toBe(true)
    }
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false)
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false)
  })
  test('algo que no es una IP se bloquea', () => {
    expect(isPrivateAddress('no-es-ip')).toBe(true)
  })
})

describe('checkUrlShape', () => {
  test('rechaza esquemas, credenciales, puertos y hosts internos', async () => {
    for (const url of ['http://example.com', 'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@example.com', 'https://example.com:8443',
      'https://localhost', 'https://intranet', 'https://servidor.local', 'https://a.internal', 'https://x.onion', 'no es url']) {
      expect(() => checkUrlShape(url)).toThrow(FetchBlockedError)
    }
  })
  test('rechaza literales de IP privada en cualquier notación', () => {
    for (const url of ['https://127.0.0.1', 'https://2130706433', 'https://0x7f.0.0.1', 'https://0177.0.0.1', 'https://[::1]', 'https://[::ffff:10.0.0.1]', 'https://169.254.169.254/latest/meta-data']) {
      expect(() => checkUrlShape(url)).toThrow(FetchBlockedError)
    }
  })
  test('acepta una URL https pública', () => {
    expect(checkUrlShape('https://es.wikipedia.org/wiki/SQL').hostname).toBe('es.wikipedia.org')
  })
})

describe('assertPublicUrl', () => {
  test('un host que resuelve a IP privada (incluso una de varias) se bloquea', async () => {
    expect(await blocked(assertPublicUrl('https://evil.example.com', async () => ['93.184.216.34', '10.0.0.5']))).toBe('private_address')
    expect(await blocked(assertPublicUrl('https://evil.example.com', async () => ['::ffff:127.0.0.1']))).toBe('private_address')
  })
  test('DNS que falla o no resuelve se bloquea', async () => {
    expect(await blocked(assertPublicUrl('https://x.example.com', async () => { throw new Error('nx') }))).toBe('dns')
    expect(await blocked(assertPublicUrl('https://x.example.com', async () => []))).toBe('dns')
  })
})

const html = (body: string, type = 'text/html; charset=utf-8', status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': type, ...headers } })

describe('safeFetch', () => {
  test('descarga y devuelve la URL final', async () => {
    const result = await safeFetch('https://example.com/a', { resolver: publicResolver, fetchImpl: async () => html('<p>hola</p>') })
    expect(result).toMatchObject({ status: 200, body: '<p>hola</p>', truncated: false })
  })

  test('una redirección a una IP privada se bloquea en el salto, no solo en la URL inicial', async () => {
    const seen: string[] = []
    const reason = await blocked(safeFetch('https://example.com/a', {
      resolver: async host => (host === 'example.com' ? ['93.184.216.34'] : ['10.0.0.9']),
      fetchImpl: async url => { seen.push(url); return new Response(null, { status: 302, headers: { location: 'https://interno.example.org/admin' } }) },
    }))
    expect(reason).toBe('private_address')
    expect(seen).toEqual(['https://example.com/a'])
  })

  test('una redirección a http o a un literal de IP se bloquea', async () => {
    for (const location of ['http://example.com/x', 'https://127.0.0.1/', 'https://[::1]/']) {
      await blocked(safeFetch('https://example.com/a', { resolver: publicResolver, fetchImpl: async () => new Response(null, { status: 301, headers: { location } }) }))
    }
  })

  test('limita el número de redirecciones', async () => {
    const reason = await blocked(safeFetch('https://example.com/a', {
      resolver: publicResolver, maxRedirects: 2,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://example.com/loop' } }),
    }))
    expect(reason).toBe('redirect')
  })

  test('corta el stream en maxBytes sin leer todo', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulled++; controller.enqueue(new Uint8Array(1000).fill(65)); if (pulled > 10_000) controller.close() },
    })
    const result = await safeFetch('https://example.com/big', {
      resolver: publicResolver, maxBytes: 5000,
      fetchImpl: async () => new Response(stream, { headers: { 'content-type': 'text/plain' } }),
    })
    expect(result.truncated).toBe(true)
    expect(result.body.length).toBe(5000)
    expect(pulled).toBeLessThan(50)
  })

  test('tipos no textuales y estados de error se rechazan', async () => {
    expect(await blocked(safeFetch('https://example.com/a.pdf', { resolver: publicResolver, fetchImpl: async () => html('%PDF', 'application/pdf') }))).toBe('content_type')
    expect(await blocked(safeFetch('https://example.com/x', { resolver: publicResolver, fetchImpl: async () => html('no', 'text/html', 404) }))).toBe('status')
  })

  test('timeout total', async () => {
    const reason = await blocked(safeFetch('https://example.com/slow', {
      resolver: publicResolver, timeoutMs: 50,
      fetchImpl: (_url, init) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')))),
    }))
    expect(reason).toBe('timeout')
  })

  test('beforeRequest se evalúa en cada salto', async () => {
    const hosts: string[] = []
    await blocked(safeFetch('https://example.com/a', {
      resolver: publicResolver,
      beforeRequest: url => { hosts.push(url.hostname); if (url.hostname === 'otro.example.net') throw new FetchBlockedError('domain', 'no') },
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://otro.example.net/' } }),
    }))
    expect(hosts).toEqual(['example.com', 'otro.example.net'])
  })
})
