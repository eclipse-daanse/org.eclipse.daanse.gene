/**
 * Atlas Browser Plugin
 *
 * Browse and import models/instances from Model Atlas servers.
 * Provides a tree-based browser and detail panel.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw, h, render, watch, toRaw } from 'tsm:vue'

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

  // Mount ValidationDialog + BatchValidationDialog as global overlays
  const { ValidationDialog, BatchValidationDialog } = await import('./components')
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

  // Mount BatchValidationDialog as global overlay (UC-OCL-009)
  const batchDialogHost = document.createElement('div')
  batchDialogHost.id = 'atlas-batch-validation-dialog-host'
  document.body.appendChild(batchDialogHost)

  function renderBatchDialog() {
    const vnode = h(BatchValidationDialog, {
      visible: sharedBrowser.showBatchValidationDialog.value,
      serverCocls: sharedBrowser.batchServerCocls.value,
      workspaceCocls: sharedBrowser.batchWorkspaceCocls.value,
      instances: sharedBrowser.batchInstances.value,
      coclError: sharedBrowser.batchCoclError.value,
      'onUpdate:visible': (v: boolean) => {
        // Only cancel if dialog is closed without validating (resolveBatchValidationChoice already clears the ref)
        if (!v && sharedBrowser.showBatchValidationDialog.value) {
          sharedBrowser.resolveBatchValidationChoice('cancelled')
        }
      },
      onValidate: (choice: { selectedObjects: any[]; referenceDepth: number; coclId: string; coclSource: 'server' | 'workspace'; coclContent?: string }) => {
        sharedBrowser.resolveBatchValidationChoice(choice)
      }
    })
    if (appInstance) {
      vnode.appContext = appInstance._context
    }
    render(vnode, batchDialogHost)
  }

  watch([sharedBrowser.showBatchValidationDialog, sharedBrowser.batchCoclError, sharedBrowser.batchServerCocls, sharedBrowser.batchInstances], () => renderBatchDialog())
  renderBatchDialog()

  // Store for cleanup on deactivate
  context.services.register('gene.atlas.validation.cleanup', () => {
    render(null, dialogHost)
    dialogHost.remove()
    render(null, batchDialogHost)
    batchDialogHost.remove()
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

    // Register the derive handler
    internalExecutor.registerHandler('atlas.derive.handler', {
      async execute(ctx: any) {
        const obj = ctx.input.primaryObject

        const browser = useSharedAtlasBrowser()
        const activeConnection = browser.connections.value.find((c: any) => c.status === 'connected')
        if (!activeConnection) {
          return { status: 'ERROR', logs: [{ message: 'No active Atlas connection.', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
        }
        const client = browser.getClient(activeConnection.id)
        if (!client) {
          return { status: 'ERROR', logs: [{ message: 'Atlas client not available', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
        }

        try {
          if (!obj) {
            return { status: 'ERROR', logs: [{ message: 'No object to compute derived values for', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
          }

          const { XMIResource, URI: EmfURI } = await import('@emfts/core')

          // Serialize only the selected object as XMI
          const tempResource = new XMIResource(EmfURI.createURI('derive-request.xmi'))
          tempResource.getContents().push(obj)
          let instanceXmi = await tempResource.saveToString()
          // Strip XML declaration and xmi:XMI wrapper — server expects bare EObject element
          instanceXmi = instanceXmi.replace(/<\?xml[^?]*\?>\s*/, '')
          instanceXmi = instanceXmi.replace(/<xmi:XMI[^>]*>\s*/, '').replace(/\s*<\/xmi:XMI>\s*$/, '')
          instanceXmi = instanceXmi.trim()

          // Build derived feature references from the object's EClass
          const eClass = obj.eClass()
          const derivedFeatures: string[] = []
          const allFeatures = eClass.getEAllStructuralFeatures?.() || eClass.getEStructuralFeatures?.() || []
          for (const f of allFeatures) {
            if (f.isDerived?.()) {
              derivedFeatures.push(f.getName())
            }
          }

          if (derivedFeatures.length === 0) {
            return { status: 'SUCCESS', logs: [{ message: 'No derived features on this object', level: 'INFO', timestamp: new Date() }], artifacts: [] }
          }

          // Build the DerivedValidationRequest XMI
          const nsURI = eClass.getEPackage?.()?.getNsURI?.() || ''
          const featureRefs = derivedFeatures.map(name =>
            `    <derivedFeature href="${nsURI}#//${eClass.getName()}/${name}"/>`
          ).join('\n')

          // Build validationObjects element with xsi:type instead of wrapping
          // Server expects: <validationObjects xsi:type="prefix:Class" attr1="val" .../>
          const nsPrefix = eClass.getEPackage?.()?.getNsPrefix?.() || 'ns'
          const className = eClass.getName() || ''
          const xsiType = `${nsPrefix}:${className}`

          // Extract attributes from the serialized XMI element
          // instanceXmi is like: <company:Person xmlns:company="..." firstName="Max" .../>
          // We need to extract the attributes and namespace declarations
          const attrMatch = instanceXmi.match(/^<[^\s>]+\s+([\s\S]*?)\/>$/) ||
                            instanceXmi.match(/^<[^\s>]+\s+([\s\S]*?)>/)
          const attrs = attrMatch ? attrMatch[1]
            .replace(/xmlns:xmi="[^"]*"/g, '')
            .replace(/xmi:version="[^"]*"/g, '')
            .replace(/xmlns:xsi="[^"]*"/g, '')
            .trim() : ''

          const requestXmi = `<?xml version="1.0" encoding="UTF-8"?>
<cocl:DerivedValidationRequest xmi:version="2.0"
    xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cocl="http://www.gme.org/cocl/1.0"
    xmlns:${nsPrefix}="${nsURI}">
  <validationObjects xsi:type="${xsiType}" ${attrs}/>
${featureRefs}
</cocl:DerivedValidationRequest>`

          const scopeName = activeConnection.scopeName || 'jena'
          const stageName = activeConnection.stageName || 'released'
          const result = await client.derive(scopeName, stageName, requestXmi)

          if (!result.success) {
            return { status: 'ERROR', logs: [{ message: result.error || 'Derive failed', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
          }

          // Parse response XMI and extract derived values
          const parser = new DOMParser()
          const doc = parser.parseFromString(result.xmi!, 'text/xml')

          // Extract results and update local object
          const resultElements = doc.querySelectorAll('results')
          const updates: string[] = []
          for (const resEl of Array.from(resultElements)) {
            // Each result may contain the updated object with derived values set
            const children = resEl.children
            for (const child of Array.from(children)) {
              // Try to read derived attribute values from the result
              for (const featureName of derivedFeatures) {
                const value = child.getAttribute(featureName)
                if (value !== null) {
                  updates.push(`${featureName} = ${value}`)
                }
              }
            }
          }

          // Extract diagnostics
          const diagElements = doc.querySelectorAll('diagnostics')
          const messages: any[] = []
          for (const diag of Array.from(diagElements)) {
            const msg = diag.getAttribute('message') || diag.textContent
            const severity = diag.getAttribute('severity') || 'info'
            if (msg) {
              messages.push({ severity, message: msg, source: 'atlas-derived' })
            }
          }

          const label = obj.eClass().getName()
          return {
            status: 'SUCCESS',
            logs: [
              { message: `Derived computation completed for ${label}: ${updates.length > 0 ? updates.join(', ') : 'no values returned'}`, level: 'INFO', timestamp: new Date() },
              ...messages.map((m: any) => ({ message: m.message, level: m.severity.toUpperCase(), timestamp: new Date() }))
            ],
            artifacts: result.xmi ? [{
              type: 'XMI',
              label: `Derived result for ${label}`,
              data: result.xmi
            }] : []
          }
        } catch (e: any) {
          return { status: 'ERROR', logs: [{ message: `Atlas derive failed: ${e.message}`, level: 'ERROR', timestamp: new Date() }], artifacts: [] }
        }
      }
    })

    // Register the derive action definition
    actionRegistry.register({
      definition: {
        actionId: 'atlas.derive',
        label: 'Compute Derived (Atlas Server)',
        icon: 'pi pi-calculator',
        actionScope: 'BOTH',
        actionType: 'COMPUTATION',
        handlerId: 'atlas.derive.handler',
        order: 51,
        enabled: true,
        perspectiveIds: [],
        parameters: [],
        returnTypes: ['XMI']
      },
      source: 'plugin',
      moduleId: 'atlas-browser'
    })

    context.log.info('Atlas derive action registered')

    // ==============================
    // UC-OCL-009: Batch Validation (Client-seitig)
    // ==============================
    internalExecutor.registerHandler('atlas.validate-batch.handler', {
      async execute(_ctx: any) {
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
          // Prepare instance data for the dialog (via context.services, NOT window)
          const instanceTreeComposable = context.services.get<any>('ui.instance-tree.composables')
          const getSharedResource = instanceTreeComposable?.getSharedResource
          const getObjectSourcePath = instanceTreeComposable?.getObjectSourcePath

          const instances: { obj: any; label: string; sourcePath: string }[] = []
          if (getSharedResource) {
            const resource = getSharedResource()
            if (resource) {
              const contents = resource.getContents()
              for (let i = 0; i < contents.size(); i++) {
                const obj = contents.get(i)
                const rawObj = toRaw(obj)
                const sourcePath = getObjectSourcePath?.(rawObj) || getObjectSourcePath?.(obj) || 'unknown'
                const label = getInstanceLabel(rawObj)
                instances.push({ obj: rawObj, label, sourcePath })
              }
            }
          }
          browser.batchInstances.value = instances

          // Prepare workspace COCL files from EditorConfig.coclSources
          const workspaceCocls: { name: string; path: string }[] = []
          const editorConfig = context.services.get<any>('gene.editor.config')
          const config = editorConfig?.editorConfig?.value
          if (config) {
            const eClass = config.eClass?.()
            const coclSourcesFeature = eClass?.getEStructuralFeature?.('coclSources')
            if (coclSourcesFeature) {
              const coclSources = config.eGet(coclSourcesFeature) || []
              for (const src of Array.from(coclSources)) {
                const srcClass = (src as any).eClass()
                const nameF = srcClass?.getEStructuralFeature?.('name')
                const locF = srcClass?.getEStructuralFeature?.('location')
                const enabledF = srcClass?.getEStructuralFeature?.('enabled')
                const enabled = enabledF ? (src as any).eGet(enabledF) : true
                if (enabled !== false) {
                  const name = nameF ? (src as any).eGet(nameF) : ''
                  const location = locF ? (src as any).eGet(locF) : ''
                  if (location) {
                    workspaceCocls.push({ name: name || location, path: location })
                  }
                }
              }
            }
          }
          browser.batchWorkspaceCocls.value = workspaceCocls

          // Pre-load server COCLs (before opening dialog)
          browser.batchServerCocls.value = []
          browser.batchCoclError.value = null
          try {
            let xmi = await client.listAllObjects(activeConnection.scopeName, 'cocl')
            if (!xmi) {
              xmi = await client.listReleasedObjects(activeConnection.scopeName, 'cocl')
            }
            if (xmi) {
              const { parseMetadataListXmi } = await import('storage-model-atlas')
              const metadataList = parseMetadataListXmi(xmi)
              browser.batchServerCocls.value = metadataList.map(m => ({
                id: m.objectId,
                name: m.objectName || m.objectId,
                stage: m.stage || ''
              }))
            }
            if (browser.batchServerCocls.value.length === 0) {
              browser.batchCoclError.value = 'Keine C-OCL Registry auf dem Server gefunden (HTTP 400). Die COCL-Registry muss im Scope konfiguriert sein.'
            }
          } catch (e: any) {
            browser.batchCoclError.value = `Server-COCLs konnten nicht geladen werden: ${e.message || e}`
          }

          // Show batch validation dialog — user picks instances, depth, COCL
          const choice = await browser.requestBatchValidationChoice()

          if (choice === 'cancelled') {
            return { status: 'SUCCESS', logs: [{ message: 'Batch validation cancelled by user', level: 'INFO', timestamp: new Date() }], artifacts: [] }
          }

          context.log.info(`[BatchValidation] Choice received: ${choice.selectedObjects.length} objects, depth=${choice.referenceDepth}, coclId=${choice.coclId}, source=${choice.coclSource}`)

          const scopeName = activeConnection.scopeName || 'jena'
          const stageName = (activeConnection as any).stageName || 'released'

          // Step 1: If workspace COCL, read file content and upload it first
          if (choice.coclSource === 'workspace') {
            try {
              const geneFS = context.services.get<any>('gene.filesystem')
              if (!geneFS) {
                console.error('[BatchValidation] No filesystem service')
                return { status: 'ERROR', logs: [{ message: 'Kein Dateisystem-Service verfuegbar', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
              }

              // Find the FileEntry by scanning all files for matching .c-ocl name
              const coclFile = workspaceCocls.find(c => c.name === choice.coclId || c.name === choice.coclId + '.c-ocl')
              const coclPath = coclFile?.path || choice.coclId
              let fileEntry: any = null
              const allFiles = geneFS.files?.value || []
              for (const f of allFiles) {
                if (f.path === coclPath || f.name === coclPath || f.name === choice.coclId + '.c-ocl' || f.name === choice.coclId) {
                  fileEntry = f
                  break
                }
              }

              if (!fileEntry) {
                console.error('[BatchValidation] COCL file not found in workspace:', coclPath)
                return { status: 'ERROR', logs: [{ message: `COCL-Datei nicht im Workspace gefunden: ${coclPath}`, level: 'ERROR', timestamp: new Date() }], artifacts: [] }
              }

              const coclContent = await geneFS.readTextFile(fileEntry)
              if (!coclContent) {
                console.error('[BatchValidation] Empty COCL file:', fileEntry.path)
                return { status: 'ERROR', logs: [{ message: `COCL-Datei ist leer: ${fileEntry.path}`, level: 'ERROR', timestamp: new Date() }], artifacts: [] }
              }

              context.log.info(`[BatchValidation] Uploading workspace COCL "${choice.coclId}" (${coclContent.length} chars)`)
              await client.uploadObject(scopeName, 'cocl', 'draft', choice.coclId, coclContent, {
                name: choice.coclId,
                override: true
              })
              context.log.info(`[BatchValidation] Workspace COCL "${choice.coclId}" uploaded to server`)
            } catch (uploadErr: any) {
              console.error('[BatchValidation] Upload failed:', uploadErr)
              const problemsService = context.services.get<any>('gene.problems')
              problemsService?.addIssue?.({ severity: 'error', message: `Workspace-COCL-Upload fehlgeschlagen: ${uploadErr.message}`, source: 'atlas-batch-validation' })
              const eventBus = context.services.get<any>('gene.eventbus')
              eventBus?.emit?.('gene:show-problems')
              return { status: 'ERROR', logs: [{ message: `Workspace-COCL-Upload fehlgeschlagen: ${uploadErr.message}`, level: 'ERROR', timestamp: new Date() }], artifacts: [] }
            }
          }

          // Step 2: Collect selected objects + referenced objects at given depth
          const { XMIResource, URI: EmfURI } = await import('@emfts/core')

          const allObjects = new Set<any>()
          for (const obj of choice.selectedObjects) {
            const rawObj = toRaw(obj)
            allObjects.add(rawObj)
            // Traverse non-containment references up to depth
            if (choice.referenceDepth !== 0) {
              collectReferences(rawObj, choice.referenceDepth, allObjects)
            }
          }

          // Step 3: Serialize selected objects to XMI
          const tempResource = new XMIResource(EmfURI.createURI('batch-objects.xmi'))
          const objectsArray = Array.from(allObjects)
          for (const obj of objectsArray) {
            tempResource.getContents().push(obj)
          }
          let objectsXmi = await tempResource.saveToString()
          // Remove from temp resource
          const tempContents = tempResource.getContents()
          for (let i = objectsArray.length - 1; i >= 0; i--) {
            if (typeof (tempContents as any).removeAt === 'function') {
              (tempContents as any).removeAt(i)
            } else if (typeof (tempContents as any).remove === 'function') {
              (tempContents as any).remove(objectsArray[i])
            }
          }

          // Step 4: Build BatchValidationRequest XMI
          // Extract namespace declarations and object elements from serialized XMI
          objectsXmi = objectsXmi.replace(/<\?xml[^?]*\?>\s*/, '')
          // Replace eType with _type for Atlas compatibility
          objectsXmi = objectsXmi.replace(/ eType="/g, ' _type="')

          // Extract namespace declarations from the XMI wrapper or root elements
          const nsDecls = new Map<string, string>()
          const nsRegex = /xmlns:([a-zA-Z0-9_]+)="([^"]+)"/g
          let nsMatch: RegExpExecArray | null
          while ((nsMatch = nsRegex.exec(objectsXmi)) !== null) {
            if (nsMatch[1] !== 'xmi' && nsMatch[1] !== 'xsi') {
              nsDecls.set(nsMatch[1], nsMatch[2])
            }
          }

          // Extract inner object elements (strip xmi:XMI wrapper if present)
          let innerElements: string
          const xmiWrapperMatch = objectsXmi.match(/<xmi:XMI[^>]*>([\s\S]*)<\/xmi:XMI>/)
          if (xmiWrapperMatch) {
            innerElements = xmiWrapperMatch[1].trim()
          } else {
            // Single root element — use as-is but strip namespace declarations
            innerElements = objectsXmi.trim()
          }

          // Convert each top-level element into a <validationObjects> element
          // Replace the root element tag names with validationObjects,
          // preserving xsi:type and all attributes
          const validationObjectsXml = innerElements
            .replace(/<([a-zA-Z0-9_]+:)?([a-zA-Z0-9_]+)\s/g, (match, prefix, _localName, offset) => {
              // Only replace top-level elements (not nested ones)
              // Check if this is at the beginning or right after whitespace following a >
              const before = innerElements.substring(0, offset)
              const lastClose = before.lastIndexOf('>')
              const lastOpen = before.lastIndexOf('<')
              // Top-level if we're at position 0 or the last tag closed before this one
              if (offset === 0 || (lastClose > lastOpen)) {
                // If element already has xsi:type, just rename the tag
                const elementEnd = innerElements.indexOf('>', offset)
                const elementStr = innerElements.substring(offset, elementEnd + 1)
                if (elementStr.includes('xsi:type=')) {
                  return '<validationObjects '
                }
                // Add xsi:type based on current prefix:localName
                const xsiType = prefix ? `${prefix}${_localName}` : _localName
                return `<validationObjects xsi:type="${xsiType}" `
              }
              return match
            })
            // Fix closing tags for top-level elements
            .replace(/<\/([a-zA-Z0-9_]+:)?([a-zA-Z0-9_]+)>(?=\s*(?:<[a-zA-Z]|$))/g, '</validationObjects>')

          // Build namespace string
          let nsString = ''
          for (const [prefix, uri] of nsDecls) {
            nsString += `\n    xmlns:${prefix}="${uri}"`
          }

          const requestXmi = `<?xml version="1.0" encoding="UTF-8"?>
<cocl:BatchValidationRequest xmi:version="2.0"
    xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cocl="http://www.gme.org/cocl/1.0"${nsString}
    coclId="${choice.coclId}">
  ${validationObjectsXml}
</cocl:BatchValidationRequest>`

          // Step 5: Call server
          const result = await client.validateBatch(scopeName, stageName, requestXmi)

          // Step 6: Convert diagnostics to Problems Panel messages
          const messages: any[] = []
          function collectDiagMessages(diag: any, instanceLabel: string) {
            if (diag.message && diag.type !== 'OK') {
              messages.push({
                severity: diag.type === 'ERROR' ? 'error' : diag.type === 'WARNING' ? 'warning' : 'info',
                message: diag.message,
                source: 'atlas-batch-validation',
                objectLabel: instanceLabel,
                eClassName: diag.source || ''
              })
            }
            for (const child of diag.children || []) {
              collectDiagMessages(child, instanceLabel)
            }
          }

          result.diagnostics.forEach((diag: any, i: number) => {
            // Extract instance label from data field if available
            const dataStr = diag.data?.[0] || ''
            const labelMatch = dataStr.match(/\(([^)]+)\)/) || dataStr.match(/impl\.(\w+)Impl/)
            const instanceLabel = labelMatch ? labelMatch[1] : `Instanz #${i + 1}`
            collectDiagMessages(diag, instanceLabel)
          })

          // Push results to Problems Panel
          const problemsService = context.services.get<any>('gene.problems')
          if (problemsService) {
            problemsService.clearIssuesBySource?.('atlas-batch-validation')
            for (const msg of messages) {
              problemsService.addIssue?.(msg)
            }
            if (messages.length > 0) {
              const eventBus = context.services.get<any>('gene.eventbus')
              eventBus?.emit?.('gene:show-problems')
            }
          }

          // Step 7: Build summary
          const totalInstances = result.diagnostics.length
          const failedInstances = result.diagnostics.filter((d: any) => d.type === 'ERROR' || d.type === 'WARNING').length
          const hasErrors = result.diagnostics.some((d: any) => d.type === 'ERROR')

          const summaryMsg = `Batch-Validierung: ${totalInstances} Instanz(en) gepruft, ${failedInstances} mit Fehlern`
          const status = failedInstances > 0 ? (hasErrors ? 'ERROR' : 'WARNING') : 'SUCCESS'

          return {
            status,
            logs: [{ message: summaryMsg, level: status === 'SUCCESS' ? 'INFO' : 'WARN', timestamp: new Date() }],
            artifacts: [{
              type: 'VALIDATION_MESSAGES',
              name: 'Batch Validation',
              data: messages,
              messages
            }]
          }
        } catch (e: any) {
          console.error('[BatchValidation] Error:', e)
          const problemsService = context.services.get<any>('gene.problems')
          problemsService?.addIssue?.({ severity: 'error', message: `Batch-Validierung fehlgeschlagen: ${e.message}`, source: 'atlas-batch-validation' })
          const eventBus = context.services.get<any>('gene.eventbus')
          eventBus?.emit?.('gene:show-problems')
          return { status: 'ERROR', logs: [{ message: `Batch validation failed: ${e.message}`, level: 'ERROR', timestamp: new Date() }], artifacts: [] }
        }
      }
    })

    /** Get a human-readable label for an EObject */
    function getInstanceLabel(obj: any): string {
      try {
        const eClass = obj.eClass?.()
        const className = eClass?.getName?.() || 'EObject'
        for (const attr of ['name', 'id', 'label', 'title']) {
          const f = eClass?.getEStructuralFeature?.(attr)
          if (f) {
            const v = obj.eGet(f)
            if (v && typeof v === 'string') return `${className} "${v}"`
          }
        }
        return className
      } catch { return 'EObject' }
    }

    /** Collect non-containment references recursively up to maxDepth */
    function collectReferences(obj: any, maxDepth: number, collected: Set<any>, currentDepth = 1): void {
      if (maxDepth !== -1 && currentDepth > maxDepth) return
      try {
        const eClass = obj.eClass?.()
        if (!eClass) return
        const features = eClass.getEAllStructuralFeatures?.() || eClass.getEStructuralFeatures?.() || []
        for (const feature of features) {
          // Skip containment references and attributes
          if (feature.isContainment?.() || !feature.getEType?.()?.eClass) continue
          // Only process EReferences
          const featureEClass = feature.eClass?.()
          if (!featureEClass || featureEClass.getName?.() !== 'EReference') continue

          const value = obj.eGet(feature)
          if (!value) continue

          if (typeof value[Symbol.iterator] === 'function') {
            for (const ref of value) {
              if (ref && !collected.has(ref)) {
                collected.add(ref)
                collectReferences(ref, maxDepth, collected, currentDepth + 1)
              }
            }
          } else if (typeof value === 'object' && value.eClass) {
            if (!collected.has(value)) {
              collected.add(value)
              collectReferences(value, maxDepth, collected, currentDepth + 1)
            }
          }
        }
      } catch {
        // Ignore errors during reference traversal
      }
    }

    actionRegistry.register({
      definition: {
        actionId: 'atlas.validate-batch',
        label: 'Batch-Validierung (alle Instanzen)',
        icon: 'pi pi-list-check',
        actionScope: 'GLOBAL',
        actionType: 'VALIDATION',
        handlerId: 'atlas.validate-batch.handler',
        order: 52,
        enabled: true,
        perspectiveIds: [],
        parameters: [],
        returnTypes: ['VALIDATION_MESSAGES']
      },
      source: 'plugin',
      moduleId: 'atlas-browser'
    })

    context.log.info('Atlas batch validation action registered (UC-OCL-009)')
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
