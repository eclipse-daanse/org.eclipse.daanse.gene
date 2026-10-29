/**
 * Markdown Viewer Plugin
 *
 * A Markdown file of the workspace, rendered, in a tab. Reached by a click on
 * the file or through "Open with".
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { MdViewerTab } from './components'
import { setTabDocument, tabDocument, closeTabDocument, openTabIds } from './composables/tabDocuments'

export { MdViewerTab } from './components'
export { setTabDocument, tabDocument, closeTabDocument, openTabIds, type MdDocument } from './composables/tabDocuments'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.services.register('ui.md-viewer.components', { MdViewerTab })
  context.services.register('ui.md-viewer.composables', { setTabDocument, tabDocument, closeTabDocument, openTabIds })
  context.log.info('Markdown Viewer plugin activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.services.unregister('ui.md-viewer.components')
  context.services.unregister('ui.md-viewer.composables')
  context.log.info('Markdown Viewer plugin deactivated')
}
