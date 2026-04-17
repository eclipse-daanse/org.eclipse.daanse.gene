<script setup lang="ts">
/**
 * Gene Application Root Component
 *
 * Two-stage EMF Editor with perspective switching:
 * 1. File Explorer Perspective - browse local filesystem, open workspace.xmi files
 * 2. Model Editor Perspective - edit EMF instances with model browser and properties panel
 */

import { ref, inject, computed, onMounted, shallowRef, watch, watchEffect, type Component, type ComputedRef, markRaw, defineComponent, h, provide } from 'tsm:vue'
import type { TsmPluginSystem } from '@/tsm'
import type { Resource } from 'tsm:emfts'
import { Dialog, InputText, Dropdown, Button, ProgressSpinner } from 'tsm:primevue'
import type { File, Repository } from 'storage-core'
import { getGlobalEditorConfig } from '@/services/useEditorConfig'
import { createAtlasURIConverter } from './services/atlasURIConverter'
import { ModelAtlasClient } from 'storage-model-atlas'
import { PackageResolverKind } from '@/generated/fennecui'
import { ProblemsPanel, useSharedProblemsService } from 'ui-problems-panel'
import { SearchDialog, setViewsService } from 'ui-search'

const OCL_SOURCES = ['http://www.eclipse.org/fennec/m2x/ocl/1.0', 'http://www.eclipse.org/emf/2002/Ecore/OCL', 'http://www.eclipse.org/OCL/Pivot']
function isOclSource(s: string | null | undefined): boolean { return !!s && OCL_SOURCES.includes(s) }
import type { PerspectiveManager } from 'ui-perspectives'
import { registerWorkspaceActions } from './services/WorkspaceActionService'
import type { WorkspaceActionService, FileEntryLike } from './services/WorkspaceActionService'

// EditorContext injection key (matches the one in editorContext.ts)
const EDITOR_CONTEXT_KEY = Symbol.for('gene:editorContext')

// Initialize OCL service
const problemsService = useSharedProblemsService()

// Get TSM instance from Vue injection
const tsm = inject<TsmPluginSystem>('tsm')!

// Layout component
const GeneLayout = shallowRef<Component | null>(null)

// Service refs
const layoutStateService = shallowRef<{ useLayoutState: () => any } | null>(null)
const perspectiveService = shallowRef<{
  usePerspective: () => any
  useSharedPerspective: () => any
  loadXMI?: (content: string, filePath: string) => Promise<any>
  saveToXMI?: (resource: any) => string
  useXMILoader?: () => any
} | null>(null)

// New registry-based perspective manager
const perspectiveManager = shallowRef<PerspectiveManager | null>(null)

// File explorer components
const fileExplorerComponents = shallowRef<{
  FileExplorer: Component
  WorkspacePreview: Component
} | null>(null)

// Model browser components
const modelBrowserComponents = shallowRef<{
  ModelBrowser: Component
} | null>(null)

// Instance tree components
const instanceTreeComponents = shallowRef<{
  InstanceTree: Component
} | null>(null)

// Properties panel components
const propertiesPanelComponents = shallowRef<{
  PropertiesPanel: Component
} | null>(null)

// Metamodeler components (MetamodelerEditor for editing EClass/EAttribute/EReference properties)
const metamodelerComponents = shallowRef<{
  MetamodelerEditor: Component
  MetamodelerTree: Component
  MetamodelerPerspective: Component
} | null>(null)


// Atlas Browser components (only AtlasUploadDialog needed for App-level overlay)
const atlasBrowserComponents = shallowRef<{
  AtlasUploadDialog?: Component
} | null>(null)

// Atlas Upload Dialog state
const showAtlasUploadDialog = ref(false)
const atlasUploadContent = ref('')
const atlasUploadFilename = ref('')

function openAtlasUploadDialog(content: string, filename: string) {
  atlasUploadContent.value = content
  atlasUploadFilename.value = filename
  showAtlasUploadDialog.value = true
}

// Register as TSM service for cross-plugin access
tsm.registerService('gene.atlas.openUpload', openAtlasUploadDialog)

// XMI Load result type
interface XMILoadResult {
  loadedCount: number
  errors: Array<{ message: string; line?: number; column?: number }>
}

// Instance loading state type
interface InstanceLoadingState {
  isLoading: { value: boolean }
  loadingName: { value: string }
}

// Instance tree composables (for setSharedResource, useSharedInstanceTree, and loadInstancesFromXMI)
const instanceTreeComposables = shallowRef<{
  setSharedResource: (resource: any) => void
  getSharedResource: () => any
  useSharedInstanceTree: () => ReturnType<typeof import('ui-instance-tree').useInstanceTree>
  loadInstancesFromXMI: (xmiContent: string, filePath: string) => Promise<XMILoadResult>
  getInstanceLoadingState?: () => InstanceLoadingState
} | null>(null)

// Model browser composables (for loadEcoreFile)
const modelBrowserComposables = shallowRef<{
  loadEcoreFile: (content: string, path: string) => Promise<any>
} | null>(null)

// Metamodeler composables
const metamodelerComposables = shallowRef<{
  useSharedMetamodeler: () => any
} | null>(null)

// Editor context functions (from instance-tree)
const editorContextService = shallowRef<{
  createInstanceContext: () => any
  createMetamodelContext: (metamodeler: any) => any
  provideEditorContext: (ctx: any) => void
  setEditorMode: (mode: 'instance' | 'metamodel') => void
  registerMetamodelContextFactory: (factory: () => any) => void
  EDITOR_CONTEXT_KEY: symbol
} | null>(null)

// Pre-created contexts (created once when services are available)
const instanceEditorContext = shallowRef<any>(null)
const metamodelEditorContext = shallowRef<any>(null)

// Workspace components (legacy)
const workspaceComponentsService = shallowRef<{ WorkspaceExplorer: Component } | null>(null)
const workspaceComposablesService = shallowRef<{
  useWorkspace: () => any
  useSharedWorkspace: () => any
} | null>(null)

// Get perspective state (legacy)
const perspective = computed(() => {
  const service = perspectiveService.value
  if (service) {
    return service.useSharedPerspective()
  }
  return null
})

// Current perspective ID - prefer perspectiveManager, fallback to legacy
const currentPerspective = computed(() => {
  if (perspectiveManager.value) {
    return perspectiveManager.value.state.currentPerspectiveId ?? 'explorer'
  }
  return perspective.value?.state.currentPerspective ?? 'explorer'
})

// Get workspace using the TSM-provided composable
const workspace = computed(() => {
  const composables = workspaceComposablesService.value
  if (composables) {
    return composables.useSharedWorkspace()
  }
  return null
})

// Selected file in file explorer (for workspace preview)
const selectedFile = ref<any | null>(null)

// --- WorkspaceActionService (singleton, available to all components) ---
// Note: isWorkspaceOpen computed is created lazily (currentWorkspaceEntry defined below)
let _isWorkspaceOpen: ComputedRef<boolean> | null = null
const workspaceActionsService: WorkspaceActionService = {
  loadModel: (entry, content) => handleModelAdd(entry, content),
  loadInstances: (entry, content) => handleInstanceAdd(entry, content),
  openWorkspace: (entry, content) => handleOpenWorkspace(entry, content),
  openMetamodelInEditor: (entry, content) => handleMetamodelEdit(entry, content),
  loadCoclFile: (entry, content) => handleCoclAdd(entry, content),
  loadTransformation: (entry, content) => handleTransformationLoad(entry, content),
  loadDmnFile: (entry, content) => handleDmnLoad(entry, content),
  publishToAtlas: (entry, content) => handleAtlasPublish(entry, content),
  selectObject: (obj) => handleObjectSelect(obj),
  selectFile: (file) => handleFileSelect(file),
  showProblemsPanel: () => handleShowProblems(),
  openSearchDialog: (options) => {
    if (options) {
      handleReferenceSearch(options.feature, options.resource, options.callback)
    } else {
      if (instanceTreeComposables.value?.getSharedResource) {
        const resource = instanceTreeComposables.value.getSharedResource()
        if (resource) {
          showSearchDialog.value = true
        }
      }
    }
  },
  createInstance: (classInfo) => handleCreateInstance(classInfo),
  get isWorkspaceOpen() {
    if (!_isWorkspaceOpen) {
      _isWorkspaceOpen = computed(() => !!currentWorkspaceEntry.value)
    }
    return _isWorkspaceOpen
  }
}
registerWorkspaceActions(workspaceActionsService, tsm)

// Search dialog visibility
const showSearchDialog = ref(false)

// Reference search state
const referenceSearchCallback = ref<((obj: any) => void) | null>(null)
const referenceSearchFeature = ref<any>(null)
const referenceSearchSourceObject = ref<any>(null)
const referenceSearchOclConstraint = ref<string | null>(null)
const searchResource = ref<any>(null)

/**
 * Extract OCL referenceFilter annotation from an EReference
 * Looks for annotation with source="http://www.eclipse.org/emf/2002/OCL" and key="referenceFilter"
 */
