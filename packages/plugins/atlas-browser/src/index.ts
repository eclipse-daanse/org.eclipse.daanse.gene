/**
 * Atlas Browser Plugin
 *
 * Browse and import models/instances from Model Atlas servers.
 * Provides a tree-based browser and detail panel.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'

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
        if (!obj) {
          return { status: 'ERROR', logs: [{ message: 'No object selected', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
        }

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
          // Serialize all objects from the source resource to XMI
          // This ensures cross-references between objects resolve as internal refs
          // instead of broken hrefs like "instances.xmi#/0"
          const { XMIResource } = await import('@emfts/core')
          const resource = new XMIResource()

          // Get the source resource to include all sibling objects
          const sourceResource = obj.eResource?.()
          if (sourceResource) {
            for (const content of sourceResource.getContents()) {
              resource.getContents().push(content)
            }
          } else {
            resource.getContents().push(obj)
          }

          let xmiContent = resource.saveToString()

          // Atlas server expects '_type' instead of 'eType' as attribute name
          xmiContent = xmiContent.replace(/ eType="/g, ' _type="')

          // Call Atlas validation endpoint
          const diagnostic = await client.validate(xmiContent)

          // Convert diagnostic to validation messages
          const messages: any[] = []
          function collectMessages(diag: any, depth = 0) {
            if (diag.message && diag.type !== 'OK') {
              messages.push({
                severity: diag.type === 'ERROR' ? 'ERROR' : diag.type === 'WARNING' ? 'WARN' : 'INFO',
                message: diag.message,
                className: obj.eClass().getName()
              })
            }
            for (const child of diag.children || []) {
              collectMessages(child, depth + 1)
            }
          }
          collectMessages(diagnostic)

          if (messages.length === 0) {
            return {
              status: 'SUCCESS',
              logs: [{ message: `Validation passed for ${obj.eClass().getName()}`, level: 'INFO', timestamp: new Date() }],
              artifacts: []
            }
          }

          return {
            status: diagnostic.type === 'ERROR' ? 'ERROR' : 'WARNING',
            logs: [{ message: `Validation found ${messages.length} issue(s)`, level: 'WARN', timestamp: new Date() }],
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

    // Register the action definition (editor-level, not object context menu)
    actionRegistry.register({
      definition: {
        actionId: 'atlas.validate',
        label: 'Validate on Atlas Server',
        actionScope: 'EDITOR',
        actionType: 'VALIDATION',
        handlerId: 'atlas.validate.handler',
        order: 50,
        enabled: true,
        perspectiveIds: ['model-editor'],
        parameters: [],
        returnTypes: ['VALIDATION_MESSAGES']
      },
      source: 'plugin',
      moduleId: 'atlas-browser'
    })

    context.log.info('Atlas validation action registered')
  }

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

  context.services.unregister('ui.atlas-browser.open')
  context.services.unregister('gene.atlas.upload')

  context.services.unregister('ui.atlas-browser.open')
  context.services.unregister('ui.atlas-browser.upload')
  context.services.unregister('ui.atlas-browser.components')
  context.services.unregister('ui.atlas-browser.composables')

  context.log.info('Atlas Browser plugin deactivated')
}
