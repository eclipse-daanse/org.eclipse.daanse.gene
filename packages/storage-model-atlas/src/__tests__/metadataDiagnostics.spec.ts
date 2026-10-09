/**
 * Object metadata with diagnostics.
 *
 * The Atlas server attaches findings to an object's metadata (a compile result,
 * a refused transition), as a tree of `diagnostics` with `children`. Until the
 * management model knew them, every listing that carried one was read with an
 * "Unknown feature 'diagnostics'" per object and a "Feature 'children' has no
 * parent object" per child - the shape below is taken from a real listing.
 */
import { describe, it, expect, vi } from 'vitest'
import { parseMetadataListXmi } from '../AtlasResourceSet'
import { DiagnosticSeverity, DiagnosticStatus } from '../generated/management'

const LISTING = `<?xml version="1.0" encoding="UTF-8"?>
<mgmt:ObjectMetadataContainer xmlns:mgmt="http://eclipse.org/fennec/model/atlas/management/1.0.0">
  <metadata objectId="KarteninhaberToHistorie" objectName="KarteninhaberToHistorie" stage="release"
      scope="dimcity" registry="transformations"
      objectType="http://www.eclipse.org/fennec/m2x/compiled/1.0#//SourceUnit">
    <diagnostics id="d1" producer="QvtCompile" code="qvto.compiles" severity="WARNING"
        message="Compiled with warnings" category="compile" createdTime="2026-10-08T11:48:54.823140769Z">
      <children id="d1.a" producer="QvtCompile" code="unused-variable" severity="INFO"
          message="Variable x is never read" target="line:12:col:4" createdTime="2026-10-08T11:48:54Z"/>
      <children id="d1.b" producer="QvtCompile" code="deprecated-op" severity="WARNING" status="ACKNOWLEDGED"
          message="Operation is deprecated" createdTime="2026-10-08T11:48:54Z"/>
    </diagnostics>
  </metadata>
  <metadata objectId="Plain" objectName="Plain" stage="release" scope="dimcity" registry="transformations"/>
</mgmt:ObjectMetadataContainer>`

describe('metadata with diagnostics', () => {
  it('reads the diagnostic tree without parser errors', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const list = parseMetadataListXmi(LISTING)
    const messages = errors.mock.calls.map((c) => String(c[0]))
    errors.mockRestore()

    expect(messages.filter((m) => /diagnostics|children/.test(m))).toEqual([])
    expect(list).toHaveLength(2)

    const first = list[0]!
    expect(first.diagnostics).toHaveLength(1)
    const root = first.diagnostics[0]!
    expect(root.code).toBe('qvto.compiles')
    expect(root.severity).toBe(DiagnosticSeverity.WARNING)
    expect(root.status).toBe(DiagnosticStatus.OPEN)
    expect(root.children.map((c) => c.id)).toEqual(['d1.a', 'd1.b'])
    expect(root.children[1]!.status).toBe(DiagnosticStatus.ACKNOWLEDGED)
    expect(root.children[0]!.target).toBe('line:12:col:4')
  })

  it('an object without findings has none', () => {
    const list = parseMetadataListXmi(LISTING)
    expect(list[1]!.diagnostics).toHaveLength(0)
  })
})
