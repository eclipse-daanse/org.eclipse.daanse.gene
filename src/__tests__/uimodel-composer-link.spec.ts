/**
 * Smoke test for the npm-linked @emfts/uimodel-composer package (Phase 0).
 *
 * Verifies that the linked package resolves, exposes the UIModel metamodel
 * under the expected nsURI, and — crucially — shares the app's @emfts/core
 * instance (singleton trap: a second core copy from the composer's own
 * node_modules would break EPackageRegistry / eClass identity).
 * See docs/concepts/uimodel-composer-linking.md.
 */
import { describe, it, expect } from 'vitest'
import { EPackageRegistry, BasicEPackage } from '@emfts/core'
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer'

describe('@emfts/uimodel-composer link (Phase 0)', () => {
  it('exposes the UIModel package under nsURI http://uimodel/1.0', () => {
    expect(UimodelPackage.eINSTANCE.getNsURI()).toBe('http://uimodel/1.0')
  })

  it('creates a FormView whose eClass is named FormView', () => {
    const formView = UimodelFactory.eINSTANCE.createFormView()
    expect(formView.eClass().getName()).toBe('FormView')
    // The eClass must be the identical object from the package (no name matching)
    const fromPackage = UimodelPackage.eINSTANCE.getEClassifier('FormView')
    expect(formView.eClass()).toBe(fromPackage)
  })

  it('wires UimodelFactory to the package (bidirectional reference)', () => {
    const factory = UimodelFactory.eINSTANCE
    expect(factory.getEPackage()).toBe(UimodelPackage.eINSTANCE)
  })

  it('shares the app @emfts/core instance (dedupe, no second core copy)', () => {
    // instanceof only holds if the composer's generated package was built
    // against the same @emfts/core module instance as the app
    expect(UimodelPackage.eINSTANCE).toBeInstanceOf(BasicEPackage)

    // Round-trip through the canonical registry (same object identity)
    const pkg = UimodelPackage.eINSTANCE
    EPackageRegistry.INSTANCE.set(pkg.getNsURI(), pkg)
    expect(EPackageRegistry.INSTANCE.getEPackage('http://uimodel/1.0')).toBe(pkg)
  })
})
