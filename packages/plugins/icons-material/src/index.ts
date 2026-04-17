/**
 * Material Symbols Icon Plugin
 *
 * Provides Material Symbols icons for GenE applications.
 * Icons are loaded dynamically from Google Fonts.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { MaterialSymbolsProvider } from './MaterialSymbolsProvider'

let provider: MaterialSymbolsProvider | null = null

/**
 * TSM lifecycle: activate
 * Registers the Material Symbols icon provider
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Material Symbols icon plugin...')

  // Get the icon provider registry from TSM DI
  const registry = context.services.get<any>('gene.icons.registry')
  if (!registry) {
    context.log.warn('Icon provider registry not available')
    return
  }

  // Create and register provider
  provider = new MaterialSymbolsProvider()

  // Load styles before registering
  await provider.loadStyles()

  registry.register(provider)
  context.log.info('Material Symbols icon provider registered')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters the provider
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Material Symbols icon plugin...')

  const registry = context.services.get<any>('gene.icons.registry')
  if (registry && provider) {
    registry.unregister(provider.id)
    context.log.info('Material Symbols icon provider unregistered')
  }

  provider = null
}

// Re-export for direct usage
export { MaterialSymbolsProvider } from './MaterialSymbolsProvider'
export { MATERIAL_ICONS, getMaterialCategories } from './icons'
