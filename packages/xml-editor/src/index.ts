/**
 * XML Editor Plugin
 *
 * The text of an XMI, Ecore or XML file, editable by hand, with highlighting
 * and line numbers. Reached through "Open with" - the structured views stay
 * the default for these files.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { XmlEditor, XmlEditorTab } from './components'
import { setTabDocument, tabDocument, closeTabDocument, openTabIds } from './composables/tabDocuments'

export { XmlEditor, XmlEditorTab } from './components'
export { setTabDocument, tabDocument, closeTabDocument, openTabIds, type XmlDocument } from './composables/tabDocuments'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating XML Editor plugin...')

  context.services.register('ui.xml-editor.components', { XmlEditor, XmlEditorTab })
  context.services.register('ui.xml-editor.composables', { setTabDocument, tabDocument, closeTabDocument, openTabIds })

  // The menu bar of a text tab: the view names 'xml-editor' as the menu it brings
  const menuRegistry = context.services.get<any>('gene.menu.registry')
  if (menuRegistry) {
    const eb = context.services.get<any>('gene.eventbus')
    menuRegistry.registerMenu('xml-editor', [
      { id: 'xml.save', icon: 'pi pi-save', label: 'Speichern', action: () => eb?.emit('xml:save') }
    ])
  }

  context.log.info('XML Editor plugin activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.services.unregister('ui.xml-editor.components')
  context.services.unregister('ui.xml-editor.composables')
  context.log.info('XML Editor plugin deactivated')
}
