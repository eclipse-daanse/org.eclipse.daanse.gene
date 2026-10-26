import { describe, it, expect } from 'vitest'
import { EPackageRegistry } from '@emfts/core'
import { useModelRegistry } from '../useModelRegistry'
import type { ModelPackageInfo } from '../../types'

const UNI_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="university" nsURI="http://example.org/university" nsPrefix="uni">
  <eClassifiers xsi:type="ecore:EClass" name="Student"/>
</ecore:EPackage>`

describe('useModelRegistry.unloadUserModels', () => {
  it('entlädt die Modelle eines Workspace - aus Registry, EPackageRegistry und ResourceSet', async () => {
    const registry = useModelRegistry()
    const info = await registry.loadEcoreFile(UNI_ECORE, 'uni/university.ecore')
    const resource = info!.ePackage.eResource()
    const rs = registry.getEcoreResourceSet() as any
    expect(rs.getResources().contains(resource)).toBe(true)

    const removed = registry.unloadUserModels()

    expect(removed).toBeGreaterThan(0)
    expect(registry.getPackage('http://example.org/university')).toBeFalsy()
    expect(registry.userPackages.value).toHaveLength(0)
    expect(EPackageRegistry.INSTANCE.get('http://example.org/university')).toBeFalsy()
    expect(rs.getResources().contains(resource)).toBe(false)
  })

  it('lässt die eingebauten Modelle stehen', async () => {
    const registry = useModelRegistry()
    await registry.initialize?.()
    const builtIn = registry.allPackages.value.filter((p: ModelPackageInfo) => p.isBuiltIn).length

    registry.unloadUserModels()

    expect(registry.allPackages.value.filter((p: ModelPackageInfo) => p.isBuiltIn)).toHaveLength(builtIn)
  })
})
