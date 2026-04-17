/**
 * Action System Module
 *
 * Provides configurable action framework with:
 * - ActionRegistry for registering/querying actions
 * - ActionManager for executing actions
 * - InternalExecutor for local TypeScript handlers
 * - RemoteExecutor for HTTP endpoint calls
 * - EventDispatcher for event-action mappings
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import { ActionRegistryImpl } from './ActionRegistry'
import { ActionManagerImpl } from './ActionManager'
import { InternalExecutorImpl } from './InternalExecutor'
import { RemoteExecutorImpl } from './RemoteExecutor'
import { EventDispatcherImpl } from './EventDispatcher'
import { exportXmiHandler, copyUriHandler, copyJsonHandler } from './builtinHandlers'
import { EventMappingEditor } from './components'

// Re-export types
export * from './types'
export { ActionRegistryImpl } from './ActionRegistry'
export { ActionManagerImpl } from './ActionManager'
export { InternalExecutorImpl } from './InternalExecutor'
export { RemoteExecutorImpl } from './RemoteExecutor'
export { EventDispatcherImpl } from './EventDispatcher'
export { EventMappingEditor } from './components'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Action System module...')

  // Bind core services via DI
  context.services.bindClass('gene.action.registry', ActionRegistryImpl)
  context.services.bindClass('gene.action.manager', ActionManagerImpl)
  context.services.bindClass('gene.action.executor.internal', InternalExecutorImpl)
  context.services.bindClass('gene.action.executor.remote', RemoteExecutorImpl)
  context.services.bindClass('gene.action.events', EventDispatcherImpl)

  // Wire up manager with executors and eventbus
  const manager = context.services.getRequired<ActionManagerImpl>('gene.action.manager')
  const internalExecutor = context.services.getRequired<InternalExecutorImpl>('gene.action.executor.internal')
  const remoteExecutor = context.services.getRequired<RemoteExecutorImpl>('gene.action.executor.remote')
  const eventBus = context.services.get<any>('gene.eventbus')

  manager.setInternalExecutor(internalExecutor)
  manager.setRemoteExecutor(remoteExecutor)
  if (eventBus) manager.setEventBus(eventBus)

  // Register built-in handlers
  internalExecutor.registerHandler('gene.handler.export-xmi', exportXmiHandler)
  internalExecutor.registerHandler('gene.handler.copy-uri', copyUriHandler)
  internalExecutor.registerHandler('gene.handler.copy-json', copyJsonHandler)

  // Register built-in action definitions (so they appear in context menus)
  const registry = context.services.getRequired<ActionRegistryImpl>('gene.action.registry')

  registry.register({
    definition: {
      actionId: 'gene.export-xmi',
      label: 'Export as XMI',
      actionScope: 'OBJECT',
      actionType: 'TRANSFORMATION',
      handlerId: 'gene.handler.export-xmi',
      order: 100,
      enabled: true,
      perspectiveIds: [],
      parameters: [],
      returnTypes: ['FILE']
    },
    source: 'plugin',
    moduleId: 'ui-actions'
  })

  registry.register({
    definition: {
      actionId: 'gene.copy-uri',
      label: 'Copy Type URI',
      actionScope: 'OBJECT',
      actionType: 'CUSTOM',
      handlerId: 'gene.handler.copy-uri',
      order: 110,
      enabled: true,
      perspectiveIds: [],
      parameters: [],
      returnTypes: []
    },
    source: 'plugin',
    moduleId: 'ui-actions'
  })

  registry.register({
    definition: {
      actionId: 'gene.copy-json',
      label: 'Copy as JSON',
      actionScope: 'OBJECT',
      actionType: 'CUSTOM',
      handlerId: 'gene.handler.copy-json',
      order: 120,
      enabled: true,
      perspectiveIds: [],
      parameters: [],
      returnTypes: []
    },
    source: 'plugin',
    moduleId: 'ui-actions'
  })

  // Register UI components
  context.services.register('gene.action.components', { EventMappingEditor: markRaw(EventMappingEditor) })

  context.log.info('Action System module activated with built-in handlers')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Action System module...')

  const dispatcher = context.services.get<EventDispatcherImpl>('gene.action.events')
  if (dispatcher) dispatcher.clearMappings()

  context.services.unregister('gene.action.registry')
  context.services.unregister('gene.action.manager')
  context.services.unregister('gene.action.executor.internal')
  context.services.unregister('gene.action.executor.remote')
  context.services.unregister('gene.action.events')
  context.services.unregister('gene.action.components')

  context.log.info('Action System module deactivated')
}
