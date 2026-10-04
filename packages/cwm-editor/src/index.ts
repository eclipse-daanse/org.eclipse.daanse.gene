/**
 * CWM Editor Plugin
 *
 * A view on CWM models. First part: the documentation - descriptions and
 * tables, read and edited next to the instance tree. The tab shares the
 * instance editor's document, menu and save path; only the middle is its own.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { CwmEditorTab, CwmDocumentation, DocSection } from './components'

export { CwmEditorTab, CwmDocumentation, DocSection } from './components'
export { sectionFor, tableView, isDescription, isTable, type DocSection as DocSectionModel, type TableView } from './composables/documentation'

export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating CWM Editor plugin...')
  context.services.register('ui.cwm-editor.components', { CwmEditorTab, CwmDocumentation, DocSection })
  context.log.info('CWM Editor plugin activated')
}

export async function deactivate(context: ModuleContext): Promise<void> {
  context.services.unregister('ui.cwm-editor.components')
  context.log.info('CWM Editor plugin deactivated')
}
