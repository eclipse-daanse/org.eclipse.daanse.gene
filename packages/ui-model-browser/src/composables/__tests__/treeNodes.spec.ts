import { describe, it, expect } from 'vitest'
import { useModelRegistry } from '../useModelRegistry'
import type { ModelTreeNode } from '../../types'

// Mirrors the reported CWM case: a root package ("cwm") whose classes live in
// subpackages (here "management"), plus one class directly on the root. The
// Models tree must show subpackages as expandable nodes and NOT flatten every
// subpackage class into the parent. Regression guard for the duplication caused
// by b5276a6 (getAllClasses became recursive for the Transformation editor and
// packageToTreeNode inherited that recursion).

const NS = 'http://test.local/cwm-tree'

const CWM_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="cwm" nsURI="${NS}" nsPrefix="cwm">
  <eClassifiers xsi:type="ecore:EClass" name="CwmRoot"/>
  <eSubpackages name="management" nsURI="${NS}/management" nsPrefix="mgmt">
    <eClassifiers xsi:type="ecore:EClass" name="Measurement"/>
    <eClassifiers xsi:type="ecore:EClass" name="ActivityExecution"/>
    <eSubpackages name="warehouseprocess" nsURI="${NS}/wp" nsPrefix="wp">
      <eClassifiers xsi:type="ecore:EClass" name="WarehouseStep"/>
    </eSubpackages>
  </eSubpackages>
</ecore:EPackage>`

const labelsOfType = (node: ModelTreeNode, type: string): string[] =>
  (node.children ?? []).filter((c) => c.type === type).map((c) => c.label).sort()

describe('useModelRegistry.treeNodes', () => {
  it('lists only a package\'s own direct classes, not those of its subpackages', async () => {
    const registry = useModelRegistry()
    await registry.loadEcoreFile(CWM_ECORE, 'model/cwm-tree.ecore')

    const cwm = registry.treeNodes.value.find((n) => n.key === `pkg:${NS}`)
    expect(cwm, 'root package node should be present').toBeTruthy()

    // The root shows exactly its own direct class and its subpackage.
    expect(labelsOfType(cwm!, 'class')).toEqual(['CwmRoot'])
    expect(labelsOfType(cwm!, 'subpackage')).toEqual(['management'])

    // Regression: subpackage classes must NOT be flattened into the root.
    const rootClasses = labelsOfType(cwm!, 'class')
    expect(rootClasses).not.toContain('Measurement')
    expect(rootClasses).not.toContain('ActivityExecution')
    expect(rootClasses).not.toContain('WarehouseStep')
  })

  it('shows each subpackage\'s classes under that subpackage exactly once', async () => {
    const registry = useModelRegistry()
    await registry.loadEcoreFile(CWM_ECORE, 'model/cwm-tree.ecore')

    const cwm = registry.treeNodes.value.find((n) => n.key === `pkg:${NS}`)!
    const management = cwm.children!.find((c) => c.type === 'subpackage' && c.label === 'management')
    expect(management, 'management subpackage node should be present').toBeTruthy()

    // management carries its own two classes plus the nested subpackage — and the
    // nested class stays one level deeper, not duplicated here.
    expect(labelsOfType(management!, 'class')).toEqual(['ActivityExecution', 'Measurement'])
    expect(labelsOfType(management!, 'subpackage')).toEqual(['warehouseprocess'])

    const warehouseprocess = management!.children!.find(
      (c) => c.type === 'subpackage' && c.label === 'warehouseprocess'
    )!
    expect(labelsOfType(warehouseprocess, 'class')).toEqual(['WarehouseStep'])
  })
})
