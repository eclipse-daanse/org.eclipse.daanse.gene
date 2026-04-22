/**
 * Data Generator Plugin
 *
 * Automatic test data generation for EMF metamodels using FakerJS.
 * Provides a visual editor for configuring data generation rules
 * and produces XMI output compatible with the Gene Model Editor.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { EPackageRegistry } from '@emfts/core'
import { markRaw } from 'tsm:vue'
import { DatagenPackage } from './generated/datagen'

// Re-export types
export * from './types'

// Re-export composables
export { useRemoteDataGen, setSharedAtlasBrowser } from './composables/useRemoteDataGen'
export { useDataGenAtlas } from './composables/useDataGenAtlas'

// Re-export components
export { DataGenPerspective } from './components'

// Import for service registration
import { DataGenPerspective } from './components'
import { setSharedAtlasBrowser } from './composables/useRemoteDataGen'
import { setDataGenTsm } from './composables/useDataGenAtlas'

// Type imports
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Data Generator plugin...')

  // Set TSM for lazy service resolution in useDataGenAtlas
  setDataGenTsm(context.services)

  // Register DatagenPackage so XMI parser can resolve datagen:DataGenResult
  const pkg = DatagenPackage.eINSTANCE
  const nsURI = pkg.getNsURI()
  if (nsURI) {
    EPackageRegistry.INSTANCE.set(nsURI, pkg)
    context.log.info(`Registered DatagenPackage: ${nsURI}`)
  }

  // Register components as service
  context.services.register('ui.data-generator.components', {
    DataGenPerspective
  })

  // Register data-generator perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.register({
      id: 'data-generator',
      name: 'Data Generator',
      icon: 'pi pi-bolt',
      requiresWorkspace: true,
      order: 60,
      defaultLayout: {
        left: [],
        center: ['data-generator'],
        right: [],
        bottom: []
      },
      defaultVisibility: { left: false, right: false, bottom: false }
    })
    context.log.info('Data Generator perspective registered')
  }

  // Register data-generator panel
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'data-generator',
      title: 'Data Generator',
      icon: 'pi pi-bolt',
      component: markRaw(DataGenPerspective),
      perspectives: ['data-generator'],
      defaultLocation: 'center',
      defaultOrder: 0,
      closable: false
    })
    context.log.info('Data Generator panel registered')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'data-generator',
      icon: 'pi pi-bolt',
      label: 'Data Gen',
      tooltip: 'Data Generator - Generate test data from metamodels',
      panelId: 'data-generator',
      perspectiveId: 'data-generator',
      order: 60,
      perspectives: ['data-generator']
    })
    context.log.info('Data Generator activity registered')
  }

  // Auto-register Atlas Browser for remote data generation
  try {
    const composables = context.services.get<any>('ui.atlas-browser.composables')
    if (composables?.useSharedAtlasBrowser) {
      const browser = composables.useSharedAtlasBrowser()
      setSharedAtlasBrowser(browser)
      context.log.info('Atlas Browser connected for remote data generation')
    }
  } catch {
    // Atlas browser not available — remote generation disabled
  }

  context.log.info('Data Generator plugin activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Data Generator plugin...')

  // Unregister perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.unregister('data-generator')
  }

  context.services.unregister('ui.data-generator.components')
  context.log.info('Data Generator plugin deactivated')
}
