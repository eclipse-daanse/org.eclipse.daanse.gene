/**
 * CWM Views Module
 *
 * CWM-specific views for the instance view. Registers into the properties
 * panel's extension point (ui.instance.views):
 * - relational:Table → table with its columns, keys and descriptions
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import type { InstanceViewRegistry } from 'ui-properties-panel'
import CwmTableView from './components/CwmTableView.vue'
import { isInstanceOf, RELATIONAL_NS_URI } from './cwmModel'

export { default as CwmTableView } from './components/CwmTableView.vue'
export * from './cwmModel'

const unregisters: Array<() => void> = []

export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating CWM Views module...')

  const registry = context.services.get<InstanceViewRegistry>('ui.instance.views')
  if (!registry) {
    context.log.warn('ui.instance.views not available — CWM views disabled')
    return
  }

  unregisters.push(registry.register({
    id: 'cwm.relational.table',
    matches: obj => isInstanceOf(obj, RELATIONAL_NS_URI, 'Table'),
    component: CwmTableView
  }))

  context.log.info('CWM Views module activated')
}

export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating CWM Views module...')
  unregisters.splice(0).forEach(fn => fn())
}
