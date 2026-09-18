/**
 * Authentication: header, session store and the second attempt after a 401.
 *
 * The difference that drives it: a Bearer token expires, Basic credentials
 * never do. So the secret lives only in this session's memory, and a 401
 * discards it instead of locking the user out.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  authorizationHeader,
  resolveAuthorization,
  setCredential,
  getCredential,
  clearAllCredentials,
  setCredentialPrompt,
  authFromToken,
} from '../auth'
import { ModelAtlasClient } from '../ModelAtlasClient'

const BASE = 'http://atlas.local/rest'

beforeEach(() => {
  clearAllCredentials()
  setCredentialPrompt(null)
})

describe('authorizationHeader', () => {
  it('Bearer takes the secret unchanged', () => {
    expect(authorizationHeader({ kind: 'bearer' }, 'eyJabc')).toBe('Bearer eyJabc')
  })

  it('Basic encodes user and password', () => {
    expect(authorizationHeader({ kind: 'basic', user: 'ada' }, 'secret')).toBe(
      `Basic ${btoa('ada:secret')}`,
    )
  })

  it('Basic without a user yields no header', () => {
    // Some servers read ":password" as anonymous — better send nothing
    expect(authorizationHeader({ kind: 'basic' }, 'secret')).toBeUndefined()
  })

  it('no authentication and no secret: no header', () => {
    expect(authorizationHeader({ kind: 'none' }, 'egal')).toBeUndefined()
    expect(authorizationHeader({ kind: 'bearer' }, undefined)).toBeUndefined()
  })
})

describe('session store', () => {
  it('separates by connection and user', () => {
    setCredential(BASE, 'ada', 'a')
    setCredential(BASE, 'bob', 'b')
    setCredential('http://anderer/rest', 'ada', 'c')
    expect(getCredential(BASE, 'ada')).toBe('a')
    expect(getCredential(BASE, 'bob')).toBe('b')
    expect(getCredential('http://anderer/rest', 'ada')).toBe('c')
  })

  it('asks exactly once per session', async () => {
    const dialog = vi.fn(async () => 'secret')
    setCredentialPrompt(dialog)

    const auth = { kind: 'basic' as const, user: 'ada' }
    expect(await resolveAuthorization(BASE, auth)).toBe(`Basic ${btoa('ada:secret')}`)
    expect(await resolveAuthorization(BASE, auth)).toBe(`Basic ${btoa('ada:secret')}`)
    expect(dialog).toHaveBeenCalledTimes(1)
  })

  it('a cancelled dialog yields no header and remembers nothing', async () => {
    setCredentialPrompt(async () => null)
    expect(await resolveAuthorization(BASE, { kind: 'bearer' })).toBeUndefined()
    expect(getCredential(BASE)).toBeUndefined()
  })

  it('retry discards the old secret and asks again', async () => {
    setCredential(BASE, 'ada', 'wrong')
    const dialog = vi.fn(async () => 'right')
    setCredentialPrompt(dialog)

    const header = await resolveAuthorization(BASE, { kind: 'basic', user: 'ada' }, { retry: true })
    expect(header).toBe(`Basic ${btoa('ada:right')}`)
    expect(dialog).toHaveBeenCalledWith(expect.objectContaining({ retry: true }))
  })

  it('without a dialog the remembered secret is used', async () => {
    setCredential(BASE, undefined, 'eyJabc')
    expect(await resolveAuthorization(BASE, { kind: 'bearer' })).toBe('Bearer eyJabc')
  })
})

describe('ModelAtlasClient', () => {
  it('sends the header and retries after a 401 with the new secret', async () => {
    const sent: Array<string | undefined> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: any) => {
        const header = init?.headers?.Authorization
        sent.push(header)
        const ok = header === `Basic ${btoa('ada:right')}`
        return new Response(ok ? '<xmi/>' : 'no', { status: ok ? 200 : 401 })
      }),
    )

    setCredential(BASE, 'ada', 'wrong')
    setCredentialPrompt(async () => 'right')

    const client = new ModelAtlasClient({ baseUrl: BASE, auth: { kind: 'basic', user: 'ada' } })
    expect(await client.getScope('jena')).toBe('<xmi/>')
    expect(sent).toEqual([`Basic ${btoa('ada:wrong')}`, `Basic ${btoa('ada:right')}`])
  })

  it('a token passed in counts as Bearer and lands in the session store', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<xmi/>', { status: 200 })))
    const client = new ModelAtlasClient({ baseUrl: BASE, token: 'eyJabc' })
    expect(client.getAuth()).toEqual({ kind: 'bearer' })
    expect(getCredential(BASE)).toBe('eyJabc')
    await client.getScope('jena')
    expect((globalThis.fetch as any).mock.calls[0][1].headers.Authorization).toBe('Bearer eyJabc')
  })

  it('without authentication no header goes out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<xmi/>', { status: 200 })))
    const client = new ModelAtlasClient({ baseUrl: BASE })
    await client.getScope('jena')
    expect((globalThis.fetch as any).mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})

describe('authFromToken', () => {
  it('empty means no authentication', () => {
    expect(authFromToken('  ')).toEqual({ auth: { kind: 'none' } })
    expect(authFromToken(undefined)).toEqual({ auth: { kind: 'none' } })
  })

  it('otherwise Bearer with its secret', () => {
    expect(authFromToken(' eyJabc ')).toEqual({ auth: { kind: 'bearer' }, secret: 'eyJabc' })
  })
})
