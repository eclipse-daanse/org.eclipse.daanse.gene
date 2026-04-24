/**
 * Editor Context - Provide/Inject types for custom property editors
 *
 * Custom editors registered via the ComponentRegistry can inject this
 * context to access Gene-specific features like object navigation,
 * OCL evaluation, search, and available objects.
 */

import type { InjectionKey } from 'tsm:vue'
import type { EObject, EClass, EStructuralFeature, EReference, EPackage, Resource } from '@emfts/core'

/**
 * Context provided to custom property editors via Vue's provide/inject.
 *
 * Custom editors can inject this to access Gene capabilities:
 * ```typescript
 * import { inject } from 'vue'
 * import { GENE_EDITOR_CONTEXT_KEY } from 'instance-builder'
 *
 * const ctx = inject(GENE_EDITOR_CONTEXT_KEY)
 * const objects = ctx?.getAvailableObjects(feature)
 * ```
 */
export interface GeneEditorContext {
  /** Get available objects for a non-containment reference */
  getAvailableObjects: (feature: EStructuralFeature) => EObject[]

  /** Get valid concrete child classes for a containment reference */
  getValidChildClasses: (feature: EStructuralFeature) => EClass[]

  /** Get OCL referenceFilter expression for a feature */
  getOclFilter: (feature: EStructuralFeature) => string | undefined

  /** Problems service for OCL evaluation */
  problemsService: {
    evaluateDerived: (obj: EObject, featureName: string) => Promise<unknown>
    hasDerivedExpression: (eClass: any, featureName: string) => Promise<boolean>
    query: (obj: EObject, expression: string) => Promise<unknown>
  } | null

  /** Navigate to an object (select it in the instance tree) */
  handleNavigate: (obj: EObject) => void

  /** Open search dialog for a reference */
  handleSearch: (feature: EReference, callback: (obj: EObject) => void) => void

  /** Current editing mode */
  mode: 'instance' | 'metamodel'

  /** Root package (for metamodel mode) */
  rootPackage: EPackage | null
}

/**
 * InjectionKey for the Gene editor context.
 * Used with Vue's provide/inject mechanism.
 */
export const GENE_EDITOR_CONTEXT_KEY: InjectionKey<GeneEditorContext> = Symbol('gene-editor-context')
