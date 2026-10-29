/**
 * PDF Viewer Plugin
 *
 * A PDF file of the workspace in a tab, shown by the browser's own PDF viewer
 * (pages, zoom, search, print). Reached by a click on the file or through
 * "Open with".
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { PdfViewerTab } from './components'
import { setTabDocument, tabDocument, closeTabDocument, openTabIds } from './composables/tabDocuments'

export { PdfViewerTab } from './components'
export { setTabDocument, tabDocument, closeTabDocument, openTabIds, type PdfDocument } from './composables/tabDocuments'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.services.register('ui.pdf-viewer.components', { PdfViewerTab })
  context.services.register('ui.pdf-viewer.composables', { setTabDocument, tabDocument, closeTabDocument, openTabIds })
  context.log.info('PDF Viewer plugin activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.services.unregister('ui.pdf-viewer.components')
  context.services.unregister('ui.pdf-viewer.composables')
  context.log.info('PDF Viewer plugin deactivated')
}
