/**
 * CWM Editor Plugin
 *
 * A view on CWM models: the context view - one row per object below the
 * context object, with diagram area, fields, text, columns table,
 * references, validation badge and actions menu. The tab shares the instance editor's document and save
 * path; the middle and the toolbar (menu "cwm-editor") are its own.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { CwmEditorTab, CwmContextView } from './components'
import { diagramRegistry } from './composables/diagrams'
import { actionRegistry } from './composables/actions'
import {
  addFieldDefaultsFromXmi,
  registerFieldDefaultsPackage,
  reloadWorkspaceFieldDefaults,
  setFieldDefaultsFileSystem
} from './composables/fieldDefaults'
import { setDocumentFileSystem } from './composables/documentFiles'
import { cwmMenu } from './composables/toolbar'

export { CwmEditorTab, CwmContextView, ContextObjectRow, ColumnsTable, ReferencesTable, DiagramArea, FieldRulesDialog } from './components'
export { sectionFor, tableView, isDescription, isTable, slug, objectSlug, type DocSection as DocSectionModel, type TableView } from './composables/documentation'
export { diagramRegistry } from './composables/diagrams'
export { actionRegistry, type CwmAction, type ActionApi } from './composables/actions'
export { addFieldDefaultsFromXmi, reloadWorkspaceFieldDefaults, fieldRule, FIELD_DEFAULTS_NS_URI } from './composables/fieldDefaults'

/** The app dispatches this event on window once the workspace's models and instances are loaded */
const WORKSPACE_LOADED = 'gene:workspace-loaded'
const onWorkspaceLoaded = () => { void reloadWorkspaceFieldDefaults() }

export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating CWM Editor plugin...')
  context.services.register('ui.cwm-editor.components', { CwmEditorTab, CwmContextView })
  // Which EClasses get a diagram area (PH-10); plugins add or remove classes
  context.services.register('ui.cwm-editor.diagrams', diagramRegistry)
  // Actions menu per EClass (PH-4); plugins add their own
  context.services.register('ui.cwm-editor.actions', actionRegistry)

  // Field defaults (CR-2): own metamodel, rules from *.fielddefaults.xmi of the workspace
  await registerFieldDefaultsPackage()
  setFieldDefaultsFileSystem(context.services.get('gene.filesystem') ?? null)
  setDocumentFileSystem(context.services.get('gene.filesystem') ?? null)
  window.addEventListener(WORKSPACE_LOADED, onWorkspaceLoaded)
  void reloadWorkspaceFieldDefaults()
  context.services.register('ui.cwm-editor.fielddefaults', { addFieldDefaultsFromXmi, reloadWorkspaceFieldDefaults })

  // Own toolbar: the CWM view replaces the menu "cwm-editor", not the instance editor's
  const eventBus = context.services.get<any>('gene.eventbus')
  context.services.get<any>('gene.menu.registry')?.registerMenu('cwm-editor', cwmMenu(
    () => context.services.get<any>('gene.editor.front')?.frontTabId?.(),
    (event, payload) => eventBus?.emit(event, payload)
  ))
  context.log.info('CWM Editor plugin activated')
}

export async function deactivate(context: ModuleContext): Promise<void> {
  context.services.unregister('ui.cwm-editor.components')
  context.services.unregister('ui.cwm-editor.diagrams')
  context.services.unregister('ui.cwm-editor.actions')
  window.removeEventListener(WORKSPACE_LOADED, onWorkspaceLoaded)
  context.services.unregister('ui.cwm-editor.fielddefaults')
  context.services.get<any>('gene.menu.registry')?.unregisterMenu?.('cwm-editor')
  context.log.info('CWM Editor plugin deactivated')
}
