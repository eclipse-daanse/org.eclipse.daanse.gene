/**
 * The overview of a loaded workspace: what its `.wsp` declares, joined with
 * what is actually loaded.
 */
import { describe, it, expect } from 'vitest'
import { addableFiles, buildWorkspaceOverview, type OverviewInput } from '../services/workspaceOverview'

function input(over: Partial<OverviewInput> = {}): OverviewInput {
  return {
    modelSources: [],
    instanceSources: [],
    atlasConnections: [],
    resolvers: [],
    loadedModels: new Map(),
    openInstances: new Set(),
    constraintFiles: [],
    loadedConstraints: new Set(),
    liveAtlas: [],
    fileExists: () => true,
    ...over,
  }
}

describe('workspace overview', () => {
  it('models: loaded with their package, missing, disabled, from the Atlas', () => {
    const overview = buildWorkspaceOverview(input({
      modelSources: [
        { name: 'university', location: 'uni/university.ecore', enabled: true },
        { name: 'gone', location: 'uni/gone.ecore', enabled: true },
        { name: 'off', location: 'uni/off.ecore', enabled: 'false' },
        { name: 'university', location: 'atlas://university.ecore', enabled: true },
      ],
      loadedModels: new Map([['uni/university.ecore', 'university']]),
      fileExists: (location) => location !== 'uni/gone.ecore',
    }))
    expect(overview.models.map((e) => [e.status, e.detail])).toEqual([
      ['loaded', 'university'],
      ['missing', undefined],
      ['disabled', undefined],
      ['not-loaded', 'aus dem Atlas'],
    ])
  })

  it('instances: open in a tab counts as loaded', () => {
    const overview = buildWorkspaceOverview(input({
      instanceSources: [
        { location: 'uni/university-instance.xmi' },
        { location: 'uni/other.xmi' },
      ],
      openInstances: new Set(['uni/university-instance.xmi']),
    }))
    expect(overview.instances.map((e) => [e.label, e.status])).toEqual([
      ['university-instance.xmi', 'loaded'],
      ['other.xmi', 'not-loaded'],
    ])
  })

  it('reads EObjects reflectively', () => {
    const feature = (name: string) => ({ name })
    const eObject = {
      eClass: () => ({ getEStructuralFeature: (name: string) => feature(name) }),
      eGet: (f: { name: string }) => ({ location: 'uni/university.ecore', enabled: 'true' } as any)[f.name],
    }
    const overview = buildWorkspaceOverview(input({ modelSources: [eObject] }))
    expect(overview.models[0]).toMatchObject({ label: 'university.ecore', location: 'uni/university.ecore' })
  })

  it('constraint files beside the workspace, and which loaded', () => {
    const overview = buildWorkspaceOverview(input({
      constraintFiles: ['uni/university.c-ocl', 'uni/broken.c-ocl'],
      loadedConstraints: new Set(['uni/university.c-ocl']),
    }))
    expect(overview.constraints.map((e) => e.status)).toEqual(['loaded', 'not-loaded'])
  })

  it('Atlas connections take their state from the browser', () => {
    const declared = { name: 'jena', baseUrl: 'https://atlas', scopeName: 'jena', enabled: true }
    const none = buildWorkspaceOverview(input({ atlasConnections: [declared] }))
    expect(none.atlas[0]?.status).toBe('disconnected')

    const failed = buildWorkspaceOverview(input({
      atlasConnections: [declared],
      liveAtlas: [{ baseUrl: 'https://atlas', scopeName: 'jena', status: 'error', error: '401' }],
    }))
    expect(failed.atlas[0]).toMatchObject({ status: 'error', detail: '401' })
  })

  it('resolvers: kind and scope as detail', () => {
    const overview = buildWorkspaceOverview(input({
      resolvers: [{ name: 'Atlas', kind: 'MODEL_ATLAS', scopeName: 'jena', enabled: false }],
    }))
    expect(overview.resolvers[0]).toMatchObject({ label: 'Atlas', status: 'disabled', detail: 'MODEL_ATLAS · jena' })
  })
})

describe('files that can be added', () => {
  it('only matching extensions, nothing declared twice', () => {
    const files = [
      { name: 'university.ecore', path: 'uni/university.ecore' },
      { name: 'library.ecore', path: 'lib/library.ecore' },
      { name: 'notes.txt', path: 'notes.txt' },
    ]
    const declared = [{ key: 'm', label: 'university', location: 'uni/university.ecore', status: 'loaded' as const }]
    expect(addableFiles(files, ['.ecore'], declared).map((f) => f.path)).toEqual(['lib/library.ecore'])
  })
})