function getOclReferenceFilter(reference: any): string | null {
  try {
    const annotations = reference.getEAnnotations?.() || []

    for (const annotation of annotations) {
      // Get source using eGet (for DynamicEObject)
      const eClass = annotation.eClass?.()
      let source: string | undefined

      if (eClass) {
        const sourceFeature = eClass.getEStructuralFeature?.('source')
        if (sourceFeature) {
          source = annotation.eGet?.(sourceFeature) as string
        }
      }

      // Fallback to direct access
      if (!source) {
        source = annotation.getSource?.() ?? (annotation as any).source
      }

      if (isOclSource(source)) {
        // Get details using eGet
        let details: any = null
        if (eClass) {
          const detailsFeature = eClass.getEStructuralFeature?.('details')
          if (detailsFeature) {
            details = annotation.eGet?.(detailsFeature)
          }
        }

        // Fallback to direct access
        if (!details) {
          details = annotation.getDetails?.() ?? (annotation as any).details
        }

        if (details) {
          // Get entries from details.data (EList structure)
          const entries = details.data ?? details

          if (Array.isArray(entries)) {
            for (const entry of entries) {
              // The entry has eSettings Map with 'key' and 'value'
              const eSettings = entry?.eSettings
              if (eSettings instanceof Map) {
                const key = eSettings.get('key')
                const value = eSettings.get('value')

                if (key === 'referenceFilter') {
                  return value
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[App] Error getting OCL referenceFilter:', e)
  }
  return null
}

// Add repository dialog
const showAddRepoDialog = ref(false)
const repoName = ref('')
const repoType = ref('indexeddb')

// Model loading state
const isLoadingModel = ref(false)
const loadingModelName = ref('')

// Instance loading state (mirrored for reactivity)
const isLoadingInstance = ref(false)
const loadingInstanceName = ref('')

// Combined loading state (for central overlay)
const isLoading = computed(() => {
  const loading = isLoadingModel.value || isLoadingInstance.value
  if (loading) {
    console.log('[App] isLoading computed:', loading, 'model:', isLoadingModel.value, 'instance:', isLoadingInstance.value)
  }
  return loading
})

const loadingText = computed(() => {
  if (isLoadingModel.value) {
    return { title: 'Loading Model', name: loadingModelName.value }
  }
  if (isLoadingInstance.value) {
    return { title: 'Loading Instances', name: loadingInstanceName.value }
  }
  return { title: 'Loading...', name: '' }
})

const repoTypes = [
  { label: 'Browser (IndexedDB)', value: 'indexeddb' },
  { label: 'GitHub', value: 'github' }
]

async function handleAddRepository() {
  if (!repoName.value || !workspace.value) return

  if (repoType.value === 'indexeddb') {
    await workspace.value.addLocalRepository(repoName.value)
  }

  repoName.value = ''
  showAddRepoDialog.value = false
}

// Handle file selection in file explorer
function handleFileSelect(file: any) {
  console.log('App.vue handleFileSelect received:', file)
  selectedFile.value = file
}

// Handle opening a workspace (switch to model perspective)
/**
 * Register actions and event mappings from EditorConfig into the ActionRegistry/EventDispatcher
 */
function registerWorkspaceActionsFromConfig(editorConfig: any) {
  const actionRegistry = tsm.getService('gene.action.registry')
  const eventDispatcher = tsm.getService('gene.action.events')
  if (!actionRegistry) return

  // Unregister previous workspace actions
  actionRegistry.unregisterBySource('workspace')

  // Register actions from EditorConfig (both legacy quickActions and new actions)
  const config = editorConfig.config?.value
  if (!config) return

  const actions = config.actions || []
  const quickActions = config.quickActions || []

  for (const action of [...actions, ...quickActions]) {
    if (action.actionId) {
      actionRegistry.register({
        definition: action,
        source: 'workspace'
      })
    }
  }

  // Load event mappings
  if (eventDispatcher) {
    const mappings = config.eventMappings || []
    eventDispatcher.loadMappings(mappings)
  }

  console.log(`[App] Registered ${actions.length + quickActions.length} workspace actions, ${config.eventMappings?.length || 0} event mappings`)
}

async function handleOpenWorkspace(entry: any, content: string) {
  console.log('Opening workspace:', entry.name, 'content length:', content?.length)

  if (!perspective.value) {
    console.warn('Perspective service not available')
    return
  }

  try {
    console.log('XMI Content preview:', content?.substring(0, 200))

    // Load EditorConfig from workspace file
    const editorConfig = getGlobalEditorConfig()
    if (editorConfig) {
      try {
        await editorConfig.loadFromString(content, entry.path, entry)
        console.log('EditorConfig loaded from workspace:', entry.path)

        // Register workspace actions and event mappings from EditorConfig
        registerWorkspaceActionsFromConfig(editorConfig)
      } catch (e) {
        console.warn('Failed to load EditorConfig from workspace (may be empty or different format):', e)
        // Create new config if loading fails
        editorConfig.createNewConfig(entry.path)
        editorConfig.setFileEntry(entry)
      }
    } else {
      console.warn('EditorConfig service not available')
    }

    // Parse XMI content using emfts (for workspace metadata)
    const perspService = perspectiveService.value
    if (perspService?.loadXMI) {
      const resource = await perspService.loadXMI(content, entry.path)
      console.log('Loaded Workspace Resource:', resource)
      console.log('Root objects:', resource.getContents().length)

      // Store workspace in perspective state (NOT in instance tree!)
      // The Instance Tree is for USER model instances, not workspace metadata
      perspective.value.openWorkspace(resource, entry.path)

      // Update PerspectiveManager state WITHOUT triggering setupPerspectiveLayout
      // (App.vue manages the layout via setupModelEditorPerspective with context wrappers)
      if (perspectiveManager.value) {
        perspectiveManager.value.setWorkspace(resource, entry.path)
        perspectiveManager.value.setCurrentPerspectiveId('model-editor')
      }

      // Clear the instance tree - it should start empty for user instances
      if (instanceTreeComposables.value?.setSharedResource) {
        instanceTreeComposables.value.setSharedResource(null)
      }
    } else {
      console.warn('loadXMI not available in perspective service')
      perspective.value.openWorkspace(null, entry.path)

      // Update PerspectiveManager state WITHOUT triggering setupPerspectiveLayout
      if (perspectiveManager.value) {
        perspectiveManager.value.setWorkspace(null, entry.path)
        perspectiveManager.value.setCurrentPerspectiveId('model-editor')
      }
    }

    // Store workspace content and entry for later use (saving)
    workspaceContent.value = content
    currentWorkspaceEntry.value = entry

    // Force perspective setup
    if (layoutStateService.value) {
      const layout = layoutStateService.value.useLayoutState()
      setupModelEditorPerspective(layout)

      // Apply layout from EditorConfig (after perspective is set up)
      const editorConfigInstance = getGlobalEditorConfig()
      if (editorConfigInstance) {
        const layoutValues = editorConfigInstance.getLayoutValues()
        if (layoutValues) {
          console.log('[App] Applying layout from workspace:', layoutValues)
          layout.applyLayoutValues(
            layoutValues.dimensions,
            layoutValues.visibility,
            layoutValues.activeActivityId,
            layoutValues.panelPositions
          )
        }
      }
    }

    // Load models from EditorConfig (after perspective is set up)
    await loadModelsFromEditorConfig(entry)

    // Configure cascaded package resolver if configured
    await configureCascadeResolver()

    // Load instances from EditorConfig (after models are loaded)
    await loadInstancesFromEditorConfig(entry)
  } catch (e: any) {
    console.error('Failed to open workspace:', e)
  }
}

/**
 * Load models that were saved in EditorConfig.modelSources
 * Uses the file system to find and read the .ecore files
 */
async function loadModelsFromEditorConfig(workspaceEntry: any) {
  const editorConfig = getGlobalEditorConfig()
  if (!editorConfig) {
    console.log('[App] EditorConfig not available, skipping model loading')
    return
  }

  const modelSources = editorConfig.modelSources.value
  if (!modelSources || modelSources.length === 0) {
    console.log('[App] No model sources in EditorConfig')
    return
  }

  console.log('[App] Loading', modelSources.length, 'model(s) from EditorConfig')

  // Get the file system service
  const fileSystem = tsm.getService('gene.filesystem')
  if (!fileSystem) {
    console.warn('[App] File system not available for model loading')
    return
  }

  // Get the source ID from the workspace entry
  const sourceId = workspaceEntry.sourceId
  if (!sourceId) {
    console.warn('[App] No source ID on workspace entry')
    return
  }

  // Helper to get feature value from EObject
  function getFeatureValue(obj: any, featureName: string): any {
    if (obj[featureName] !== undefined) return obj[featureName]
    if (typeof obj.eGet === 'function') {
      const eClass = obj.eClass()
      const feature = eClass?.getEStructuralFeature(featureName)
      if (feature) return obj.eGet(feature)
    }
    return undefined
  }

  // Load each model source
  for (const source of modelSources) {
    const location = getFeatureValue(source, 'location')
    const enabled = getFeatureValue(source, 'enabled')

    if (!location || enabled === false) {
      console.log('[App] Skipping disabled or invalid model source:', location)
      continue
    }

    try {
      console.log('[App] Loading model from:', location)

      // Find the file entry by path
      const fileEntry = fileSystem.getFileByPath(sourceId, location)
      if (!fileEntry) {
        console.warn('[App] File not found:', location)
        continue
      }

      // Read the file content
      const content = await fileSystem.readTextFile(fileEntry)

      // Load the ecore file
      if (modelBrowserComposables.value?.loadEcoreFile) {
        const packageInfo = await modelBrowserComposables.value.loadEcoreFile(content, location)
        if (packageInfo) {
          console.log('[App] Model loaded from EditorConfig:', packageInfo.name)

          // Register package with OCL service for constraint validation
          if (packageInfo.ePackage) {
            await problemsService.registerPackage(packageInfo.ePackage)
            console.log('[App] Package registered with OCL service:', packageInfo.name)
          }
        }
      }
    } catch (e) {
      console.error('[App] Failed to load model:', location, e)
    }
  }
}

/**
 * Load instances that were saved in EditorConfig.instanceSources
 * Uses the file system to find and read the XMI files
 */
async function loadInstancesFromEditorConfig(workspaceEntry: any) {
  const editorConfig = getGlobalEditorConfig()
  if (!editorConfig) {
    console.log('[App] EditorConfig not available, skipping instance loading')
    return
  }

  // Get instanceSources from EditorConfig
  const instanceSources = editorConfig.instanceSources?.value
  if (!instanceSources || instanceSources.length === 0) {
    console.log('[App] No instance sources in EditorConfig')
    return
  }

  console.log('[App] Loading', instanceSources.length, 'instance file(s) from EditorConfig')

  // Get the file system service
  const fileSystem = tsm.getService('gene.filesystem')
  if (!fileSystem) {
    console.warn('[App] File system not available for instance loading')
    return
  }

  // Get the source ID from the workspace entry
  const sourceId = workspaceEntry.sourceId
  if (!sourceId) {
    console.warn('[App] No source ID on workspace entry')
    return
  }

  // Get workspace parent path for resolving relative paths
  const workspacePath = workspaceEntry.path
  const lastSlash = workspacePath?.lastIndexOf('/')
  const workspaceParentPath = lastSlash > 0 ? workspacePath.substring(0, lastSlash) : ''

  console.log('[App] Instance loading debug:', {
    workspacePath,
    lastSlash,
    workspaceParentPath,
    sourceId
  })

  // Debug: List available files in source
  const availableFiles = fileSystem.filesBySource?.get(sourceId)
  console.log('[App] Available files in source:', availableFiles?.map((f: any) => f.path))

  // Helper to get feature value from EObject
  function getFeatureValue(obj: any, featureName: string): any {
    if (obj[featureName] !== undefined) return obj[featureName]
    if (typeof obj.eGet === 'function') {
      const eClass = obj.eClass()
      const feature = eClass?.getEStructuralFeature(featureName)
      if (feature) return obj.eGet(feature)
    }
    return undefined
  }

  // Load each instance source
  for (const source of instanceSources) {
    const location = getFeatureValue(source, 'location') || getFeatureValue(source, 'path')
    const enabled = getFeatureValue(source, 'enabled')

    if (!location || enabled === false) {
      console.log('[App] Skipping disabled or invalid instance source:', location)
      continue
    }

    try {
      // Resolve relative path to absolute path
      const absolutePath = location.startsWith('/')
        ? location
        : workspaceParentPath
          ? `${workspaceParentPath}/${location}`
          : location

      console.log('[App] Loading instances from:', location, '-> resolved to:', absolutePath)

      // Find the file entry by path
      console.log('[App] Calling getFileByPath with sourceId:', sourceId, 'path:', absolutePath)
      let fileEntry = fileSystem.getFileByPath(sourceId, absolutePath)
      console.log('[App] getFileByPath result:', fileEntry)

      // Fallback: if not found and path has directory component, try just the filename
      if (!fileEntry && absolutePath.includes('/')) {
        const filename = absolutePath.split('/').pop()
        console.log('[App] Trying fallback with just filename:', filename)
        fileEntry = fileSystem.getFileByPath(sourceId, filename!)
        console.log('[App] Fallback getFileByPath result:', fileEntry)
      }

      if (!fileEntry) {
        console.warn('[App] Instance file not found:', absolutePath)
        continue
      }

      // Read the file content
      const content = await fileSystem.readTextFile(fileEntry)

      // Load the XMI file into the instance tree
      if (instanceTreeComposables.value?.loadInstancesFromXMI) {
        // Clear previous errors for this file
        problemsService.clearIssuesForFile(location)

        try {
          await instanceTreeComposables.value.loadInstancesFromXMI(content, location)
          console.log('[App] Instances loaded from:', location)
        } catch (loadErr: any) {
          console.error('[App] XMI parsing error:', location, loadErr)

          // Parse error message for line/column info
          const errorMsg = loadErr.message || String(loadErr)
          const lines = errorMsg.split('\n')

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            const lineColMatch = trimmed.match(/\[Line\s*(\d+),?\s*Col\s*(\d+)\]\s*(.*)/i)
            if (lineColMatch) {
              problemsService.addIssue({
                severity: 'error',
                message: lineColMatch[3] || trimmed,
                source: 'xmi-parser',
                objectLabel: location.split('/').pop() || location,
                eClassName: 'XMI Parser',
                filePath: location,
                line: parseInt(lineColMatch[1], 10),
                column: parseInt(lineColMatch[2], 10)
              })
            } else {
              problemsService.addIssue({
                severity: 'error',
                message: trimmed,
                source: 'xmi-parser',
                objectLabel: location.split('/').pop() || location,
                eClassName: 'XMI Parser',
                filePath: location
              })
            }
          }
        }
      } else {
        console.warn('[App] loadInstancesFromXMI not available')
      }
    } catch (e) {
      console.error('[App] Failed to load instances:', location, e)
    }
  }

  // Enable live OCL validation after all instances are loaded
  await enableLiveOclValidation()
}

/**
 * Configure cascaded package resolver from EditorConfig.packageResolverChain.
 * Sets up URIConverter on the ecore ResourceSet and resolves proxies.
 */
async function configureCascadeResolver() {
  const editorConfig = getGlobalEditorConfig()
  if (!editorConfig) return

  const chain = editorConfig.packageResolverChain?.value
  if (!chain) return

  // Helper to get feature value from EObject
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

  // Build Atlas providers from MODEL_ATLAS resolvers
  const providers: { client: ModelAtlasClient; scopeName: string; stage: string }[] = []

  for (const resolver of resolvers) {
    const kind = getVal(resolver, 'kind')
    const enabled = getVal(resolver, 'enabled') ?? true
    if (!enabled) continue

    if (kind === PackageResolverKind.MODEL_ATLAS || kind === 'MODEL_ATLAS') {
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

  if (providers.length === 0) {
    console.log('[CascadeResolver] No MODEL_ATLAS providers configured')
    return
  }

  // Get the ecore resource set from model browser
  const mbComposables = modelBrowserComposables.value
  const getRS = (mbComposables as any)?.getEcoreResourceSet
  if (!getRS) {
    console.warn('[CascadeResolver] getEcoreResourceSet not available')
    return
  }

  const rs = getRS()
  rs.setURIConverter(createAtlasURIConverter(providers))
  console.log(`[CascadeResolver] URIConverter configured with ${providers.length} Atlas provider(s)`)

  // Auto-resolve proxies if enabled
  if (autoResolve) {
    try {
      const resolved = await rs.resolveProxiesAsync(maxDepth)
      console.log(`[CascadeResolver] ${resolved} package(s) resolved from Atlas`)
    } catch (err) {
      console.warn('[CascadeResolver] Proxy resolution failed:', err)
    }
  }
}

/**
 * Enable live OCL validation on loaded instances.
 * Called after instance loading in loadInstancesFromEditorConfig-flow.
 */
async function enableLiveOclValidation() {
  // Enable live OCL validation on all loaded instances
  console.log('[App] Attempting to enable live OCL validation...')
  console.log('[App] instanceTreeComposables.value:', !!instanceTreeComposables.value)
  console.log('[App] getSharedResource exists:', !!instanceTreeComposables.value?.getSharedResource)

  if (instanceTreeComposables.value?.getSharedResource) {
    const resource = instanceTreeComposables.value.getSharedResource()
    console.log('[App] Got resource:', resource, 'contents:', resource?.getContents?.()?.length)
    if (resource) {
      // Attach live validation and run initial validation immediately
      const attached = await problemsService.attachTo(resource, { validateImmediately: true })
      console.log('[App] attachTo result:', attached)
      if (attached) {
        console.log('[App] Live OCL validation enabled for loaded instances')

        // Open Problems panel if there are errors
        if (problemsService.hasErrors.value) {
          console.log('[App] Validation errors found, opening Problems panel')
          if (layoutStateService.value) {
            const layout = layoutStateService.value.useLayoutState()
            layout.setPanelAreaVisible(true)
          }
        }
      }
      // Check for unresolved proxy references
      const proxyCount = await problemsService.checkUnresolvedProxies(resource)
      if (proxyCount > 0) {
        console.warn(`[App] Found ${proxyCount} unresolved proxy references`)
      }
    } else {
      console.warn('[App] No resource available for live validation')
    }
  }
}

// Workspace content (for later parsing)
const workspaceContent = ref<string | null>(null)

// Current workspace entry (for saving)
const currentWorkspaceEntry = ref<any | null>(null)

// Handle perspective change from activity bar
function handlePerspectiveChange(perspectiveId: string) {
  console.log('handlePerspectiveChange:', perspectiveId)

  if (!layoutStateService.value) {
    console.warn('Layout state service not available')
    return
  }

  const layout = layoutStateService.value.useLayoutState()

  // Update perspective manager state using proper method
  if (perspectiveManager.value) {
    perspectiveManager.value.setCurrentPerspectiveId(perspectiveId)
  }

  // Also update legacy perspective service
  if (perspective.value) {
    perspective.value.switchTo(perspectiveId)
  }

  // Set editor mode for context switching
  if (editorContextService.value?.setEditorMode) {
    if (perspectiveId === 'metamodeler') {
      editorContextService.value.setEditorMode('metamodel')
    } else if (perspectiveId === 'model-editor') {
      editorContextService.value.setEditorMode('instance')
    }
  }

  // Core perspectives have custom wrapper components with context/event bindings
  // These MUST use their App.vue setup functions, not PerspectiveManager.switchTo()
  if (perspectiveId === 'explorer') {
    setupFileExplorerPerspective(layout)
  } else if (perspectiveId === 'model-editor') {
    setupModelEditorPerspective(layout)
  } else if (perspectiveId === 'metamodeler') {
    setupMetamodelerPerspective(layout)
  } else if (perspectiveManager.value && perspectiveManager.value.registry.get(perspectiveId)) {
    // Plugin perspectives → delegate to PerspectiveManager.switchTo()
    perspectiveManager.value.switchTo(perspectiveId)
  } else {
    console.warn(`[App] Perspective '${perspectiveId}' not found in registry`)
  }
}

// Handle object selection in instance tree
function handleObjectSelect(obj: any) {
  // Properties panel updates automatically via shared state
}

// Handle search result selection - navigate to object or set reference
function handleSearchNavigate(hit: any) {
  // SearchHit has .object property with the actual EObject
  const obj = hit?.object || hit
  console.log('[App] Navigating to search result:', obj)

  // If this is reference search mode, call the callback instead of navigating
  if (referenceSearchCallback.value) {
    referenceSearchCallback.value(obj)
    referenceSearchCallback.value = null
    referenceSearchFeature.value = null
    referenceSearchSourceObject.value = null
    referenceSearchOclConstraint.value = null
    searchResource.value = null
    showSearchDialog.value = false
    return
  }

  // Regular navigation
  if (instanceTreeComposables.value) {
    const tree = instanceTreeComposables.value.useSharedInstanceTree()
    if (tree?.selectObject) {
      tree.selectObject(obj)
    }
  }
}

// Handle reference search request from PropertiesPanel
function handleReferenceSearch(feature: any, resource: any, callback: (obj: any) => void) {
  console.log('[App] Opening search for reference:', feature.getName())
  referenceSearchFeature.value = feature
  referenceSearchCallback.value = callback
  searchResource.value = resource

  // Get the source object (the object whose reference is being set)
  if (instanceTreeComposables.value) {
    const tree = instanceTreeComposables.value.useSharedInstanceTree()
    referenceSearchSourceObject.value = tree?.selectedObject?.value || null
  }

  // Extract OCL referenceFilter from annotation
  referenceSearchOclConstraint.value = getOclReferenceFilter(feature)
  if (referenceSearchOclConstraint.value) {
    console.log('[App] Found OCL referenceFilter:', referenceSearchOclConstraint.value)
  }

  showSearchDialog.value = true
}

// Handle show problems request (from OCL blocked assignment)
function handleShowProblems() {
  console.log('[App] Show problems panel requested')
  // Open bottom panel area and select problems tab
  if (layoutStateService.value) {
    const layout = layoutStateService.value.useLayoutState()
    layout.setPanelAreaVisible(true)
    layout.selectPanel('ocl-problems', 'panel')
  }
}

// Handle creating an instance from a class in Model Browser
function handleCreateInstance(classInfo: any) {
  console.log('Creating instance of class:', classInfo.name)

  if (!classInfo.eClass) {
    console.error('No eClass in classInfo')
    return
  }

  const eClass = classInfo.eClass

  // Create instance using factory
  const factory = eClass.getEPackage().getEFactoryInstance()
  const newObj = factory.create(eClass)

  console.log('Created instance:', newObj)

  // Add to instance tree
  if (instanceTreeComposables.value) {
    const tree = instanceTreeComposables.value.useSharedInstanceTree()
    if (tree?.addRootObject) {
      tree.addRootObject(newObj)
    }
  }
}

// Handle adding a model (.ecore file) to the workspace
async function handleModelAdd(entry: any, content: string) {
  console.log('[App] handleModelAdd called:', entry.name, 'content length:', content?.length)

  if (!modelBrowserComposables.value?.loadEcoreFile) {
    console.warn('Model browser composables not available')
    return
  }

  // Show loading indicator
  loadingModelName.value = entry.name
  isLoadingModel.value = true
  console.log('[App] Model loading started:', entry.name)

  // Wait for Vue to render the loading overlay
  await new Promise(resolve => setTimeout(resolve, 100))
  const startTime = Date.now()

  try {
    const packageInfo = await modelBrowserComposables.value.loadEcoreFile(content, entry.path)
    if (packageInfo) {
      console.log('Model loaded successfully:', packageInfo.name, packageInfo.nsURI)

      // Register package with OCL service for constraint validation
      if (packageInfo.ePackage) {
        await problemsService.registerPackage(packageInfo.ePackage)
        console.log('Package registered with OCL service:', packageInfo.name)
      }

      // Add to EditorConfig for persistence
      const editorConfig = getGlobalEditorConfig()
      if (editorConfig) {
        editorConfig.addModelSource(entry.path, packageInfo.name, {
          registerPackages: true,
          enabled: true
        })
        console.log('Model source added to EditorConfig:', entry.path)

        // Auto-save workspace if file entry is available
        const geneFS = tsm.getService('gene.filesystem')
        if (geneFS && editorConfig.workspaceFileEntry?.value) {
          try {
            await editorConfig.saveToFileSystem(async (fileEntry: any, content: string) => {
              await geneFS.writeTextFile(fileEntry, content)
            })
            console.log('Workspace auto-saved after adding model source')
          } catch (e) {
            console.warn('Failed to auto-save workspace:', e)
          }
        }
      }

      // Auto-reload failed XMI files now that model is available
      await reloadFailedInstanceFiles(entry.sourceId)
    } else {
      console.error('Failed to load model')
    }
  } catch (e: any) {
    console.error('Failed to add model:', e)
  } finally {
    // Hide loading indicator
    isLoadingModel.value = false
    loadingModelName.value = ''
  }
}

// Handle opening .ecore file in Metamodeler
async function handleMetamodelEdit(entry: any, content: string) {
  console.log('[App] Opening metamodel in editor:', entry.name)

  if (!metamodelerComposables.value?.useSharedMetamodeler) {
    console.warn('[App] Metamodeler composables not available')
    return
  }

  try {
    const metamodeler = metamodelerComposables.value.useSharedMetamodeler()

    // Get file handle for saving (if available from File System Access API)
    const fileHandle = entry.handle as FileSystemFileHandle | undefined

    // Load the .ecore file into the metamodeler
    const packageInfo = await metamodeler.loadFromEcoreString(content, entry.path, fileHandle)

    if (packageInfo) {
      console.log('[App] Metamodel loaded:', packageInfo.name, packageInfo.nsURI)

      // Switch to Metamodeler perspective using perspectiveManager
      if (perspectiveManager.value) {
        perspectiveManager.value.switchTo('metamodeler')
        console.log('[App] Switched to Metamodeler perspective')
      } else {
        console.warn('[App] PerspectiveManager not available')
      }
    } else {
      console.error('[App] Failed to load metamodel')
    }
  } catch (e: any) {
    console.error('[App] Failed to open metamodel:', e)
  }
}

// Handle publishing .ecore file to Atlas from FileExplorer
function handleAtlasPublish(entry: any, content: string) {
  openAtlasUploadDialog(content, entry.name)
}

// Register metamodel preview function as TSM service (used by Atlas Browser)
tsm.registerService('gene.metamodel.preview', (content: string, name: string) => {
  console.log('[App] Opening metamodel from Atlas:', name)
  handleMetamodelEdit({ name, path: `atlas://${name}.ecore` }, content)
})

/**
 * Reload XMI files that previously failed to load (due to missing models)
 */
async function reloadFailedInstanceFiles(sourceId: string) {
  // Get all XMI parser errors from the problems panel
  const xmiParserIssues = problemsService.issues.value.filter(
    (issue: any) => issue.source === 'xmi-parser'
  )

  if (xmiParserIssues.length === 0) {
    return
  }

  // Get unique file paths
  const failedFilePaths = [...new Set(xmiParserIssues.map((issue: any) => issue.filePath))]
  console.log('[App] Found', failedFilePaths.length, 'failed XMI file(s) to retry:', failedFilePaths)

  // Get file system
  const fileSystem = tsm.getService('gene.filesystem')
  if (!fileSystem) {
    console.warn('[App] File system not available for reloading')
    return
  }

  // Try to reload each failed file
  for (const filePath of failedFilePaths) {
    if (!filePath) continue

    try {
      // Find the file entry
      const fileEntry = fileSystem.getFileByPath(sourceId, filePath)
      if (!fileEntry) {
        // Try with just the filename
        const filename = filePath.split('/').pop()
        const altEntry = fileSystem.getFileByPath(sourceId, filename)
        if (!altEntry) {
          console.warn('[App] Could not find file to reload:', filePath)
          continue
        }
        // Read and reload
        const content = await fileSystem.readTextFile(altEntry)
        await handleInstanceAdd({ name: filename, path: filePath, sourceId }, content)
      } else {
        // Read and reload
        const content = await fileSystem.readTextFile(fileEntry)
        await handleInstanceAdd({ name: fileEntry.name, path: filePath, sourceId }, content)
      }
    } catch (e) {
      console.warn('[App] Failed to reload:', filePath, e)
    }
  }
}

// Handle adding instances (.xmi file) to the workspace
async function handleInstanceAdd(entry: any, content: string) {
  console.log('[App] Adding instances to workspace:', entry.name, 'content length:', content?.length)

  if (!instanceTreeComposables.value?.loadInstancesFromXMI) {
    console.warn('[App] Instance tree composables not available')
    return
  }

  // Clear previous errors for this file
  problemsService.clearIssuesForFile(entry.path)

  try {
    console.log('[App] Calling loadInstancesFromXMI...')
    const result = await instanceTreeComposables.value.loadInstancesFromXMI(content, entry.path)
    console.log('[App] Instances loaded from:', entry.name, 'count:', result.loadedCount, 'errors:', result.errors.length)

    // Check instance tree state after loading
    const tree = instanceTreeComposables.value.useSharedInstanceTree()
    console.log('[App] Instance tree after load - treeNodes:', tree.treeNodes.value?.length)

    // Report any parsing errors/warnings to Problems panel
    if (result.errors.length > 0) {
      const issues = result.errors.map(err => ({
        severity: result.loadedCount > 0 ? 'warning' as const : 'error' as const,
        message: err.message,
        source: 'xmi-parser' as const,
        objectLabel: entry.name,
        eClassName: 'XMI Parser',
        filePath: entry.path,
        line: err.line,
        column: err.column
      }))

      problemsService.addIssues(issues)
      console.log('[App] Added', issues.length, 'XMI parser issue(s) to Problems panel')

      // Show the panel area to make errors visible
      if (layoutStateService.value) {
        const layout = layoutStateService.value.useLayoutState()
        layout.setPanelAreaVisible(true)
      }
    }

    // Add to EditorConfig for persistence (only if some objects loaded)
    if (result.loadedCount > 0) {
      const editorConfig = getGlobalEditorConfig()
      if (editorConfig) {
        editorConfig.addInstanceSource(entry.path, entry.name, {
          enabled: true
        })
        console.log('Instance source added to EditorConfig:', entry.path)
      }

      // Enable live OCL validation on loaded objects and validate immediately
      console.log('[App] handleInstanceAdd - enabling live validation...')
      if (instanceTreeComposables.value?.getSharedResource) {
        const resource = instanceTreeComposables.value.getSharedResource()
        console.log('[App] handleInstanceAdd - resource:', resource, 'contents:', resource?.getContents?.()?.length)
        if (resource) {
          // Attach and validate immediately
          const attached = await problemsService.attachTo(resource, { validateImmediately: true })
          console.log('[App] handleInstanceAdd - attachTo result:', attached)
          if (attached) {
            console.log('[App] Live OCL validation enabled for loaded instances')

            // Open Problems panel if there are errors
            if (problemsService.hasErrors.value) {
              console.log('[App] Validation errors found, opening Problems panel')
              if (layoutStateService.value) {
                const layout = layoutStateService.value.useLayoutState()
                layout.setPanelAreaVisible(true)
              }
            }
          }
          // Check for unresolved proxy references
          const proxyCount = await problemsService.checkUnresolvedProxies(resource)
          if (proxyCount > 0) {
            console.warn(`[App] Found ${proxyCount} unresolved proxy references`)
          }
        } else {
          console.warn('[App] handleInstanceAdd - No resource for live validation')
        }
      }
    }
  } catch (e: any) {
    console.error('Failed to add instances:', e)

    // Parse error message to extract line/column info
    // Typical format: "[Line X, Col Y] message"
    const errorMsg = e.message || String(e)
    const issues: Array<{
      severity: 'error' | 'warning' | 'info'
      message: string
      source: 'xmi-parser'
      objectLabel: string
      eClassName: string
      filePath: string
      line?: number
      column?: number
    }> = []

    // Try to extract multiple errors from the message
    const lines = errorMsg.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Parse line/col info: [Line X, Col Y]
      const lineColMatch = trimmed.match(/\[Line\s*(\d+),?\s*Col\s*(\d+)\]\s*(.*)/i)
      if (lineColMatch) {
        issues.push({
          severity: 'error',
          message: lineColMatch[3] || trimmed,
          source: 'xmi-parser',
          objectLabel: entry.name,
          eClassName: 'XMI Parser',
          filePath: entry.path,
          line: parseInt(lineColMatch[1], 10),
          column: parseInt(lineColMatch[2], 10)
        })
      } else {
        // No line/col info, add as general error
        issues.push({
          severity: 'error',
          message: trimmed,
          source: 'xmi-parser',
          objectLabel: entry.name,
          eClassName: 'XMI Parser',
          filePath: entry.path
        })
      }
    }

    // Add issues to Problems panel
    if (issues.length > 0) {
      problemsService.addIssues(issues)
      console.log('[App] Added', issues.length, 'XMI parser error(s) to Problems panel')

      // Show the panel area to make errors visible
      if (layoutStateService.value) {
        const layout = layoutStateService.value.useLayoutState()
        layout.setPanelAreaVisible(true)
      }
    }
  }
}

// Handle adding C-OCL constraints (.c-ocl file) to the workspace
async function handleCoclAdd(entry: any, content: string) {
  console.log('[App] Adding C-OCL constraints to workspace:', entry.name, 'content length:', content?.length)

  try {
    // Load C-OCL file using the problems service
    const success = await problemsService.loadCoclFile(content, entry.path)

    if (success) {
      console.log('[App] C-OCL constraints loaded successfully:', entry.name)

      // Add info message about loaded constraints
      problemsService.addIssue({
        severity: 'info',
        message: `Loaded C-OCL constraints from ${entry.name}`,
        source: 'cocl-loader',
        objectLabel: entry.name,
        eClassName: 'C-OCL',
        filePath: entry.path
      })
    } else {
      console.error('[App] Failed to load C-OCL constraints:', entry.name)

      // Add error to problems panel
      problemsService.addIssue({
        severity: 'error',
        message: `Failed to load C-OCL constraints from ${entry.name}`,
        source: 'cocl-loader',
        objectLabel: entry.name,
        eClassName: 'C-OCL',
        filePath: entry.path
      })
    }

    // Store data for the C-OCL editor and switch to cocl-editor perspective
    tsm.registerService('gene.cocl.data', {
      content,
      filePath: entry.path,
      fileEntry: entry
    })
    console.log('[App] C-OCL data stored, switching to cocl-editor perspective')

    if (perspectiveManager.value) {
      perspectiveManager.value.switchTo('cocl-editor')
    }
  } catch (e: any) {
    console.error('[App] Error loading C-OCL file:', e)

    // Add error to problems panel
    problemsService.addIssue({
      severity: 'error',
      message: `Error loading C-OCL: ${e.message || String(e)}`,
      source: 'cocl-loader',
      objectLabel: entry.name,
      eClassName: 'C-OCL',
      filePath: entry.path
    })

    // Show the panel area to make errors visible
    if (layoutStateService.value) {
      const layout = layoutStateService.value.useLayoutState()
      layout.setPanelAreaVisible(true)
    }
  }
}

// Handle loading a QVT-R transformation (.qvtr file) into the Transformation Editor
async function handleTransformationLoad(entry: any, content: string) {
  console.log('[App] Loading transformation:', entry.name, 'content length:', content?.length)

  try {
    const data = JSON.parse(content)
    tsm.registerService('gene.transformation.data', data)
    console.log('[App] Transformation data stored, switching to transformation perspective')

    // Switch to transformation perspective
    if (perspectiveManager.value) {
      perspectiveManager.value.switchTo('transformation')
    }
  } catch (e: any) {
    console.error('[App] Failed to parse .qvtr file:', e)
  }
}

// Handle loading a .dmn file into the DMN Editor
async function handleDmnLoad(entry: any, content: string) {
  console.log('[App] Loading DMN file:', entry.name, 'content length:', content?.length)

  try {
    tsm.registerService('gene.dmn.data', {
      content,
      filePath: entry.path,
      fileEntry: entry,
      sourceId: entry.sourceId
    })
    console.log('[App] DMN data stored, switching to dmn-editor perspective')

    if (perspectiveManager.value) {
      perspectiveManager.value.switchTo('dmn-editor')
    }
  } catch (e: any) {
    console.error('[App] Failed to load DMN file:', e)
  }
}

// Setup perspectives
function setupFileExplorerPerspective(layout: any) {
  // Clear existing panels
  layout.clearAll()

  const FileExplorer = fileExplorerComponents.value?.FileExplorer
  const WorkspacePreview = fileExplorerComponents.value?.WorkspacePreview

  if (!FileExplorer || !WorkspacePreview) {
    console.warn('File explorer components not loaded')
    return
  }

  // Create wrapper for file explorer with event handlers
  const FileExplorerWrapper = defineComponent({
    setup() {
      // Track workspace open state reactively
      const isWorkspaceOpen = computed(() => {
        const isOpen = !!currentWorkspaceEntry.value
        console.log('[FileExplorerWrapper] workspaceOpen:', isOpen, 'entry:', currentWorkspaceEntry.value?.name)
        return isOpen
      })

      return () => h(FileExplorer, {
        workspaceOpen: isWorkspaceOpen.value,
        onFileSelect: handleFileSelect,
        onModelAdd: handleModelAdd,
        onInstanceAdd: handleInstanceAdd,
        onMetamodelEdit: handleMetamodelEdit,
        onCoclAdd: handleCoclAdd,
        onTransformationLoad: handleTransformationLoad,
        onDmnLoad: handleDmnLoad,
        onAtlasPublish: handleAtlasPublish
      })
    }
  })

  // Create wrapper for workspace preview with event handlers
  // Use watchEffect to make the wrapper reactive to selectedFile changes
  const WorkspacePreviewWrapper = defineComponent({
    setup() {
      // Create a local reactive copy that tracks the outer selectedFile
      const localSelectedFile = computed(() => selectedFile.value)

      return () => h(WorkspacePreview, {
        selectedFile: localSelectedFile.value,
        onOpenWorkspace: handleOpenWorkspace,
        onCoclAdd: handleCoclAdd
      })
    }
  })

  // Register file explorer panel
  layout.registerPanel({
    id: 'file-explorer',
    title: 'Explorer',
    icon: 'pi pi-folder',
    component: markRaw(FileExplorerWrapper),
    location: 'primary'
  })

  // Register activity for file explorer
  layout.registerActivity({
    id: 'file-explorer',
    icon: 'pi pi-folder',
    label: 'Explorer',
    tooltip: 'File Explorer',
    panel: 'file-explorer'
  })

  // Register workspace preview as editor content
  layout.openEditor({
    id: 'workspace-preview',
    title: 'Workspace',
    icon: 'pi pi-box',
    component: markRaw(WorkspacePreviewWrapper),
    props: {}
  })
}

function setupModelEditorPerspective(layout: any) {
  const ModelBrowser = modelBrowserComponents.value?.ModelBrowser
  const InstanceTree = instanceTreeComponents.value?.InstanceTree
  const PropertiesPanel = propertiesPanelComponents.value?.PropertiesPanel

  console.log('setupModelEditorPerspective - Components:', {
    ModelBrowser: !!ModelBrowser,
    InstanceTree: !!InstanceTree,
    PropertiesPanel: !!PropertiesPanel
  })

  if (!ModelBrowser || !InstanceTree || !PropertiesPanel) {
    console.warn('Model editor components not loaded - missing:', {
      ModelBrowser: !ModelBrowser,
      InstanceTree: !InstanceTree,
      PropertiesPanel: !PropertiesPanel
    })
    // Retry after a short delay (don't clearAll yet — leave current layout intact)
    setTimeout(() => {
      console.log('Retrying setupModelEditorPerspective...')
      if (layoutStateService.value) {
        setupModelEditorPerspective(layoutStateService.value.useLayoutState())
      }
    }, 500)
    return
  }

  // Use the pre-created instance context
  const context = instanceEditorContext.value
  if (!context) {
    console.warn('[App] Instance Editor context not yet created - retrying...')
    // Don't clearAll yet — leave current layout intact until ready
    setTimeout(() => {
      if (layoutStateService.value) {
        setupModelEditorPerspective(layoutStateService.value.useLayoutState())
      }
    }, 100)
    return
  }

  // All prerequisites met — now clear and set up the layout
  layout.clearAll()
  console.log('[App] Using Instance Editor context:', context.mode)

  // Create instance-editor-specific handler that uses the context
  const handleInstanceCreateInstance = (classInfo: any) => {
    console.log('[InstanceEditor] Creating instance of class:', classInfo.name)

    if (!classInfo.eClass) {
      console.error('[InstanceEditor] No eClass in classInfo')
      return
    }

    const eClass = classInfo.eClass

    // Create instance using factory
    const factory = eClass.getEPackage().getEFactoryInstance()
    const newObj = factory.create(eClass)

    console.log('[InstanceEditor] Created instance:', newObj)

    // Add to instance editor context's tree
    if (context?.addRootObject) {
      context.addRootObject(newObj)
      console.log('[InstanceEditor] Added to instance context')
    } else {
      console.warn('[InstanceEditor] No context.addRootObject available')
    }
  }

  // Create wrapper for instance tree with event handlers and context
  const InstanceTreeWrapper = defineComponent({
    setup() {
      return () => h(InstanceTree, {
        context: context,
        onObjectSelect: handleObjectSelect
      })
    }
  })

  // Create wrapper for model browser with event handlers and context
  const ModelBrowserWrapper = defineComponent({
    setup() {
      return () => h(ModelBrowser, {
        context: context,
        onCreateInstance: handleInstanceCreateInstance
      })
    }
  })

  // Create wrapper for properties panel with context
  const PropertiesPanelWrapper = defineComponent({
    setup() {
      return () => h(PropertiesPanel, {
        context: context,
        onSearch: handleReferenceSearch,
        onShowProblems: handleShowProblems
      })
    }
  })

  // Register instance tree panel (left/primary sidebar)
  layout.registerPanel({
    id: 'instance-tree',
    title: 'Instances',
    icon: 'pi pi-sitemap',
    component: markRaw(InstanceTreeWrapper),
    location: 'primary'
  })

  // Register activity for instance tree
  layout.registerActivity({
    id: 'instance-tree',
    icon: 'pi pi-sitemap',
    label: 'Instances',
    tooltip: 'Instance Tree',
    panel: 'instance-tree'
  })

  // Register model browser panel (right/secondary sidebar)
  layout.registerPanel({
    id: 'model-browser',
    title: 'Models',
    icon: 'pi pi-box',
    component: markRaw(ModelBrowserWrapper),
    location: 'secondary'
  })

  // Register activity for model browser
  layout.registerActivity({
    id: 'model-browser',
    icon: 'pi pi-box',
    label: 'Models',
    tooltip: 'Model Browser',
    panel: 'model-browser'
  })

  // Open properties in center (editor area)
  layout.openEditor({
    id: 'properties',
    title: 'Properties',
    icon: 'pi pi-sliders-h',
    component: markRaw(PropertiesPanelWrapper),
    closable: false
  })

  // Create wrapper for OCL panel with event handlers
  const ProblemsPanelWrapper = defineComponent({
    setup() {
      return () => h(ProblemsPanel, {
        onSelectObject: (obj: any) => {
          // Select object in instance tree when clicked in OCL panel
          if (instanceTreeComposables.value) {
            const tree = instanceTreeComposables.value.useSharedInstanceTree()
            if (tree?.selectObject) {
              tree.selectObject(obj)
            }
          }
        }
      })
    }
  })

  // Register OCL Problems panel in bottom panel area
  layout.registerPanelTab({
    id: 'ocl-problems',
    title: 'Problems',
    icon: 'pi pi-exclamation-triangle',
    component: markRaw(ProblemsPanelWrapper)
  })

  // Watch problems count and update badge
  watchEffect(() => {
    const count = problemsService.stats.value.totalCount
    layout.updateBadge('ocl-problems', count > 0 ? count : undefined)
  })

  // Auto-open panel area when new problems appear (count increases)
  watch(
    () => problemsService.stats.value.totalCount,
    (newCount, oldCount) => {
      if (newCount > (oldCount ?? 0)) {
        layout.setPanelAreaVisible(true)
        layout.selectPanel('ocl-problems', 'panel')
      }
    }
  )

  // Show both sidebars and select panels
  layout.setPrimarySidebarVisible(true)
  layout.setSecondarySidebarVisible(true)
  layout.selectPanel('instance-tree', 'primary')
  layout.selectPanel('model-browser', 'secondary')

  // Show panel area if there are validation errors
  if (problemsService.hasErrors.value) {
    layout.setPanelAreaVisible(true)
  }

  // Register search status bar item
  const SearchButton = defineComponent({
    setup() {
      return () => h('span', {
        style: { display: 'flex', alignItems: 'center', gap: '4px' }
      }, [
        h('i', { class: 'pi pi-search' }),
        ' Search'
      ])
    }
  })

  layout.registerStatusBarItem({
    id: 'search',
    content: markRaw(SearchButton),
    alignment: 'right',
    priority: 50,
    tooltip: 'Search instances (Ctrl+Shift+F)',
    onClick: () => {
      if (instanceTreeComposables.value?.getSharedResource) {
        const resource = instanceTreeComposables.value.getSharedResource()
        if (resource) {
          showSearchDialog.value = true
        }
      }
    }
  })

  console.log('Model editor perspective setup complete', {
    panels: layout.state.panels.map((p: any) => ({ id: p.id, location: p.location })),
    primaryPanels: layout.primaryPanels.value.length,
    secondaryPanels: layout.secondaryPanels.value.length,
    editorTabs: layout.state.editorTabs.length,
    visibility: { ...layout.state.visibility },
    activePrimary: layout.state.activePrimaryPanelId,
    activeSecondary: layout.state.activeSecondaryPanelId,
    overrides: Array.from(layout.state.panelPositionOverrides?.entries?.() || [])
  })

  // Trigger OCL validation if instances are loaded
  if (instanceTreeComposables.value?.getSharedResource) {
    const resource = instanceTreeComposables.value.getSharedResource()
    if (resource && resource.getContents?.()?.length > 0) {
      console.log('[App] Triggering OCL validation on perspective switch, objects:', resource.getContents().length)
      problemsService.attachTo(resource, { validateImmediately: true }).then(attached => {
        if (attached && problemsService.hasErrors.value) {
          console.log('[App] Validation errors found, showing Problems panel')
          if (layoutStateService.value) {
            layoutStateService.value.useLayoutState().setPanelAreaVisible(true)
          }
        }
      })
    }
  }
}

// Setup metamodeler perspective - uses MetamodelerTree instead of InstanceTree
function setupMetamodelerPerspective(layout: any) {
  // Try cached ref first, then fetch directly from TSM
  if (!metamodelerComponents.value) {
    const mc = tsm.getService<any>('ui.metamodeler.components')
    if (mc) {
      metamodelerComponents.value = mc
      console.log('[App] Metamodeler components loaded (on-demand)')
    }
  }
  if (!metamodelerComposables.value) {
    const mmc = tsm.getService<any>('ui.metamodeler.composables')
    if (mmc) {
      metamodelerComposables.value = mmc
      console.log('[App] Metamodeler composables loaded (on-demand)')
    }
  }

  // Get MetamodelerTree from plugin, PropertiesPanel for editing
  const MetamodelerTree = metamodelerComponents.value?.MetamodelerTree
  const ModelBrowser = modelBrowserComponents.value?.ModelBrowser
  const PropertiesPanel = propertiesPanelComponents.value?.PropertiesPanel

  // Get metamodeler and context services
  const metamodelerService = metamodelerComposables.value
  const contextService = editorContextService.value

  console.log('setupMetamodelerPerspective - Components:', {
    MetamodelerTree: !!MetamodelerTree,
    ModelBrowser: !!ModelBrowser,
    PropertiesPanel: !!PropertiesPanel
  })

  if (!MetamodelerTree || !ModelBrowser || !PropertiesPanel) {
    console.warn('Metamodeler components not loaded - missing:', {
      MetamodelerTree: !MetamodelerTree,
      ModelBrowser: !ModelBrowser,
      PropertiesPanel: !PropertiesPanel
    })
    // Retry after a short delay (don't clearAll — leave current layout intact)
    const retryCount = (setupMetamodelerPerspective as any).retryCount || 0
    if (retryCount < 10) {
      ;(setupMetamodelerPerspective as any).retryCount = retryCount + 1
      setTimeout(() => {
        console.log('Retrying setupMetamodelerPerspective... attempt', retryCount + 1)
        if (layoutStateService.value) {
          setupMetamodelerPerspective(layoutStateService.value.useLayoutState())
        }
      }, 500)
    } else {
      console.error('Failed to load Metamodeler components after 10 retries')
    }
    return
  }

  // Reset retry count on success
  ;(setupMetamodelerPerspective as any).retryCount = 0

  // All prerequisites met — now clear and set up the layout
  layout.clearAll()

  // Get or create metamodel context for ModelBrowser
  let context = metamodelEditorContext.value
  if (!context && metamodelerService && contextService?.createMetamodelContext) {
    const metamodeler = metamodelerService.useSharedMetamodeler()
    context = contextService.createMetamodelContext(metamodeler)
    metamodelEditorContext.value = context
    console.log('[App] Created Metamodel Editor context on-demand')
  }

  // Create metamodeler-specific handler that uses the context
  const handleMetamodelCreateInstance = (classInfo: any) => {
    console.log('[Metamodeler] Creating instance of class:', classInfo.name)

    if (!classInfo.eClass) {
      console.error('[Metamodeler] No eClass in classInfo')
      return
    }

    const eClass = classInfo.eClass

    // Create instance using factory
    const factory = eClass.getEPackage().getEFactoryInstance()
    const newObj = factory.create(eClass)

    console.log('[Metamodeler] Created instance:', newObj)

    // Add to metamodel context's tree
    if (context?.addRootObject) {
      context.addRootObject(newObj)
      console.log('[Metamodeler] Added to metamodel context')
    } else {
      console.warn('[Metamodeler] No context.addRootObject available')
    }
  }

  // Create wrapper for model browser with metamodel context
  const ModelBrowserWrapper = defineComponent({
    setup() {
      return () => h(ModelBrowser, {
        context: context,
        onCreateInstance: handleMetamodelCreateInstance
      })
    }
  })

  // Register MetamodelerTree panel (left/primary sidebar)
  layout.registerPanel({
    id: 'metamodeler-tree',
    title: 'Metamodel',
    icon: 'pi pi-sitemap',
    component: markRaw(MetamodelerTree),
    location: 'primary'
  })

  // Register activity for metamodeler tree
  layout.registerActivity({
    id: 'metamodeler-tree',
    icon: 'pi pi-sitemap',
    label: 'Metamodel',
    tooltip: 'Metamodel Tree',
    panel: 'metamodeler-tree'
  })

  // Register model browser panel (right/secondary sidebar) - shows Ecore types
  layout.registerPanel({
    id: 'model-browser',
    title: 'Ecore Types',
    icon: 'pi pi-box',
    component: markRaw(ModelBrowserWrapper),
    location: 'secondary'
  })

  // Register activity for model browser
  layout.registerActivity({
    id: 'model-browser',
    icon: 'pi pi-box',
    label: 'Ecore Types',
    tooltip: 'Available Ecore Types',
    panel: 'model-browser'
  })

  // Create wrapper for properties panel with metamodel context
  const PropertiesPanelWrapper = defineComponent({
    setup() {
      return () => h(PropertiesPanel, {
        context: context,
        onShowProblems: handleShowProblems
      })
    }
  })

  // Open PropertiesPanel in center (editor area)
  layout.openEditor({
    id: 'properties',
    title: 'Properties',
    icon: 'pi pi-sliders-h',
    component: markRaw(PropertiesPanelWrapper),
    closable: false
  })

  // Show both sidebars
  layout.setPrimarySidebarVisible(true)
  layout.setSecondarySidebarVisible(true)
  layout.setPanelAreaVisible(false)
  layout.selectPanel('metamodeler-tree', 'primary')
  layout.selectPanel('model-browser', 'secondary')

  console.log('Metamodeler perspective setup complete')
}

// Watch perspective changes
watch(currentPerspective, (perspectiveId, oldPerspectiveId) => {
  console.log('Perspective changed:', oldPerspectiveId, '->', perspectiveId)

  if (!layoutStateService.value) {
    console.warn('Layout state service not available for perspective switch')
    return
  }
  const layout = layoutStateService.value.useLayoutState()

  // Core perspectives need their App.vue setup functions (wrapper components with context)
  if (perspectiveId === 'explorer') {
    setupFileExplorerPerspective(layout)
  } else if (perspectiveId === 'model-editor') {
    setupModelEditorPerspective(layout)
  } else if (perspectiveId === 'metamodeler') {
    setupMetamodelerPerspective(layout)
  } else if (perspectiveManager.value && perspectiveManager.value.registry.get(perspectiveId)) {
    perspectiveManager.value.switchTo(perspectiveId)
  }
}, { immediate: false })

// Poll for services and update refs
onMounted(() => {
  let initialSetupDone = false
  let metamodelContextRegistered = false

  // Register global keyboard shortcut for search (Ctrl+Shift+F)
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault()
      openSearchDialogIfPossible()
    }
  }
  document.addEventListener('keydown', handleKeydown)

  // Listen for events from EventBus via TSM service
  function getOrCreateEventBus() {
    let bus = tsm.getService<any>('gene.eventbus')
    if (!bus) {
      const listeners = new Map<string, Set<Function>>()
      bus = {
        on(event: string, callback: Function) {
          if (!listeners.has(event)) listeners.set(event, new Set())
          listeners.get(event)!.add(callback)
        },
        off(event: string, callback: Function) {
          listeners.get(event)?.delete(callback)
        },
        emit(event: string, ...args: any[]) {
          for (const cb of listeners.get(event) || []) cb(...args)
        }
      }
      tsm.registerService('gene.eventbus', bus)
    }
    return bus
  }
  const eventBus = getOrCreateEventBus()
  const handleOpenSearchDialog = () => {
    openSearchDialogIfPossible()
  }
  eventBus.on('open-search-dialog', handleOpenSearchDialog)
  eventBus.on('show-problems', handleShowProblems)

  // Helper to open search dialog if resource is available
  function openSearchDialogIfPossible() {
    if (instanceTreeComposables.value?.getSharedResource) {
      const resource = instanceTreeComposables.value.getSharedResource()
      if (resource) {
        showSearchDialog.value = true
      }
    }
  }

  const interval = setInterval(() => {
    // Check for layout components
    if (!GeneLayout.value) {
      const layoutComponents = tsm.getService<{ GeneLayout: Component }>('ui.layout.components')
      if (layoutComponents?.GeneLayout) {
        ;(GeneLayout as { value: Component | null }).value = layoutComponents.GeneLayout
      }
    }

    // Check for layout state
    if (!layoutStateService.value) {
      const state = tsm.getService<{ useLayoutState: () => any }>('ui.layout.state')
      if (state) {
        layoutStateService.value = state
        // Expose for cross-plugin access (e.g. Atlas Browser opening tabs)
        tsm.registerService('gene.layout.service', state)
      }
    }

    // Check for perspective service (legacy)
    if (!perspectiveService.value) {
      const perspService = tsm.getService<any>('ui.perspectives')
      if (perspService) {
        perspectiveService.value = perspService
      }
    }

    // Check for perspective manager (new registry-based)
    if (!perspectiveManager.value) {
      const pm = tsm.getService<PerspectiveManager>('ui.registry.perspectives')
      if (pm) {
        perspectiveManager.value = pm
        console.log('[App] PerspectiveManager loaded, perspectives:', pm.registry.getAll().map(p => p.id))
      }
    }

    // Check for file explorer components
    if (!fileExplorerComponents.value) {
      const fec = tsm.getService<any>('ui.file-explorer.components')
      if (fec) {
        fileExplorerComponents.value = fec
      }
    }

    // Check for model browser components
    if (!modelBrowserComponents.value) {
      const mbc = tsm.getService<any>('ui.model-browser.components')
      if (mbc) {
        modelBrowserComponents.value = mbc
      }
    }

    // Check for instance tree components
    if (!instanceTreeComponents.value) {
      const itc = tsm.getService<any>('ui.instance-tree.components')
      if (itc) {
        instanceTreeComponents.value = itc
      }
    }

    // Check for properties panel components
    if (!propertiesPanelComponents.value) {
      const ppc = tsm.getService<any>('ui.properties-panel.components')
      if (ppc) {
        propertiesPanelComponents.value = ppc
      }
    }

    // Check for instance tree composables
    if (!instanceTreeComposables.value) {
      const itcs = tsm.getService<any>('ui.instance-tree.composables')
      if (itcs) {
        instanceTreeComposables.value = itcs
        // Set up watch to mirror instance loading state for reactivity
        if (itcs.getInstanceLoadingState) {
          const loadState = itcs.getInstanceLoadingState()
          watchEffect(() => {
            isLoadingInstance.value = loadState.isLoading.value
            loadingInstanceName.value = loadState.loadingName.value
            if (loadState.isLoading.value) {
              console.log('[App] Instance loading started:', loadState.loadingName.value)
            }
          })
        }
      }
    }

    // Check for model browser composables
    if (!modelBrowserComposables.value) {
      const mbcs = tsm.getService<any>('ui.model-browser.composables')
      if (mbcs) {
        modelBrowserComposables.value = mbcs
      }
    }

    // Check for metamodeler composables (from plugin)
    if (!metamodelerComposables.value) {
      const mmc = tsm.getService<any>('ui.metamodeler.composables')
      if (mmc) {
        metamodelerComposables.value = mmc
        console.log('[App] Metamodeler composables loaded')
      }
    }

    // Check for metamodeler components (from plugin)
    if (!metamodelerComponents.value) {
      const mc = tsm.getService<any>('ui.metamodeler.components')
      if (mc) {
        metamodelerComponents.value = mc
        console.log('[App] Metamodeler components loaded')
      }
    }

    // Check for Atlas Browser components (from plugin)
    if (!atlasBrowserComponents.value) {
      const abc = tsm.getService<any>('ui.atlas-browser.components')
      if (abc) {
        atlasBrowserComponents.value = abc
        console.log('[App] Atlas Browser components loaded')
      }
    }

    // Check for editor context service (from instance-tree)
    if (!editorContextService.value) {
      const contextService = tsm.getService<any>('ui.instance-tree.context')
      if (contextService) {
        editorContextService.value = contextService
        console.log('[App] EditorContext service loaded')
      }
    }

    // Create Instance Editor context (once, when service is available)
    if (!instanceEditorContext.value && editorContextService.value?.createInstanceContext) {
      instanceEditorContext.value = editorContextService.value.createInstanceContext()
      // Register factory for getCurrentContext() support
      if (editorContextService.value.registerInstanceContextFactory) {
        editorContextService.value.registerInstanceContextFactory(() => instanceEditorContext.value)
      }
      console.log('[App] Instance Editor context created')
    }

    // Create Metamodel Editor context (once, when both services are available)
    if (!metamodelEditorContext.value && editorContextService.value?.createMetamodelContext && metamodelerComposables.value) {
      const metamodeler = metamodelerComposables.value.useSharedMetamodeler()
      metamodelEditorContext.value = editorContextService.value.createMetamodelContext(metamodeler)
      // Register factory for getCurrentContext() support
      if (editorContextService.value.registerMetamodelContextFactory) {
        editorContextService.value.registerMetamodelContextFactory(() => metamodelEditorContext.value)
      }
      console.log('[App] Metamodel Editor context created')
    }

    // Check for workspace components (legacy)
    if (!workspaceComponentsService.value) {
      const wc = tsm.getService<{ WorkspaceExplorer: Component }>('ui.workspace.components')
      if (wc) {
        workspaceComponentsService.value = wc
      }
    }

    // Check for workspace composables
    if (!workspaceComposablesService.value) {
      const wcs = tsm.getService<{ useWorkspace: () => any; useSharedWorkspace: () => any }>('ui.workspace.composables')
      if (wcs) {
        workspaceComposablesService.value = wcs
      }
    }

    // Initial perspective setup
    if (!initialSetupDone && layoutStateService.value && fileExplorerComponents.value) {
      initialSetupDone = true
      const layout = layoutStateService.value.useLayoutState()

      // Start with file explorer perspective
      if (perspectiveManager.value && perspectiveManager.value.registry.get('explorer')) {
        perspectiveManager.value.switchTo('explorer')
      } else {
        // Fallback: set up manually if registry not yet populated
        if (perspectiveManager.value) {
          ;(perspectiveManager.value.state as any).currentPerspectiveId = 'explorer'
        }
        setupFileExplorerPerspective(layout)
      }

      // Register status bar items
      layout.registerStatusBarItem({
        id: 'perspective',
        content: currentPerspective.value === 'explorer' ? 'Explorer' : currentPerspective.value === 'model-editor' ? 'Model Editor' : 'Metamodeler',
        alignment: 'left',
        priority: 100
      })
    }

    // Stop polling when ALL services are ready (including model editor components)
    const allServicesReady =
      GeneLayout.value &&
      layoutStateService.value &&
      initialSetupDone &&
      modelBrowserComponents.value &&
      instanceTreeComponents.value &&
      propertiesPanelComponents.value &&
      modelBrowserComposables.value

    if (allServicesReady) {
      console.log('All services loaded, stopping polling')
      clearInterval(interval)
    }
  }, 100)

  // Stop polling after 10 seconds
  setTimeout(() => clearInterval(interval), 10000)
})
</script>

<template>
  <component
    v-if="GeneLayout"
    :is="GeneLayout"
    @perspective-change="handlePerspectiveChange"
  >
    <template #welcome-actions>
      <p class="welcome-hint">
        Open a folder to browse for workspace files.
      </p>
    </template>
  </component>

  <!-- Fallback layout when ui-layout not loaded -->
  <div v-else class="fallback-layout">
    <div class="loading-message">
      <i class="pi pi-spin pi-spinner"></i>
      <span>Loading layout...</span>
    </div>
  </div>

  <!-- Search Dialog -->
  <SearchDialog
    v-if="searchResource || instanceTreeComposables?.getSharedResource?.()"
    :visible="showSearchDialog"
    :resource="searchResource || instanceTreeComposables?.getSharedResource()"
    :referenceOptions="referenceSearchFeature ? {
      sourceObject: referenceSearchSourceObject,
      reference: referenceSearchFeature,
      oclConstraint: referenceSearchOclConstraint
    } : undefined"
    :problemsService="problemsService"
    @close="showSearchDialog = false; referenceSearchCallback = null; referenceSearchFeature = null; referenceSearchSourceObject = null; referenceSearchOclConstraint = null; searchResource = null"
    @select="handleSearchNavigate"
    @navigate="handleSearchNavigate"
  />

  <!-- Add Repository Dialog -->
  <Dialog
    v-model:visible="showAddRepoDialog"
    header="Add Repository"
    :modal="true"
    :style="{ width: '400px' }"
  >
    <div class="dialog-content">
      <div class="field">
        <label for="repoName">Name</label>
        <InputText
          id="repoName"
          v-model="repoName"
          placeholder="Repository name"
          class="w-full"
        />
      </div>
      <div class="field">
        <label for="repoType">Type</label>
        <Dropdown
          id="repoType"
          v-model="repoType"
          :options="repoTypes"
          optionLabel="label"
          optionValue="value"
          class="w-full"
        />
      </div>
    </div>
    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        @click="showAddRepoDialog = false"
      />
      <Button
        label="Add"
        @click="handleAddRepository"
      />
    </template>
  </Dialog>

  <!-- Atlas Upload Dialog -->
  <component
    v-if="atlasBrowserComponents?.AtlasUploadDialog"
    :is="atlasBrowserComponents.AtlasUploadDialog"
    v-model:visible="showAtlasUploadDialog"
    :content="atlasUploadContent"
    :filename="atlasUploadFilename"
  />

  <!-- Central Loading Overlay with Blur -->
  <div v-if="isLoading" class="loading-overlay">
    <div class="loading-content">
      <ProgressSpinner
        style="width: 50px; height: 50px"
        strokeWidth="4"
        animationDuration=".8s"
      />
      <div class="loading-text">
        <span class="loading-title">{{ loadingText.title }}</span>
        <span class="loading-name">{{ loadingText.name }}</span>
      </div>
    </div>
  </div>
</template>

<style>
/*
 * Global CSS Variables for PrimeVue 4
 * PrimeVue 4 uses CSS-in-JS and doesn't expose global variables by default.
 * We define them here for use in our custom components.
 */
:root {
  /* Surface colors (light theme) */
  --surface-ground: #f8fafc;
  --surface-section: #f1f5f9;
  --surface-card: #ffffff;
  --surface-border: #e2e8f0;
  --surface-hover: rgba(0, 0, 0, 0.04);

  /* Primary colors (Indigo) */
  --primary-color: #6366f1;
  --primary-color-text: #ffffff;

  /* Text colors */
  --text-color: #1e293b;
  --text-color-secondary: #64748b;

  /* Border radius */
  --border-radius: 6px;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.fallback-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--surface-ground, #f8fafc);
}

.loading-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: var(--text-color-secondary, #64748b);
}

.loading-message i {
  font-size: 2rem;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-weight: 500;
  color: var(--text-color, #1e293b);
}

.w-full {
  width: 100%;
}

.welcome-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

/* Loading Overlay Styles */
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.loading-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.loading-title {
  font-weight: 600;
  color: var(--text-color, #1e293b);
}

.loading-name {
  font-size: 0.875rem;
  color: var(--text-color-secondary, #64748b);
  font-family: monospace;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
