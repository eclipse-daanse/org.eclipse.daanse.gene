/**
 * CWM Icons Plugin
 *
 * Provides the 143 Common Warehouse Metamodel (CWM 1.1) class icons for GenE.
 * The icons are hand-drawn SVGs bundled with the plugin; the border colour of
 * each icon encodes its source package and each file handles dark mode itself.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { CwmIconsProvider } from './CwmIconsProvider'

let provider: CwmIconsProvider | null = null

/**
 * TSM lifecycle: activate
 * Registers the CWM icon provider.
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating CWM icon plugin...')

  const registry = context.services.get<any>('gene.icons.registry')
  if (!registry) {
    context.log.warn('Icon provider registry not available')
    return
  }

  provider = new CwmIconsProvider()

  // Inject background-image rules before registering so the picker can render.
  await provider.loadStyles()

  registry.register(provider)
  context.log.info('CWM icon provider registered')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters the provider.
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating CWM icon plugin...')

  const registry = context.services.get<any>('gene.icons.registry')
  if (registry && provider) {
    registry.unregister(provider.id)
    context.log.info('CWM icon provider unregistered')
  }

  provider = null
}

// Re-export for direct usage
export { CwmIconsProvider } from './CwmIconsProvider'
