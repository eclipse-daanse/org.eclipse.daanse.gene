/**
 * Atlas Browser Plugin
 *
 * Browse and import models/instances from Model Atlas servers.
 * Provides a tree-based browser and detail panel.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw, h, render, watch } from 'tsm:vue'

// Type imports
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Atlas Browser plugin...')

  // Lazy-import components and composables to avoid top-level import issues
  const { AtlasBrowserTree, AtlasDetailPanel, AtlasUploadDialog, AtlasGraphViewer, AtlasXmlViewer, AtlasSchemaExplorer, AtlasTransitionsEditor } = await import('./components')
  const { useAtlasBrowser, useSharedAtlasBrowser } = await import('./composables/useAtlasBrowser')

  // Register components as service
  context.services.register('ui.atlas-browser.components', {
    AtlasBrowserTree,
    AtlasDetailPanel,
    AtlasUploadDialog,
    AtlasGraphViewer,
    AtlasXmlViewer,
    AtlasSchemaExplorer,
    AtlasTransitionsEditor
  })

  // Register composables as service
  context.services.register('ui.atlas-browser.composables', {
    useAtlasBrowser,
    useSharedAtlasBrowser
  })

  // Register upload service (for cross-plugin access)
  const sharedBrowser = useSharedAtlasBrowser()
  const uploadService = {
    uploadSchema: sharedBrowser.uploadSchema,
    getConnections: () => sharedBrowser.connections.value,
    getSchemaStages: sharedBrowser.getSchemaStages
  }
  context.services.register('ui.atlas-browser.upload', uploadService)
  context.services.register('gene.atlas.upload', uploadService)

  // Register the browser instance directly so other plugins can use it
  context.services.register('gene.atlas.browser', sharedBrowser)

  // Register cascade resolver service
  const { createAtlasURIConverter } = await import('./composables/atlasURIConverter')
  const { ModelAtlasClient } = await import('storage-model-atlas')

  context.services.register('gene.atlas.cascadeResolver', {
    async configure(editorConfig: any, resourceSet: any) {
      const chain = editorConfig?.packageResolverChain?.value
      if (!chain) return 0

      function getVal(obj: any, name: string): any {
        if (obj[name] !== undefined) return obj[name]
        if (typeof obj.eGet === 'function') {
          const eClass = obj.eClass()
          const feature = eClass?.getEStructuralFeature(name)
          if (feature) return obj.eGet(feature)
        }
        return undefined
      }

      const resolvers = getVal(chain, 'resolvers') || []
      const autoResolve = getVal(chain, 'autoResolveReferences') ?? true
      const maxDepth = getVal(chain, 'maxResolutionDepth') ?? -1

      const providers: any[] = []
      for (const resolver of resolvers) {
        const kind = getVal(resolver, 'kind')
        const enabled = getVal(resolver, 'enabled') ?? true
        if (!enabled) continue

        if (kind === 'MODEL_ATLAS' || String(kind) === 'MODEL_ATLAS') {
          const baseUrl = getVal(resolver, 'baseUrl')
          const scopeName = getVal(resolver, 'scopeName')
          const stage = getVal(resolver, 'stage') || 'release'
          const token = getVal(resolver, 'token')

          if (baseUrl && scopeName) {
            providers.push({
              client: new ModelAtlasClient({ baseUrl, token }),
              scopeName,
              stage
            })
          }
        }
      }

      if (providers.length === 0) return 0

      resourceSet.setURIConverter(createAtlasURIConverter(providers))
      context.log.info(`CascadeResolver: URIConverter configured with ${providers.length} Atlas provider(s)`)

      if (autoResolve) {
        try {
          const resolved = await resourceSet.resolveProxiesAsync(maxDepth)
          context.log.info(`CascadeResolver: ${resolved} package(s) resolved from Atlas`)
          return resolved
        } catch (err) {
          context.log.warn('CascadeResolver: Proxy resolution failed:', err)
        }
      }
      return 0
    }
  })

  // Mount ValidationDialog as global overlay
  const { ValidationDialog } = await import('./components')
  const dialogHost = document.createElement('div')
  dialogHost.id = 'atlas-validation-dialog-host'
  document.body.appendChild(dialogHost)

  // Use Vue's render() to render the dialog inside the existing app context
  const appInstance = context.services.get<any>('app.instance')
  function renderDialog() {
    const vnode = h(ValidationDialog, {
      visible: sharedBrowser.showValidationDialog.value,
      'onUpdate:visible': (v: boolean) => {
        if (!v) sharedBrowser.resolveValidationChoice('cancelled')
      },
      onValidate: (oclId: string | null) => {
        sharedBrowser.resolveValidationChoice(oclId)
      }
    })
    // Inherit app context (PrimeVue, TSM provide, etc.)
    if (appInstance) {
      vnode.appContext = appInstance._context
    }
    render(vnode, dialogHost)
  }

  // Re-render when dialog visibility changes
  watch(sharedBrowser.showValidationDialog, () => renderDialog())
  renderDialog()

  // Store for cleanup on deactivate
  context.services.register('gene.atlas.validation.cleanup', () => {
    render(null, dialogHost)
    dialogHost.remove()
  })

  // Register Model Atlas perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.register({
      id: 'model-atlas',
      name: 'Model Atlas',
      icon: 'pi pi-globe',
      requiresWorkspace: false,
      order: 80,
      defaultLayout: {
        left: ['atlas-tree'],
        center: ['atlas-transitions'],
        right: [],
        bottom: []
      },
      defaultVisibility: { left: true, right: false, bottom: false }
    })
    context.log.info('Model Atlas perspective registered')
  }

  // Register Atlas Tree panel (left sidebar)
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'atlas-tree',
      title: 'Atlas Browser',
      icon: 'pi pi-globe',
      component: markRaw(AtlasBrowserTree),
      perspectives: ['model-atlas'],
      defaultLocation: 'left',
      defaultOrder: 0
    })

    panelRegistry.register({
      id: 'atlas-detail',
      title: 'Schema Details',
      icon: 'pi pi-info-circle',
      component: markRaw(AtlasDetailPanel),
      perspectives: ['model-atlas'],
      defaultLocation: 'center',
      defaultOrder: 0
    })

    /*panelRegistry.register({
      id: 'atlas-graph',
      title: 'Schema Graph',
      icon: 'pi pi-sitemap',
      component: markRaw(AtlasGraphViewer),
      perspectives: ['model-atlas'],
      defaultLocation: 'center',
      defaultOrder: 10
    })

    panelRegistry.register({
      id: 'atlas-xml',
      title: 'XML View',
      icon: 'pi pi-code',
      component: markRaw(AtlasXmlViewer),
      perspectives: ['model-atlas'],
      defaultLocation: 'center',
      defaultOrder: 20
    })*/

    panelRegistry.register({
      id: 'atlas-explorer',
      title: 'Schema Explorer',
      icon: 'pi pi-search',
      component: markRaw(AtlasSchemaExplorer),
      perspectives: ['model-atlas'],
      defaultLocation: 'center',
      defaultOrder: 30
    })

    panelRegistry.register({
      id: 'atlas-transitions',
      title: 'Transitions',
      icon: 'pi pi-arrow-right-arrow-left',
      component: markRaw(AtlasTransitionsEditor),
      perspectives: ['model-atlas'],
      defaultLocation: 'center',
      defaultOrder: 40
    })

    console.log('[AtlasBrowser] Registered atlas-transitions panel, component:', !!AtlasTransitionsEditor)
    context.log.info('Atlas Browser panels registered')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'atlas-browser',
      icon: 'pi pi-globe',
      label: 'Model Atlas',
      tooltip: 'Browse Model Atlas',
      panelId: 'atlas-tree',
      perspectiveId: 'model-atlas',
      order: 15,
      perspectives: ['model-atlas']
    })
    context.log.info('Atlas Browser activity registered')
  }

  // Expose opener function globally
  const openAtlasBrowser = () => {
    const perspectiveService = context.services.get<any>('ui.perspectives')
    if (perspectiveService?.usePerspective) {
      const perspective = perspectiveService.usePerspective()
      perspective.switchTo('model-atlas')
      context.log.info('Switched to Model Atlas perspective')
    }
  }

  context.services.register('ui.atlas-browser.open', openAtlasBrowser)

  // Register Atlas Validation action
  const actionRegistry = context.services.get<any>('gene.action.registry')
  const internalExecutor = context.services.get<any>('gene.action.executor.internal')

  if (actionRegistry && internalExecutor) {
    // Register the validation handler
    internalExecutor.registerHandler('atlas.validate.handler', {
      async execute(ctx: any) {
        const obj = ctx.input.primaryObject

        // Find active Atlas connection
        const browser = useSharedAtlasBrowser()
        const activeConnection = browser.connections.value.find((c: any) => c.status === 'connected')
        if (!activeConnection) {
          return { status: 'ERROR', logs: [{ message: 'No active Atlas connection. Connect to a Model Atlas server first.', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
        }

        const client = browser.getClient(activeConnection.id)
        if (!client) {
          return { status: 'ERROR', logs: [{ message: 'Atlas client not available for connection', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
        }

        try {
          const { XMIResource } = await import('@emfts/core')
          const resource = new XMIResource()

          // Get instance resource — from selected object or from shared instance tree
          const sourceResource = obj?.eResource?.()
          if (sourceResource) {
            for (const content of sourceResource.getContents()) {
              resource.getContents().push(content)
            }
          } else {
            // No object selected — get the shared instance resource
            const instanceTreeComposable = context.services.get<any>('ui.instance-tree.composables')
            const sharedResource = instanceTreeComposable?.getSharedResource?.()
            if (sharedResource && sharedResource.getContents().length > 0) {
              for (const content of sharedResource.getContents()) {
                resource.getContents().push(content)
              }
            } else if (obj) {
              resource.getContents().push(obj)
            } else {
              return { status: 'ERROR', logs: [{ message: 'No instances to validate', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
            }
          }

          let xmiContent = resource.saveToString()
          xmiContent = xmiContent.replace(/ eType="/g, ' _type="')

          // Show validation dialog to let user pick C-OCL constraint set
          const oclId = await browser.requestValidationChoice()

          if (oclId === 'cancelled') {
            return { status: 'SUCCESS', logs: [{ message: 'Validation cancelled by user', level: 'INFO', timestamp: new Date() }], artifacts: [] }
          }

          // Call Atlas validation endpoint
          const diagnostic = oclId
            ? await client.validateWithConstraints(xmiContent, oclId)
            : await client.validate(xmiContent)

          // Convert diagnostic to validation messages
          const messages: any[] = []
          const label = obj?.eClass?.().getName?.() || 'instances'
          function collectMessages(diag: any) {
            if (diag.message && diag.type !== 'OK') {
              messages.push({
                severity: diag.type === 'ERROR' ? 'error' : diag.type === 'WARNING' ? 'warning' : 'info',
                message: diag.message,
                source: 'atlas-validation',
                objectLabel: label,
                eClassName: label
              })
            }
            for (const child of diag.children || []) {
              collectMessages(child)
            }
          }
          collectMessages(diagnostic)

          // Push results to Problems Panel
          const problemsService = context.services.get<any>('gene.problems')
          if (problemsService) {
            problemsService.clearIssuesBySource?.('atlas-validation')
            for (const msg of messages) {
              problemsService.addIssue?.(msg)
            }
            if (messages.length > 0) {
              const eventBus = context.services.get<any>('gene.eventbus')
              eventBus?.emit?.('gene:show-problems')
            }
          }

          if (messages.length === 0) {
            return {
              status: 'SUCCESS',
              logs: [{ message: `Server validation passed for ${label}`, level: 'INFO', timestamp: new Date() }],
              artifacts: []
            }
          }

          return {
            status: diagnostic.type === 'ERROR' ? 'ERROR' : 'WARNING',
            logs: [{ message: `Server validation found ${messages.length} issue(s) for ${label}`, level: 'WARN', timestamp: new Date() }],
            artifacts: [{
              type: 'VALIDATION_MESSAGES',
              name: 'Atlas Validation',
              data: messages,
              messages
            }]
          }
        } catch (e: any) {
          return { status: 'ERROR', logs: [{ message: `Atlas validation failed: ${e.message}`, level: 'ERROR', timestamp: new Date() }], artifacts: [] }
        }
      }
    })

    // Register the action definition (object context menu)
    actionRegistry.register({
      definition: {
        actionId: 'atlas.validate',
        label: 'Validate on Atlas Server',
        icon: 'pi pi-cloud-upload',
        actionScope: 'BOTH',
        actionType: 'VALIDATION',
        handlerId: 'atlas.validate.handler',
        order: 50,
        enabled: true,
        perspectiveIds: [],
        parameters: [],
        returnTypes: ['VALIDATION_MESSAGES']
      },
      source: 'plugin',
      moduleId: 'atlas-browser'
    })

    context.log.info('Atlas validation action registered')
  }

  // Listen for workspace loaded event to auto-connect Atlas connections
  window.addEventListener('gene:workspace-loaded', () => {
    const editorConfig = context.services.get<any>('gene.editor.config')
    const config = editorConfig?.editorConfig?.value
    if (!config) return

    const eClass = config.eClass?.()
    const atlasFeature = eClass?.getEStructuralFeature?.('atlasConnections')
    if (!atlasFeature) return

    const atlasConnections = config.eGet(atlasFeature) || []
    for (const conn of atlasConnections) {
      const acClass = conn.eClass()
      const get = (name: string) => {
        const f = acClass.getEStructuralFeature(name)
        return f ? conn.eGet(f) : undefined
      }
      if (get('enabled') === false || get('autoConnect') === false) continue
      const baseUrl = get('baseUrl')
      const scopeName = get('scopeName')
      const token = get('token')
      if (baseUrl && scopeName) {
        const alreadyConnected = sharedBrowser.connections.value.some(
          (c: any) => c.baseUrl === baseUrl && c.scopeName === scopeName && c.status === 'connected'
        )
        if (!alreadyConnected) {
          context.log.info(`Auto-connecting to Atlas: ${scopeName}@${baseUrl}`)
          sharedBrowser.connect({ baseUrl, scopeName, token: token || '' }).catch((e: any) => {
            context.log.warn(`Auto-connect failed for ${scopeName}: ${e.message}`)
          })
        }
      }
    }
  })

  context.log.info('Atlas Browser plugin activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Atlas Browser plugin...')

  // Unregister perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.unregister('model-atlas')
  }

  // Cleanup validation dialog overlay
  const cleanupDialog = context.services.get<() => void>('gene.atlas.validation.cleanup')
  if (cleanupDialog) cleanupDialog()
  context.services.unregister('gene.atlas.validation.cleanup')

  context.services.unregister('ui.atlas-browser.open')
  context.services.unregister('gene.atlas.upload')

  context.services.unregister('ui.atlas-browser.open')
  context.services.unregister('ui.atlas-browser.upload')
  context.services.unregister('ui.atlas-browser.components')
  context.services.unregister('ui.atlas-browser.composables')

  context.log.info('Atlas Browser plugin deactivated')
}
