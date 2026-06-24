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
import { EPackageRegistry } from '@emfts/core'
import { markRaw, watch, defineComponent, h, computed } from 'tsm:vue'
import { ActionRegistryImpl } from './ActionRegistry'
import { ActionManagerImpl } from './ActionManager'
import { InternalExecutorImpl } from './InternalExecutor'
import { RemoteExecutorImpl } from './RemoteExecutor'
import { EventDispatcherImpl } from './EventDispatcher'
import { exportXmiHandler, copyUriHandler, copyJsonHandler } from './builtinHandlers'
import { EventMappingEditor, ActionEditor, JobsPanel, CommandPalette, ActionApprovalDialog, XmiImportDialog } from './components'
import { useJobStore } from './composables/useJobStore'
import { fetchCapabilities, autoRegisterActions } from './composables/useCapabilities'
import { initActionApiPackage, setCanonicalPackageRegistry } from './ActionApiResourceSet'
import { CommandRegistryImpl } from './CommandRegistry'
import { KeybindingServiceImpl } from './KeybindingService'
import * as OAuth2Service from './OAuth2Service'
import { ActionsPluginPackage } from './generated/actionsplugin/ActionsPluginPackage'
import type { PanelRegistry } from 'ui-perspectives'

// Import own command ecore
import jobCommandsEcore from '../model/job-commands.ecore?raw'

// Re-export types
export * from './types'
export { ActionRegistryImpl } from './ActionRegistry'
export { ActionManagerImpl } from './ActionManager'
export { InternalExecutorImpl } from './InternalExecutor'
export { RemoteExecutorImpl } from './RemoteExecutor'
export { EventDispatcherImpl } from './EventDispatcher'
export { CommandRegistryImpl } from './CommandRegistry'
export { KeybindingServiceImpl } from './KeybindingService'
export { EventMappingEditor, JobsPanel, CommandPalette, ActionApprovalDialog } from './components'
export { useJobStore } from './composables/useJobStore'
export { useCapabilities, fetchCapabilities, autoRegisterActions } from './composables/useCapabilities'
export { AsyncPoller } from './AsyncPoller'
export type { CommandDefinition, CommandParameter } from './EcoreCommandParser'
export { parseCommandEcore } from './EcoreCommandParser'
export type { CommandContext, CommandHandler } from './CommandRegistry'
export { evaluateWhen } from './CommandRegistry'
export type { KeybindingEntry } from './KeybindingService'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Action System module...')

  // Inject canonical package registry from main bundle
  const canonicalRegistry = context.services.get('gene.package.registry')
  if (canonicalRegistry) {
    setCanonicalPackageRegistry(canonicalRegistry)
  }

  // Register EPackages for XMI parsing
  initActionApiPackage()
  // Register ActionsPluginConfig EPackage so xsi:type resolves in config.xmi
  EPackageRegistry.INSTANCE.set(ActionsPluginPackage.eNS_URI, ActionsPluginPackage.eINSTANCE)
  if (canonicalRegistry && canonicalRegistry !== EPackageRegistry.INSTANCE) {
    (canonicalRegistry as any).set(ActionsPluginPackage.eNS_URI, ActionsPluginPackage.eINSTANCE)
  }

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
  manager.setInternalExecutor(internalExecutor)
  manager.setRemoteExecutor(remoteExecutor)

  // EventBus may not exist yet (created in App.vue onMounted), retry until available
  function trySetEventBus() {
    const eventBus = context.services.get<any>('gene.eventbus')
    if (eventBus) {
      manager.setEventBus(eventBus)
      return true
    }
    return false
  }
  if (!trySetEventBus()) {
    const interval = setInterval(() => {
      if (trySetEventBus()) clearInterval(interval)
    }, 100)
  }

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
      icon: 'pi pi-file-export',
      actionScope: 'OBJECT',
      actionType: 'TRANSFORMATION',
      handlerId: 'gene.handler.export-xmi',
      order: 100,
      enabled: true,
      perspectiveIds: [],
      parameters: [],
      returnTypes: ['FILE'],
      perspectiveIds: []
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

  // --- Command System ---
  const commandRegistry = new CommandRegistryImpl()
  commandRegistry.setActionRegistry(registry)
  context.services.register('gene.command.registry', commandRegistry)

  const keybindingService = new KeybindingServiceImpl()
  keybindingService.setCommandRegistry(commandRegistry)
  context.services.register('gene.keybindings', keybindingService)

  // Wire keybinding service into action registry for auto-registration
  registry.setKeybindingService(keybindingService)

  // Register own commands from ecore
  const jobCmds = commandRegistry.registerCommandsFromEcore(jobCommandsEcore, 'ui-actions')
  keybindingService.registerFromCommands(jobCmds)

  // Register handlers for job commands
  commandRegistry.registerHandler('jobs.cancelJob', async (args) => {
    const store = useJobStore()
    const jobId = args?.jobId as string
    if (jobId) store.cancelJob(jobId)
  })
  commandRegistry.registerHandler('jobs.clearCompletedJobs', async () => {
    const store = useJobStore()
    store.clearCompleted()
  })
  commandRegistry.registerHandler('jobs.showJobsPanel', async () => {
    const ls = context.services.get<any>('gene.layout.state')
    if (ls) {
      if (!ls.state?.visibility?.panelArea) ls.togglePanelArea?.()
      ls.selectPanelTab?.('action-jobs')
    }
  })

  // Activate keybinding listener
  keybindingService.activate()

  // Register UI components
  context.services.register('gene.action.components', {
    EventMappingEditor: markRaw(EventMappingEditor),
    ActionEditor: markRaw(ActionEditor),
    JobsPanel: markRaw(JobsPanel),
    CommandPalette: markRaw(CommandPalette),
    ActionApprovalDialog: markRaw(ActionApprovalDialog),
    XmiImportDialog: markRaw(XmiImportDialog)
  })

  // Register OAuth2 Service + callback handler
  context.services.register('gene.oauth2', OAuth2Service)

  // Handle OAuth2 callback message from popup (popup itself is intercepted in main.ts)
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'oauth2-callback' && event.data.code && event.data.state) {
      OAuth2Service.handleCallback(event.data.code, event.data.state)
    }
  })

  // Register Job Store as service
  const jobStore = useJobStore()
  context.services.register('gene.jobs', jobStore)

  // Register Jobs panel in PanelRegistry (for perspective system)
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'action-jobs',
      title: 'Jobs',
      icon: 'pi pi-bolt',
      component: markRaw(JobsPanel),
      perspectives: '*' as any,
      defaultLocation: 'bottom',
      defaultOrder: 10
    })
    context.log.info('Jobs panel registered in PanelRegistry')
  }

  // Also register directly as PanelTab in LayoutState (ensures visibility
  // even if perspective was already set up before this module activated)
  const layoutState = context.services.get<any>('gene.layout.state')
  if (layoutState?.registerPanelTab) {
    const existingTabs = layoutState.state?.panelTabs || []
    const alreadyRegistered = existingTabs.some((t: any) => t.id === 'action-jobs')
    if (!alreadyRegistered) {
      layoutState.registerPanelTab({
        id: 'action-jobs',
        title: 'Jobs',
        icon: 'pi pi-bolt',
        component: markRaw(JobsPanel)
      })
      context.log.info('Jobs panel tab injected into LayoutState')
    }
  }

  // Badge: watch running count and update panel badge
  if (layoutState?.updateBadge) {
    watch(jobStore.runningCount, (count) => {
      layoutState.updateBadge('action-jobs', count > 0 ? count : undefined)
    })
  }

  // StatusBar: show running jobs indicator
  if (layoutState?.registerStatusBarItem) {
    const JobsStatusBarItem = defineComponent({
      setup() {
        const count = jobStore.runningCount
        const label = computed(() => {
          const n = count.value
          return n === 1 ? 'Running 1 Job' : `Running ${n} Jobs`
        })
        return () => count.value > 0
          ? h('span', { style: 'display:flex;align-items:center;gap:5px' }, [
              h('i', { class: 'pi pi-spin pi-spinner', style: 'font-size:0.75rem' }),
              h('span', label.value)
            ])
          : null
      }
    })

    layoutState.registerStatusBarItem({
      id: 'jobs-running',
      content: markRaw(JobsStatusBarItem),
      alignment: 'right',
      priority: 100,
      tooltip: 'Show running jobs',
      onClick: () => {
        // Ensure panel area is visible
        if (!layoutState.state?.visibility?.panelArea) {
          layoutState.togglePanelArea?.()
        }
        // Switch to Jobs tab
        layoutState.selectPanelTab?.('action-jobs')
      }
    })
  }

  // Auto-discover action servers (non-blocking)
  discoverActionServers(registry, context)

  context.log.info('Action System module activated with built-in handlers')
}

