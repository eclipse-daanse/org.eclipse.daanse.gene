/**
 * Restoring Atlas connections from a workspace.
 *
 * Two places used to do this with their own copy, and they had drifted: the
 * plugin's workspace-loaded listener passed only a token, so a connection with
 * `authKind="basic"` in the .wsp came up as `kind: 'none'` — no key, and
 * nobody ever asked for the password. The tree's copy then skipped it as
 * "already connected".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'
import { clearAllCredentials, setCredentialPrompt } from 'storage-model-atlas'

/** An EObject as the XMI loader hands it over: values as strings. */
function fakeConnection(values: Record<string, unknown>) {
  return {
    eClass: () => ({
      getEStructuralFeature: (name: string) => (name in values ? { name } : undefined)
    }),
    eGet: (f: { name: string }) => values[f.name]
  }
}

function fakeConfig(connections: unknown[]) {
  return {
    eClass: () => ({
      getEStructuralFeature: (name: string) =>
        name === 'atlasConnections' ? { name } : undefined
    }),
    eGet: () => connections
  }
}

const SCOPE_XMI = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:Scope xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0"
    xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" name="jena"/>`

describe('autoConnectFromWorkspace', () => {
  let browser: ReturnType<typeof useSharedAtlasBrowser>

  beforeEach(() => {
    clearAllCredentials()
    setCredentialPrompt(async () => 'geheim')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SCOPE_XMI, { status: 200 })))
    browser = useSharedAtlasBrowser()
    for (const c of [...browser.connections.value]) browser.disconnect(c.id)
  })

  it('takes the authentication kind from the workspace', async () => {
    await browser.autoConnectFromWorkspace(
      fakeConfig([
        fakeConnection({
          baseUrl: 'https://atlas.example/rest',
          scopeName: 'jena',
          authKind: 'basic',
          user: 'demo',
          enabled: 'true',
          autoConnect: 'true'
        })
      ])
    )

    const connection = browser.connections.value.find((c) => c.scopeName === 'jena')
    expect(connection?.auth).toEqual({ kind: 'basic', user: 'demo' })
    // And the secret was asked for, not read from the file
    const header = (globalThis.fetch as any).mock.calls[0][1].headers.Authorization
    expect(header).toBe(`Basic ${btoa('demo:geheim')}`)
  })

  it('reads a token from an older workspace as Bearer', async () => {
    await browser.autoConnectFromWorkspace(
      fakeConfig([
        fakeConnection({
          baseUrl: 'https://alt.example/rest',
          scopeName: 'jena',
          token: 'eyJabc'
        })
      ])
    )

    const connection = browser.connections.value.find((c) => c.baseUrl === 'https://alt.example/rest')
    expect(connection?.auth?.kind).toBe('bearer')
    expect((globalThis.fetch as any).mock.calls[0][1].headers.Authorization).toBe('Bearer eyJabc')
  })

  it('without authentication nothing is asked', async () => {
    const prompt = vi.fn(async () => 'nicht noetig')
    setCredentialPrompt(prompt)
    await browser.autoConnectFromWorkspace(
      fakeConfig([
        fakeConnection({ baseUrl: 'https://offen.example/rest', scopeName: 'jena' })
      ])
    )
    expect(prompt).not.toHaveBeenCalled()
  })

  it('honours enabled="false" even as a string', async () => {
    // The XMI carries booleans as strings; `=== false` never matched (#136)
    await browser.autoConnectFromWorkspace(
      fakeConfig([
        fakeConnection({
          baseUrl: 'https://aus.example/rest',
          scopeName: 'jena',
          enabled: 'false'
        })
      ])
    )
    expect(browser.connections.value.some((c) => c.baseUrl === 'https://aus.example/rest')).toBe(false)
  })
})
