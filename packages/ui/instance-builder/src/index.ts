/**
 * Instance Builder Module
 *
 * Provides an EMF instance editor for creating and editing model instances.
 * Opens as tabs in the editor area.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import type { EObject, EClass } from '@emfts/core'
import type { Component } from 'tsm:vue'

// Re-export types
export * from './types'

// Re-export composables
export { useInstanceEditor } from './composables/useInstanceEditor'
export { usePropertyRegistry, getPropertyRegistry } from './composables/usePropertyRegistry'
export { GENE_EDITOR_CONTEXT_KEY } from './composables/editorContext'
export type { GeneEditorContext } from './composables/editorContext'

// Re-export components
export {
  InstanceEditor,
  PropertyField,
  AttributeField,
  ReferenceField,
  EnumField,
  DerivedField,
  CoclDerivedField,
  OperationField,
  OperationParameterDialog,
  ClassSelector
} from './components'

// Import for service registration
import * as components from './components'
import { useInstanceEditor } from './composables/useInstanceEditor'
import { getPropertyRegistry } from './composables/usePropertyRegistry'

/**
 * TSM lifecycle: activate
 * Registers instance editor components and services
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Instance Builder module...')

  // Get layout service to register editor opener
  const layoutState = context.services.get<{ useLayoutState: () => any }>('ui.layout.state')

  // Create instance editor service
  const editorService = {
    openEditor(eObject: EObject) {
      const layout = layoutState?.useLayoutState()
      if (!layout) {
        context.log.warn('Layout service not available')
        return
      }

      const eClass = eObject.eClass()
      const name = (eObject as any).name || (eObject as any).getName?.() || 'Instance'

      layout.openEditor({
        id: `instance-${eClass.getName()}-${Date.now()}`,
        title: `${eClass.getName()}: ${name}`,
        icon: 'pi pi-box',
        component: components.InstanceEditor,
        props: { eObject, isNew: false }
      })
    },

    openNewEditor(eClass: EClass) {
      const layout = layoutState?.useLayoutState()
      if (!layout) {
        context.log.warn('Layout service not available')
        return
      }

      layout.openEditor({
        id: `new-instance-${eClass.getName()}-${Date.now()}`,
        title: `New ${eClass.getName()}`,
        icon: 'pi pi-plus',
        component: components.InstanceEditor,
        props: { eClass, isNew: true }
      })
    },

    getConcreteClasses(): EClass[] {
      // This would be populated from registered packages
      return []
    }
  }

  // Register components as service
  context.services.register('ui.instance.components', components)

  // Register editor service
  context.services.register('ui.instance.editor', editorService)

  // Register component registry as a service for plugin access (may be null if emfts-vue-registry unavailable)
  const registry = getPropertyRegistry()
  if (registry) {
    context.services.register('ui.component.registry', { registry })
  }

  context.log.info('Instance Builder module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Instance Builder module...')

  context.services.unregister('ui.instance.components')
  context.services.unregister('ui.instance.editor')
  try { context.services.unregister('ui.component.registry') } catch { /* may not have been registered */ }

  context.log.info('Instance Builder module deactivated')
}
