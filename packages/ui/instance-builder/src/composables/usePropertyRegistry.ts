/**
 * Property Registry - Singleton ComponentRegistry wrapper for Gene
 *
 * Provides a shared ComponentRegistry instance that plugins can use
 * to register custom property editors. The registry is checked first
 * in PropertyField.vue; if no custom editor matches, the built-in
 * v-if chain handles rendering.
 *
 * The emfts-vue-registry import is lazy to ensure that any resolution
 * failure does not break existing instance-builder functionality.
 */

import type { Component } from 'tsm:vue'
import type { EObject, EStructuralFeature, EClass, EReference } from '@emfts/core'

// Lazy-loaded registry instance
let registryInstance: any = null
let registryLoadFailed = false

/**
 * Get the singleton ComponentRegistry instance.
 * Creates it on first access. Returns null if emfts-vue-registry is unavailable.
 */
export function getPropertyRegistry(): any {
  if (registryLoadFailed) return null
  if (!registryInstance) {
    try {
      // Dynamic require via TSM runtime (emfts-vue-registry is registered as shared lib)
      const mod = (window as any).__tsm__?.require?.('@emfts/vue-registry')
      if (mod?.ComponentRegistry) {
        registryInstance = new mod.ComponentRegistry()
      } else {
        console.warn('[usePropertyRegistry] emfts-vue-registry not available via TSM runtime')
        registryLoadFailed = true
      }
    } catch (e) {
      console.warn('[usePropertyRegistry] Failed to load emfts-vue-registry:', e)
      registryLoadFailed = true
    }
  }
  return registryInstance
}

/**
 * Composable for working with the property registry.
 * Returns the registry and convenience methods.
 * All lookups are safe - they return undefined if the registry is unavailable.
 */
export function usePropertyRegistry() {
  return {
    get registry() {
      return getPropertyRegistry()
    },

    /**
     * Register an editor for all instances of an EClass.
     */
    registerForEClass(eClass: EClass, component: Component, options?: any) {
      return getPropertyRegistry()?.registerForEClass(eClass, component, options)
    },

    /**
     * Register an editor for a specific structural feature of an EClass.
     */
    registerForFeature(eClass: EClass, featureName: string, component: Component, options?: any) {
      return getPropertyRegistry()?.registerForFeature(eClass, featureName, component, options)
    },

    /**
     * Register an editor for attributes of a specific data type.
     */
    registerForDataType(dataTypeName: string, component: Component, options?: any) {
      return getPropertyRegistry()?.registerForDataType(dataTypeName, component, options)
    },

    /**
     * Register an editor for enum attributes.
     */
    registerForEnum(component: Component, enumName?: string, options?: any) {
      return getPropertyRegistry()?.registerForEnum(component, enumName, options)
    },

    /**
     * Register an editor for references.
     */
    registerForReference(component: Component, options?: any) {
      return getPropertyRegistry()?.registerForReference(component, options)
    },

    /**
     * Get the custom editor for a feature, or undefined for built-in fallback.
     */
    getCustomEditor(feature: EStructuralFeature, eObject?: EObject): Component | undefined {
      try {
        return getPropertyRegistry()?.getComponentForFeature(feature, eObject) as Component | undefined
      } catch (e) {
        console.warn('[usePropertyRegistry] Error in getCustomEditor:', e)
        return undefined
      }
    },

    /**
     * Get a custom class-level editor, or undefined for built-in fallback.
     */
    getCustomClassEditor(eClass: EClass, eObject?: EObject): Component | undefined {
      try {
        return getPropertyRegistry()?.getComponentForEClass(eClass, eObject) as Component | undefined
      } catch (e) {
        console.warn('[usePropertyRegistry] Error in getCustomClassEditor:', e)
        return undefined
      }
    }
  }
}
