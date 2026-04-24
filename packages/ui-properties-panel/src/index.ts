/**
 * Properties Panel Module
 *
 * Provides a properties panel for editing selected EMF instances.
 * Integrates with the instance-tree for selection and uses
 * instance-builder components for property editing.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import type { PanelRegistry } from 'ui-perspectives'

// Re-export components
export { PropertiesPanel } from './components'

// Import for service registration
import * as components from './components'

/**
 * TSM lifecycle: activate
 * Registers properties panel components
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Properties Panel module...')

  // Register components as service (legacy)
  context.services.register('ui.properties-panel.components', components)

  // Register with panel registry
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'properties',
      title: 'Properties',
      icon: 'pi pi-sliders-h',
      component: markRaw(components.PropertiesPanel),
      perspectives: ['model-editor', 'metamodeler'],
      defaultLocation: 'center',
      defaultOrder: 0,
      closable: false
    })
    context.log.info('Properties Panel registered')
  }

  context.log.info('Properties Panel module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Properties Panel module...')

  context.services.unregister('ui.properties-panel.components')

  context.log.info('Properties Panel module deactivated')
}