/**
 * Try to discover and register actions from known action servers.
 * Runs in background — failures are silently logged.
 */
async function discoverActionServers(registry: ActionRegistryImpl, context: ModuleContext): Promise<void> {
  // Read action server URLs from AppConfig plugin config
  const appConfig = context.services.get<any>('gene.app.config')
  const pluginConfig = appConfig?.getPluginConfig?.('ui-actions')

  const servers: string[] = []
  if (pluginConfig) {
    const feat = (obj: any, name: string) => {
      if (obj[name] !== undefined) return obj[name]
      if (typeof obj.eGet === 'function' && typeof obj.eClass === 'function') {
        const f = obj.eClass().getEStructuralFeature?.(name)
        if (f) return obj.eGet(f)
      }
      return undefined
    }
    const urls = feat(pluginConfig, 'serverUrls')
    if (urls) {
      const arr = Array.isArray(urls) ? urls : (urls.data || [])
      servers.push(...arr.map(String))
    }
  }

  if (servers.length === 0) {
    context.log.info('No action servers configured in AppConfig')
    return
  }

  context.log.info(`Discovering ${servers.length} action server(s)...`)

  for (const baseUrl of servers) {
    try {
      const caps = await fetchCapabilities(baseUrl)
      if (caps) {
        autoRegisterActions(baseUrl, caps, registry)
        const authMethod = caps.authConfig?.authMethod || 'NONE'
        context.log.info(`Discovered ${caps.endpoints.length} action(s) from ${caps.name || baseUrl} (auth: ${authMethod})`)
      }
    } catch (err) {
      context.log.warn(`Discovery failed for ${baseUrl}: ${err}`)
    }
  }
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
  context.services.unregister('gene.jobs')

  const keybindings = context.services.get<KeybindingServiceImpl>('gene.keybindings')
  if (keybindings) keybindings.deactivate()
  context.services.unregister('gene.command.registry')
  context.services.unregister('gene.keybindings')

  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) panelRegistry.unregister('action-jobs')

  context.log.info('Action System module deactivated')
}
