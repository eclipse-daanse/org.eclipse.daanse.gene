/**
 * The inherited scopes in the Atlas tree.
 *
 * A tenant builds on platform, platform on atlas - where the shared system
 * schemas live. The tree used to load one parent only: connected to the tenant,
 * it showed platform but never atlas, although the metamodel resolver does look
 * there. Now it follows the whole chain, each parent nested in its heir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'
import { clearAllCredentials } from 'storage-model-atlas'

function scopeXmi(name: string, parent?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:Scope xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0"
    xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" name="${name}"${parent ? ` parentScope="${parent}"` : ''}>
  <registries name="schema" type="SCHEMA">
    <stages name="release"/>
  </registries>
</workflowapi:Scope>`
}

/** Scopes by name, as the server knows them */
let scopes: Record<string, string> = {}

function labels(node: any): string[] {
  return (node.children ?? []).map((c: any) => c.label)
}

describe('inherited scopes in the tree', () => {
  let browser: ReturnType<typeof useSharedAtlasBrowser>

  beforeEach(() => {
    clearAllCredentials()
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      const name = decodeURIComponent(String(input).split('/scopes/')[1] ?? '')
      return scopes[name]
        ? new Response(scopes[name], { status: 200 })
        : new Response('not found', { status: 404 })
    }))
    browser = useSharedAtlasBrowser()
    for (const c of [...browser.connections.value]) browser.disconnect(c.id)
  })

  it('shows the whole chain, each parent inside its heir', async () => {
    scopes = {
      dimcity: scopeXmi('dimcity', 'platform'),
      platform: scopeXmi('platform', 'atlas'),
      atlas: scopeXmi('atlas'),
    }
    await browser.connect({ baseUrl: 'https://atlas.example/rest', scopeName: 'dimcity', token: '' })

    const tenant = browser.treeNodes.value.find((n: any) => n.label?.includes('dimcity'))!
    expect(labels(tenant)[0]).toBe('[inherited] platform')
    const platform = tenant.children![0]!
    expect(labels(platform)[0]).toBe('[inherited] atlas')
    const atlas = platform.children![0]!
    expect(labels(atlas)).not.toContain(expect.stringMatching(/inherited/))
  })

  it('a cycle in the chain ends instead of looping', async () => {
    scopes = {
      a: scopeXmi('a', 'b'),
      b: scopeXmi('b', 'a'),
    }
    await browser.connect({ baseUrl: 'https://atlas.example/rest', scopeName: 'a', token: '' })

    const a = browser.treeNodes.value.find((n: any) => n.label?.includes('a@') || n.data?.scopeName === 'a')!
    const b = a.children![0]!
    expect(b.label).toBe('[inherited] b')
    // b's parent would be a again - not loaded a second time
    expect(labels(b).filter((l) => l.startsWith('[inherited]'))).toEqual([])
  })

  it('a parent the server does not know ends the chain quietly', async () => {
    scopes = { dimcity: scopeXmi('dimcity', 'platform') }
    const conn = await browser.connect({ baseUrl: 'https://atlas.example/rest', scopeName: 'dimcity', token: '' })
    expect(conn.status).toBe('connected')
    const tenant = browser.treeNodes.value.find((n: any) => n.label?.includes('dimcity'))!
    expect(labels(tenant).filter((l) => l.startsWith('[inherited]'))).toEqual([])
  })
})
