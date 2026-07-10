import { describe, it, expect } from 'vitest'
import { repairLegacyEcoreHrefs, needsLegacyHrefRepair } from '../repairEcore'

// Mirrors the waterpark legacy corruption: cadastre class extends base/Thing via
// an ABSOLUTE nsURI href, plus a cross-subpackage eType/eOpposite with the
// `ecore:EClass` type prefix, plus a legitimate external Ecore datatype ref.
const LEGACY = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="waterpark" nsURI="http://spec.daanse.org/model/waterpark" nsPrefix="waterpark">
  <eSubpackages name="base" nsURI="http://spec.daanse.org/model/waterpark/base" nsPrefix="base">
    <eClassifiers xsi:type="ecore:EClass" name="Thing" abstract="true"/>
  </eSubpackages>
  <eSubpackages name="cadastre" nsURI="http://spec.daanse.org/model/waterpark/cadastre" nsPrefix="cadastre">
    <eClassifiers xsi:type="ecore:EClass" name="CadastrialBoundary">
      <eSuperTypes href="http://spec.daanse.org/model/waterpark/base#//Thing"/>
      <eStructuralFeatures xsi:type="ecore:EAttribute" name="num" eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt"/>
      <eStructuralFeatures xsi:type="ecore:EReference" name="districts" eType="ecore:EClass http://spec.daanse.org/model/waterpark/cadastre#//CadastrialDistrict" eOpposite="http://spec.daanse.org/model/waterpark/cadastre#//CadastrialDistrict/boundary"/>
    </eClassifiers>
    <eClassifiers xsi:type="ecore:EClass" name="CadastrialDistrict"/>
  </eSubpackages>
</ecore:EPackage>`

describe('repairLegacyEcoreHrefs', () => {
  it('rewrites absolute self-nsURI hrefs to intra-document #// fragments', () => {
    const out = repairLegacyEcoreHrefs(LEGACY)

    expect(out).toContain('<eSuperTypes href="#//base/Thing"/>')
    expect(out).toContain('eType="#//cadastre/CadastrialDistrict"')
    expect(out).toContain('eOpposite="#//cadastre/CadastrialDistrict/boundary"')
    expect(out).not.toMatch(/href="http:\/\/spec\.daanse\.org/)
    expect(out).not.toMatch(/eType="ecore:EClass http:\/\/spec\.daanse\.org/)
  })

  it('leaves package nsURI declarations and external Ecore datatype refs intact', () => {
    const out = repairLegacyEcoreHrefs(LEGACY)

    expect(out).toContain('nsURI="http://spec.daanse.org/model/waterpark"')
    expect(out).toContain('nsURI="http://spec.daanse.org/model/waterpark/base"')
    expect(out).toContain('eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt"')
  })

  it('is a no-op for an already-clean model', () => {
    const clean = repairLegacyEcoreHrefs(LEGACY)
    expect(repairLegacyEcoreHrefs(clean)).toBe(clean)
  })

  it('needsLegacyHrefRepair detects broken vs clean content', () => {
    expect(needsLegacyHrefRepair(LEGACY)).toBe(true)
    expect(needsLegacyHrefRepair(repairLegacyEcoreHrefs(LEGACY))).toBe(false)
  })
})