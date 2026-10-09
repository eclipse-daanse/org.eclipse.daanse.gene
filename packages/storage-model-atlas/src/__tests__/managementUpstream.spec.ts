/**
 * The Atlas management model, taken 1:1 from eclipse-fennec/model.atlas.
 *
 * gene used to keep adapted copies; the answers of the server drifted away
 * from them (diagnostics unknown, nsUri as a Java serialization blob). The
 * fixtures are real answers of model.modelatlas.cloud, shortened.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseMetadataListXmi } from '../AtlasResourceSet'
import { schemaNsUri } from '../schemaIdentity'
import { ManagementPackage } from '../generated/management'

const here = path.dirname(new URL(import.meta.url).pathname)
const fixture = (name: string) => readFileSync(path.join(here, 'fixtures', name), 'utf-8')

/** Reads XMI and collects what the loader complains about */
function quietly<T>(read: () => T): { result: T; complaints: string[] } {
  const complaints: string[] = []
  const error = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { complaints.push(a.map(String).join(' ')) })
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { complaints.push(a.map(String).join(' ')) })
  try {
    return { result: read(), complaints }
  } finally {
    error.mockRestore()
    warn.mockRestore()
  }
}

/** The form older servers sent: java.io.ObjectOutputStream of a String, as hex */
function javaSerialized(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const head = [0xac, 0xed, 0x00, 0x05, 0x74, bytes.length >> 8, bytes.length & 0xff]
  return [...head, ...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

describe('Atlas management model 1:1', () => {
  it('reads a real object listing with diagnostics without complaints', () => {
    const { result: list, complaints } = quietly(() => parseMetadataListXmi(fixture('transformations-release.xml')))

    expect(complaints).toEqual([])
    expect(list).toHaveLength(2)
    for (const meta of list) {
      expect(meta.registry).toBe('transformations')
      expect(meta.diagnostics.length).toBeGreaterThan(0)
      // Instant in the model, text in the browser
      expect(typeof meta.uploadTime).toBe('string')
    }
    const finding = list[0]!.diagnostics[0]!
    expect(finding.producer).toBeTruthy()
    expect(finding.code).toBeTruthy()
  })

  it('takes the nsUri of a schema as plain text', () => {
    const { result: list, complaints } = quietly(() => parseMetadataListXmi(fixture('atlas-schemas-released.xml')))
    expect(complaints).toEqual([])
    expect(list.map((m) => schemaNsUri(m, m.objectId)).sort()).toEqual([
      'http://www.eclipse.org/fennec/m2x/compiled/1.0',
      'http://www.eclipse.org/fennec/m2x/qvtd/qvttemplate/1.0',
    ])
  })

  it('still decodes a serialized nsUri from servers before model.atlas#354', () => {
    const plain = 'http://www.eclipse.org/fennec/m2x/compiled/1.0'
    const xml = fixture('atlas-schemas-released.xml').replace(`value="${plain}"`, `value="${javaSerialized(plain)}"`)
    expect(xml).toContain('ACED0005')
    const list = parseMetadataListXmi(xml)
    expect(list.map((m) => schemaNsUri(m, m.objectId))).toContain(plain)
  })

  it('the generated package matches the model file', () => {
    // A synced model without a fresh `npm run generate:management` shows here.
    // The generated package lists its classes; enums and data types are not among them.
    const model = readFileSync(path.join(here, '..', 'model', 'management.ecore'), 'utf-8')
    const inModel = [...model.matchAll(/<eClassifiers xsi:type="ecore:EClass"\s[^>]*?\bname="([^"]+)"/g)].map((m) => m[1]).sort()
    const generated = [...ManagementPackage.eINSTANCE.getEClassifiers()].map((c) => c.getName()).sort()
    expect(generated).toEqual(inModel)
  })
})
