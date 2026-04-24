/**
 * XMI Viewer Module
 *
 * Provides file viewer for XMI, Ecore, and XML files with syntax highlighting.
 * Registers as a file extension handler via the extension registry.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { XmiViewer } from './components'
import { useFileViewerRegistry, FILE_VIEWER_EXTENSION_POINT, XMI_EXTENSIONS } from './composables'
import type { FileViewerContribution } from './types'

// Re-export types
export * from './types'
export * from './themes'

// Re-export composables
export { useXmlHighlighter, useFileViewerRegistry, FILE_VIEWER_EXTENSION_POINT, XMI_EXTENSIONS } from './composables'

// Re-export components
export { XmiViewer } from './components'

/**
 * XMI file viewer contribution
 */
const xmiViewerContribution: FileViewerContribution = {
  id: 'gene.viewer.xmi',
  name: 'XMI Viewer',
  extensions: XMI_EXTENSIONS,
  priority: 10,
  component: XmiViewer,
  canHandle: (content: string, extension: string) => {
    // Don't handle workspace files - let workspace viewer handle those
    if (content.includes('<EditorConfig') || content.includes(':EditorConfig')) {
      return false
    }
    if (content.includes('fennec/ts/generic/ui') || content.includes('fennecui')) {
      return false
    }
    // Handle any valid XML
    return content.trim().startsWith('<?xml') || content.trim().startsWith('<')
  }
}

/**
 * Register the XMI viewer with the file viewer registry
 */
export function registerXmiViewer(): void {
  const registry = useFileViewerRegistry()
  registry.registerViewer(xmiViewerContribution)
}

/**
 * Unregister the XMI viewer
 */
export function unregisterXmiViewer(): void {
  const registry = useFileViewerRegistry()
  registry.unregisterViewer(xmiViewerContribution.id)
}

/**
 * TSM lifecycle: activate
 * Registers XMI viewer as file extension handler
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating XMI Viewer module...')

  // Register viewer
  registerXmiViewer()

  // Register components as service
  context.services.register('ui.xmi-viewer.component', XmiViewer)
  context.services.register('ui.xmi-viewer.registry', useFileViewerRegistry)

  context.log.info('XMI Viewer module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating XMI Viewer module...')

  unregisterXmiViewer()

  context.services.unregister('ui.xmi-viewer.component')
  context.services.unregister('ui.xmi-viewer.registry')

  context.log.info('XMI Viewer module deactivated')
}
