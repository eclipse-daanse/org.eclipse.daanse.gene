/**
 * CWM Editor Plugin
 *
 * A view on CWM models: the context view - one row per object below the
 * context object, with diagram area, fields, text, columns table and
 * references. The tab shares the instance editor's document, menu and save
 * path; only the middle is its own.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { CwmEditorTab, CwmContextView } from './components'
import { diagramRegistry } from './composables/diagrams'

export { CwmEditorTab, CwmContextView, ContextObjectRow, ColumnsTable, ReferencesTable, DiagramArea } from './components'
export { sectionFor, tableView, isDescription, isTable, slug, objectSlug, type DocSection as DocSectionModel, type TableView } from './composables/documentation'
export { diagramRegistry } from './composables/diagrams'

export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating CWM Editor plugin...')
  context.services.register('ui.cwm-editor.components', { CwmEditorTab, CwmContextView })
  // Which EClasses get a diagram area (PH-10); plugins add or remove classes
  context.services.register('ui.cwm-editor.diagrams', diagramRegistry)
  context.log.info('CWM Editor plugin activated')
}

export async function deactivate(context: ModuleContext): Promise<void> {
  context.services.unregister('ui.cwm-editor.components')
  context.services.unregister('ui.cwm-editor.diagrams')
  context.log.info('CWM Editor plugin deactivated')
}
