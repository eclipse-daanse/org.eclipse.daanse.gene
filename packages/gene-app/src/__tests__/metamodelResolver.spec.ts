/**
 * The metamodel resolver looks where the instance loader looks: registry first,
 * then the workspace's .ecore files, then the Atlas providers.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { EPackageRegistry, BasicEPackage } from '@emfts/core'
import { createMetamodelResolver } from '../services/metamodelResolver'

const NS = 'http://test/resolver/sensor'
const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="sensor" nsURI="${NS}" nsPrefix="sensor"/>`

function fakeWorkspace(files: { path: string; content: string }[]) {
  const entries = files.map(f => ({ name: f.path.split('/').pop(), path: f.path, isDirectory: false }))
  return {
    sources: { value: [{ id: 'ws', name: 'Workspace' }] },
    filesBySource: new Map([['ws', [{ name: 'model', path: 'model', isDirectory: true, children: entries }]]]),
    readTextFile: async (entry: any) => files.find(f => f.path === entry.path)!.content
  }
}

/** The model browser's part: parse and put the package into the registry */
const loaded: string[] = []
const modelBrowser = {
  async loadEcoreFile(content: string, sourceFile: string) {
    loaded.push(sourceFile)
    const nsURI = content.match(/nsURI="([^"]+)"/)![1]!
    const pkg = new BasicEPackage()
    pkg.setName('sensor'); pkg.setNsURI(nsURI)
    EPackageRegistry.INSTANCE.set(nsURI, pkg)
    return { nsURI }
  }
}

describe('Metamodell-Aufloesung des Hosts', () => {
  beforeEach(() => {
    EPackageRegistry.INSTANCE.delete?.(NS)
    loaded.length = 0
  })

  it('findet ein Modell in den .ecore-Dateien des Workspace und laedt es ueber den Model Browser', async () => {
    const resolver = createMetamodelResolver({
      fileSystem: () => fakeWorkspace([{ path: 'model/sensor.ecore', content: ECORE }, { path: 'model/other.ecore', content: ECORE.replace(NS, 'http://test/other') }]),
      workspaceSourceId: () => 'ws',
      modelBrowser: () => modelBrowser,
      editorConfig: () => null
    })
    const result = await resolver.resolve([NS])
    expect(result.resolved).toEqual([NS])
    expect(result.missing).toEqual([])
    expect(result.searched).toEqual(['Workspace Workspace'])
    expect(loaded).toEqual(['model/sensor.ecore'])
    expect(EPackageRegistry.INSTANCE.get(NS)).toBeTruthy()
  })

  it('laesst ein registriertes Modell in Ruhe', async () => {
    const pkg = new BasicEPackage(); pkg.setName('sensor'); pkg.setNsURI(NS)
    EPackageRegistry.INSTANCE.set(NS, pkg)
    const resolver = createMetamodelResolver({
      fileSystem: () => fakeWorkspace([{ path: 'model/sensor.ecore', content: ECORE }]),
      workspaceSourceId: () => 'ws',
      modelBrowser: () => modelBrowser,
      editorConfig: () => null
    })
    const result = await resolver.resolve([NS])
    expect(result.resolved).toEqual([NS])
    expect(loaded).toEqual([])
  })

  it('meldet, was nirgends liegt', async () => {
    const resolver = createMetamodelResolver({
      fileSystem: () => fakeWorkspace([]),
      workspaceSourceId: () => 'ws',
      modelBrowser: () => modelBrowser,
      editorConfig: () => null
    })
    const result = await resolver.resolve(['http://test/nowhere'])
    expect(result.resolved).toEqual([])
    expect(result.missing).toEqual(['http://test/nowhere'])
  })
})
