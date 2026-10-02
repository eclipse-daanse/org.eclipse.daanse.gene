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
import { ProblemsPanel, useSharedProblemsService } from 'ui-problems-panel'
import { SearchDialog, setViewsService } from 'ui-search'
import type { CommandRegistryImpl } from 'ui-actions'

const OCL_SOURCES = ['http://www.eclipse.org/fennec/m2x/ocl/1.0', 'http://www.eclipse.org/emf/2002/Ecore/OCL', 'http://www.eclipse.org/OCL/Pivot']
function isOclSource(s: string | null | undefined): boolean { return !!s && OCL_SOURCES.includes(s) }
import type { PerspectiveManager } from 'ui-perspectives'
import { registerWorkspaceActions } from './services/WorkspaceActionService'
import { createTabLayout, type TabLayoutService } from './layout/tabLayout'
import { prepareAtlasResolution, registerUsedModels } from './services/atlasResolution'
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
const atlasUploadKind = ref<'schema' | 'object'>('schema')

function openAtlasUploadDialog(
  content: string,
  filename: string,
  kind: 'schema' | 'object' = 'schema'
) {
  // Die Dialog-Komponente kommt aus dem Atlas-Browser-Plugin. Sie wird sonst
  // nur vom Service-Polling eingesammelt, das stoppt, sobald die Kern-Module
  // stehen — lädt atlas-browser danach, blieb der Dialog für immer leer und
  // „Publish to Atlas" wirkungslos. Deshalb hier nachziehen.
  if (!atlasBrowserComponents.value) {
    const abc = tsm.getService<any>('ui.atlas-browser.components')
    if (abc) atlasBrowserComponents.value = abc
  }
  if (!atlasBrowserComponents.value?.AtlasUploadDialog) {
    console.warn('[App] Atlas Browser plugin not loaded — cannot open upload dialog')
    return
  }
  atlasUploadContent.value = content
  atlasUploadFilename.value = filename
  atlasUploadKind.value = kind
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
      handleReferenceSearch(options.feature, options.resource, options.callback, options.candidates)
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
  merkeEditorWahl: (zuordnung) => {
    const editorConfig = getGlobalEditorConfig()
    if (!editorConfig?.merkeEditorWahl?.(zuordnung)) return
    // Die Registry arbeitet sofort damit, gespeichert wird mit dem Workspace
    tsm.getService<any>('gene.editor.context')?.setEditorZuordnungen?.(
      editorConfig.editorBindings?.value ?? []
    )
  },
  get isWorkspaceOpen() {
    if (!_isWorkspaceOpen) {
      _isWorkspaceOpen = computed(() => !!currentWorkspaceEntry.value)
    }
    return _isWorkspaceOpen
  }
}
registerWorkspaceActions(workspaceActionsService, tsm)

/*
 * Die Dateiansichten stehen nicht mehr hier.
 *
 * Jede ist eine Komponente in `./editors` und meldet sich unter
 * `gene.editor.art` an; die Sammelstelle in ui-instance-tree nimmt sie. Damit
 * entfaellt auch das Warten auf den Kontext-Dienst: Eine Anmeldung, die auf
 * einen noch fehlenden Dienst traf, fiel bisher still aus.
 */

// Command Palette
const commandPaletteRef = ref<any>(null)
const commandRegistryRef = shallowRef<CommandRegistryImpl | null>(null)

// Action Approval Dialog
const approvalDialogRef = ref<any>(null)
const approvalDialogProps = ref<{
  resultStatus: string
  resultMessage: string
  actions: Array<{ commandId: string; label: string; description?: string; args?: string; autoExecute?: boolean }>
}>({ resultStatus: '', resultMessage: '', actions: [] })
const pendingArtifacts = ref<any[]>([])

// XMI Import Dialog
const xmiImportDialogRef = ref<any>(null)
const xmiImportProps = ref<{ xmiContent: string; name: string }>({ xmiContent: '', name: '' })

// Save-validation confirm dialog (Metamodeler): shown when saving with errors
const saveConfirmVisible = ref(false)
const saveConfirmInfo = ref<{ errorCount: number; totalCount: number }>({ errorCount: 0, totalCount: 0 })
let saveConfirmResolve: ((proceed: boolean) => void) | null = null

function resolveSaveConfirm(proceed: boolean) {
  saveConfirmVisible.value = false
  const resolve = saveConfirmResolve
  saveConfirmResolve = null
  resolve?.(proceed)
}

// Metamodel load-error feedback + legacy-ecore repair prompt
const repairPromptVisible = ref(false)
const repairPromptName = ref('')
let repairPending: { entry: any; content: string; fileHandle?: any } | null = null
const metamodelLoadErrorVisible = ref(false)
const metamodelLoadError = ref<{ name: string; message: string }>({ name: '', message: '' })

// User chose to repair a legacy .ecore (absolute self-hrefs) and reload it.
async function resolveRepairPrompt(doRepair: boolean) {
  repairPromptVisible.value = false
  const pending = repairPending
  repairPending = null
  if (!doRepair || !pending) return

  const mb = modelBrowserComposables.value as any
  const mm = metamodelerComposables.value as any
  try {
    const repaired = mb.repairLegacyEcoreHrefs(pending.content)
    // Clear stale registrations (local + global) for this file first, so the
    // fresh parse of the repaired content builds a fully-local object graph
    // instead of reusing the old (foreign) package instances — otherwise the
    // re-serialized model would still emit absolute nsURI hrefs.
    try { mb.unregisterModelBySourceFile?.(pending.entry.path) } catch { /* no-op */ }
    const metamodeler = mm.useSharedMetamodeler()
    const info = await metamodeler.loadFromEcoreString(repaired, pending.entry.path, pending.fileHandle)
    if (info) {
      // Repaired only in memory — mark dirty so the user can persist the clean form.
      try { metamodeler.dirty.value = true } catch { /* no-op */ }
      // Ein Tab statt eines Perspektivwechsels — die Datei ist offen, nicht die Ansicht
      oeffneMetamodellTab(`metamodel:${pending.entry.path}`, pending.entry.name || 'Metamodell', metamodeler)
    } else {
      showMetamodelLoadError(pending.entry, 'Reparatur hat das Laden nicht ermöglicht.')
    }
  } catch (e: any) {
    showMetamodelLoadError(pending.entry, String(e?.message ?? e))
  }
}

function showMetamodelLoadError(entry: any, message: string) {
  metamodelLoadError.value = { name: entry?.name || entry?.path || 'Metamodell', message }
  metamodelLoadErrorVisible.value = true
}

// Registers the styled confirm handler on the metamodeler composable so that
// saving a metamodel with validation errors prompts the user instead of using
// the native confirm(). Safe to call repeatedly.
function registerMetamodelerSaveConfirm() {
  const comp = metamodelerComposables.value as any
  if (!comp?.setMetamodelerConfirmSaveHandler) return
  comp.setMetamodelerConfirmSaveHandler((info: { errorCount: number; totalCount: number }) => {
    return new Promise<boolean>((resolve) => {
      // Resolve any previous pending prompt as cancelled
      saveConfirmResolve?.(false)
      saveConfirmInfo.value = info
      saveConfirmResolve = resolve
      saveConfirmVisible.value = true
    })
  })
}

function getCommandContext() {
  const pm = perspectiveManager.value
  return {
    perspectiveId: pm?.state?.currentPerspectiveId || 'explorer',
    hasWorkspace: !!pm?.state?.workspace,
    hasSelection: false,
    editorMode: 'instance'
  }
}

// Listen for gene:openCommandPalette event
onMounted(() => {
  document.addEventListener('gene:openCommandPalette', () => {
    commandPaletteRef.value?.open()
  })
})

function handleProposedActions(data: any) {
  approvalDialogProps.value = {
    resultStatus: data.resultStatus || 'SUCCESS',
    resultMessage: data.resultMessage || 'Action completed',
    actions: data.proposedActions || []
  }
  pendingArtifacts.value = data.artifacts || []
  setTimeout(() => approvalDialogRef.value?.open(), 50)
}

function handleShowImportDialog(data: any) {
  xmiImportProps.value = {
    xmiContent: data.xmiContent || '',
    name: data.name || 'Action Result'
  }
  setTimeout(() => xmiImportDialogRef.value?.open(), 50)
}

// Poll for commandRegistry
watchEffect(() => {
  if (!commandRegistryRef.value) {
    const cr = tsm.getService<any>('gene.command.registry')
    if (cr) commandRegistryRef.value = cr
  }
})

// Register the styled metamodeler save-confirm handler as soon as the
// composables are available (earlier than perspective setup) so even a
// restore-time save shows the dialog instead of the native fallback.
watchEffect(() => {
  if (metamodelerComposables.value) registerMetamodelerSaveConfirm()
})

// Search dialog visibility
const showSearchDialog = ref(false)

// Reference search state
const referenceSearchCallback = ref<((obj: any) => void) | null>(null)
const referenceSearchFeature = ref<any>(null)
const referenceSearchSourceObject = ref<any>(null)
const referenceSearchOclConstraint = ref<string | null>(null)
const searchResource = ref<any>(null)
const referenceSearchCandidates = ref<any[] | null>(null)

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

        /*
         * Welche Ansicht welche Datei oeffnet, steht im Workspace. Die Registry
         * entscheidet sonst selbst — ein Eintrag hier ist die Entscheidung des
         * Nutzers und geht vor.
         */
        const ctxSvc = tsm.getService<any>('gene.editor.context')
        ctxSvc?.setEditorZuordnungen?.(editorConfig.editorBindings?.value ?? [])

        // Notify plugins that workspace has been loaded
        window.dispatchEvent(new CustomEvent('gene:workspace-loaded'))
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

    /*
     * Kein Aufbau mehr beim Oeffnen: Die Flaeche steht seit dem Start. Was der
     * Workspace mitbringt, sind Groessen und Sichtbarkeiten — die werden
     * angewandt, mehr nicht.
     */
    if (layoutStateService.value) {
      const layout = layoutStateService.value.useLayoutState()
      baueArbeitsflaeche(layout)

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

  // Wire the referenced-resource file reader so a "standalone" load can auto-load
  // cross-referenced instance resources on demand (multi-resource, Phase 3).
  const itc: any = instanceTreeComposables.value
  if (itc?.setInstanceFileReader) {
    itc.setInstanceFileReader(async (uri: string): Promise<string | null> => {
      try {
        const clean = String(uri).replace(/^file:\/\//, '')
        const absolutePath = clean.startsWith('/')
          ? clean
          : (workspaceParentPath ? `${workspaceParentPath}/${clean}` : clean)
        let fileEntry = fileSystem.getFileByPath(sourceId, absolutePath)
        if (!fileEntry) {
          const filename = absolutePath.split('/').pop()
          if (filename) fileEntry = fileSystem.getFileByPath(sourceId, filename)
        }
        if (!fileEntry) return null
        return await fileSystem.readTextFile(fileEntry)
      } catch (e) {
        console.warn('[App] Referenced instance file reader failed for', uri, e)
        return null
      }
    })
  }

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

        // Where the loader may fetch missing metamodels from
        const resolution = await prepareMetamodelResolution(fileEntry, location)

        try {
          const result = await instanceTreeComposables.value.loadInstancesFromXMI(content, location)
          reportMissingPackages((result as any)?.missingPackages, resolution.searched, fileEntry, location)
          await registerMetamodelsAsModels(location)
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

  const cascadeResolver = tsm.getService('gene.atlas.cascadeResolver')
  if (!cascadeResolver) {
    console.log('[CascadeResolver] Atlas plugin not loaded, skipping')
    return
  }

  const mbComposables = modelBrowserComposables.value
  const getRS = (mbComposables as any)?.getEcoreResourceSet
  if (!getRS) {
    console.warn('[CascadeResolver] getEcoreResourceSet not available')
    return
  }

  await cascadeResolver.configure(editorConfig, getRS())
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

// Pending explorer instance-add awaiting the user's load-mode choice
const pendingInstanceAdd = ref<{ entry: any; content: string } | null>(null)

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

  /*
   * Eine Perspektive waehlt nur noch den Navigator oben links. Sie baut nichts
   * auf: Die Flaeche steht, und was in ihr zu sehen ist, bestimmt der Tab.
   */
  waehleNavigator(layout, perspectiveId)
}

/**
 * Welcher Navigator oben links steht — mehr entscheidet eine Perspektive nicht.
 *
 * Welches Panel das ist, sagt die Perspektive selbst: das erste, das sie links
 * haben wollte. Der Explorer ist die Ausnahme, weil er der Anwendung gehoert
 * und nicht aus der Registry kommt.
 */
function waehleNavigator(layout: any, perspectiveId: string): void {
  const navigatorId = perspectiveId === 'explorer'
    ? 'file-explorer'
    : navigatorPanelId(perspectiveId)
  if (!navigatorId) return

  holePanelNachOben(layout, perspectiveId, navigatorId)
  oeffnePerspektivMitte(layout, perspectiveId)
  layout.selectPanel(navigatorId, 'primary')
  layout.setPrimarySidebarVisible(true)
}

/**
 * Was eine Perspektive in die Mitte stellen wollte, wird ein Tab.
 *
 * Der Atlas zeigt, warum: Seine Transitions, der Schema-Explorer und die
 * Details sind drei Ansichten nebeneinander — als Perspektive waren sie an
 * einen Aufbau gebunden, der alles andere mitriss. Als Tabs stehen sie neben
 * dem, was sonst offen ist.
 *
 * Ein schon offener Tab wird nicht nach vorn geholt: Wer die Perspektive
 * wechselt, will den Navigator, nicht zwingend einen anderen Tab.
 */
function oeffnePerspektivMitte(layout: any, perspectiveId: string): void {
  const perspektive = perspectiveManager.value?.registry?.get?.(perspectiveId)
  const mitte: string[] = perspektive?.defaultLayout?.center ?? []
  if (mitte.length === 0) return

  const panelRegistry = tsm.getService('ui.registry.panels') as any
  const verfuegbar = panelRegistry?.getForPerspective?.(perspectiveId) ?? []
  const offen = new Set((layout.state.editorTabs ?? []).map((t: any) => t.id))
  const zuvorAktiv = layout.state.activeEditorTabId

  for (const panelId of mitte) {
    if (offen.has(panelId)) continue
    const panel = verfuegbar.find((p: any) => p.id === panelId)
    if (!panel) continue
    layout.openEditor({
      id: panel.id,
      title: panel.title,
      icon: panel.icon,
      component: markRaw(panel.component),
      closable: panel.closable ?? true
    })
  }

  // openEditor holt den neuen Tab nach vorn — das war hier nicht gewollt
  if (zuvorAktiv) layout.selectEditor?.(zuvorAktiv)
}

/** Das Panel, das eine Perspektive links stehen haben wollte. */
function navigatorPanelId(perspectiveId: string): string | undefined {
  const perspektive = perspectiveManager.value?.registry?.get?.(perspectiveId)
  return perspektive?.defaultLayout?.left?.[0]
}

/**
 * Das Navigator-Panel eines Plugins in die Flaeche holen.
 *
 * Bisher tat das `switchTo`, und zwar mit `clearAll()` davor — damit war die
 * uebrige Flaeche weg. Hier wird nur ergaenzt; `registerPanel` ersetzt bei
 * gleicher Id, ein zweiter Aufruf kostet also nichts.
 */
function holePanelNachOben(layout: any, perspectiveId: string, panelId: string): void {
  if (layout.state.panels?.some((p: any) => p.id === panelId)) return
  const panelRegistry = tsm.getService('ui.registry.panels') as any
  const panel = panelRegistry?.getForPerspective?.(perspectiveId)?.find((p: any) => p.id === panelId)
  if (!panel) return
  layout.registerPanel({
    id: panel.id,
    title: panel.title,
    icon: panel.icon,
    component: markRaw(panel.component),
    location: 'primary'
  })
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
    referenceSearchCandidates.value = null
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
function handleReferenceSearch(feature: any, resource: any, callback: (obj: any) => void, candidates?: any[]) {
  console.log('[App] Opening search for reference:', feature.getName())
  referenceSearchFeature.value = feature
  referenceSearchCallback.value = callback
  searchResource.value = resource
  referenceSearchCandidates.value = candidates ? markRaw(candidates) : null

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
/**
 * Oeffnet ein Metamodell als eigenen Tab.
 *
 * Der Inhalt des Tabs ist das Eigenschaften-Panel wie bisher — neu ist, dass
 * der Tab beim Aufbau seine Instanz nach vorn meldet. Weil der Editor-Bereich
 * immer nur den vorderen Tab rendert, genuegt das: Baum (ueber die Fassade),
 * Eigenschaften und Modelle (ueber getCurrentContext) folgen ihm.
 */
let schliessenVerdrahtet = false

/**
 * Gibt Instanz und Kontext frei, wenn ein Dateitab wirklich geschlossen wird.
 *
 * Bewusst am Ereignis und nicht am Zustand: ein Perspektivwechsel raeumt die
 * Leiste ebenfalls (clearAll), die Dateien bleiben dabei aber offen.
 */
/*
 * Welche Panels zum vorderen Tab gehoeren.
 *
 * Der Dienst kennt weder die Ansichten noch das Layout — beides wird ihm
 * gereicht. Hier wird es zusammengesteckt, weil hier beides zur Hand ist.
 */
let tabLayout: TabLayoutService | null = null
function holeTabLayout(layout: any): TabLayoutService {
  if (!tabLayout) {
    const contextService = tsm.getService<any>('gene.editor.context')
    tabLayout = createTabLayout({
      frame: {
        selectPanel: (panelId, bereich) => layout.selectPanel?.(panelId, bereich),
        setSecondarySidebarVisible: (sichtbar) => layout.setSecondarySidebarVisible?.(sichtbar)
      },
      editorArtById: (editorId) =>
        contextService?.alleEditorArten?.().find((a: any) => a.id === editorId)
    })
  }
  return tabLayout
}

function verdrahteTabSchliessen(layout: any): void {
  if (schliessenVerdrahtet || !layout.onEditorClosed) return
  schliessenVerdrahtet = true
  const contextService = tsm.getService<any>('gene.editor.context')
  layout.onEditorClosed((tabId: string) => {
    metamodelerComposables.value?.tabGeschlossen?.(tabId)
    ;(instanceTreeComposables.value as any)?.instanzTabGeschlossen?.(tabId)
    contextService?.releaseTabContext?.(tabId)
    holeTabLayout(layout).releaseTab(tabId)
  })
}

/**
 * Oeffnet eine Instanzdatei als eigenen Tab.
 *
 * Wie beim Metamodell: Der Tab meldet beim Aufbau sein Dokument und seinen
 * Kontext an — Baum, Eigenschaften und Modell-Browser folgen ihm, weil immer
 * nur der vordere Tab gerendert wird.
 */
function oeffneInstanzTab(tabId: string, titel: string): void {
  const layoutSvc = layoutStateService.value
  const itc: any = instanceTreeComposables.value
  if (!layoutSvc || !itc?.instanzTabDokument) return
  const layout = layoutSvc.useLayoutState()
  verdrahteTabSchliessen(layout)
  const contextService = tsm.getService<any>('gene.editor.context')
  const PropertiesPanel = propertiesPanelComponents.value?.PropertiesPanel

  const dokument = itc.instanzTabDokument(tabId)
  const kontext = itc.createInstanceContext?.(dokument.instance)
  if (kontext && contextService?.registerTabContext) {
    contextService.registerTabContext(tabId, kontext)
  }
  const tabs = holeTabLayout(layout)
  tabs.bindTab(tabId, 'instance')

  layout.openEditor({
    id: tabId,
    title: titel,
    icon: 'pi pi-file-edit',
    component: markRaw(defineComponent({
      setup() {
        itc.instanzTabNachVorn?.(tabId)
        contextService?.activateTabContext?.(tabId)
        // Was zu dieser Ansicht gehoert, kommt mit nach vorn
        tabs.activateTab(tabId)
        return () => PropertiesPanel
          ? h(PropertiesPanel, {
              context: contextService?.getCurrentContext?.() ?? kontext,
              onShowProblems: handleShowProblems
            })
          : h('div', 'Eigenschaften nicht verfuegbar')
      }
    }))
  })
}

function oeffneMetamodellTab(tabId: string, titel: string, metamodeler: any): void {
  const layoutSvc = layoutStateService.value
  if (!layoutSvc) return
  const layout = layoutSvc.useLayoutState()
  verdrahteTabSchliessen(layout)
  const contextService = tsm.getService<any>('gene.editor.context')
  const PropertiesPanel = propertiesPanelComponents.value?.PropertiesPanel

  const kontext = contextService?.createMetamodelContext?.(metamodeler)
  if (kontext && contextService?.registerTabContext) {
    contextService.registerTabContext(tabId, kontext)
  }
  const tabs = holeTabLayout(layout)
  tabs.bindTab(tabId, 'metamodel')

  layout.openEditor({
    id: tabId,
    title: titel,
    icon: 'pi pi-sitemap',
    component: markRaw(defineComponent({
      setup() {
        // Gerendert wird nur der vordere Tab — also ist das hier der Wechsel
        metamodelerComposables.value?.tabNachVorn?.(tabId)
        contextService?.activateTabContext?.(tabId)
        // Was zu dieser Ansicht gehoert, kommt mit nach vorn
        tabs.activateTab(tabId)
        return () => PropertiesPanel
          ? h(PropertiesPanel, {
              context: contextService?.getCurrentContext?.() ?? kontext,
              onShowProblems: handleShowProblems
            })
          : h('div', 'Eigenschaften nicht verfuegbar')
      }
    }))
  })
}

async function handleMetamodelEdit(entry: any, content: string) {
  console.log('[App] Opening metamodel in editor:', entry.name)

  // Composables are otherwise only fetched lazily when the Metamodeler perspective
  // is first activated (setupMetamodelerPerspective). Editing a model happens before
  // that switch, so fetch on demand here instead of bailing on first use.
  if (!metamodelerComposables.value) {
    const mmc = tsm.getService<any>('ui.metamodeler.composables')
    if (mmc) metamodelerComposables.value = mmc
  }

  if (!metamodelerComposables.value?.useSharedMetamodeler) {
    console.warn('[App] Metamodeler composables not available')
    return
  }

  const fileHandle = entry.handle as FileSystemFileHandle | undefined

  // Legacy file with absolute self-nsURI hrefs → offer repair BEFORE loading.
  // Loading the dirty content either crashes the XMI loader or silently resolves
  // references to foreign registry instances (→ cross-resource nsURI hrefs on
  // save), so this must be content-driven, not gated on a load error.
  // The repair util lives with the loader (ui-model-browser), not the metamodeler.
  const mb = (modelBrowserComposables.value as any) ?? tsm.getService<any>('ui.model-browser.composables')
  if (mb?.needsLegacyHrefRepair?.(content)) {
    repairPending = { entry, content, fileHandle }
    repairPromptName.value = entry.name || entry.path || 'Metamodell'
    repairPromptVisible.value = true
    return
  }

  /*
   * Jede Datei bekommt ihren eigenen Tab mit eigener Metamodeler-Instanz.
   * Der Tab, der vorn liegt, bestimmt, was Baum, Eigenschaften und Modelle
   * zeigen — er traegt die Ansicht.
   */
  const mmc = metamodelerComposables.value
  const tabId: string = mmc.tabIdFuer?.(entry.path) ?? `metamodel:${entry.path}`
  const metamodeler = mmc.metamodelerFuerTab?.(tabId) ?? mmc.useSharedMetamodeler()

  let packageInfo: { name: string; nsURI: string } | null = null
  let loadError: any = null
  try {
    packageInfo = await metamodeler.loadFromEcoreString(content, entry.path, fileHandle)
  } catch (e: any) {
    loadError = e
    console.error('[App] Metamodel load failed:', e)
  }

  if (packageInfo) {
    console.log('[App] Metamodel loaded:', packageInfo.name, packageInfo.nsURI)
    oeffneMetamodellTab(tabId, entry.name || packageInfo.name, metamodeler)
    return
  }

  // Load failed for a non-legacy reason — surface it (no longer a silent log).
  showMetamodelLoadError(entry, String(loadError?.message ?? loadError ?? 'Unbekannter Fehler'))
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
/**
 * Installs the Atlas route for missing metamodels before loading.
 *
 * Since @emfts/core 0.3 the loader fetches them itself (emf.ts#88): it collects
 * the unknown nsURIs, gets them through the resource set's URI converter and
 * parses again. All that is said here is where it may look — in the scope the
 * file came from, including its inherited parents.
 *
 * Returns the providers, for the message afterwards.
 */
async function prepareMetamodelResolution(
  entry: any,
  filePath: string
): Promise<{ searched: string[]; providers: unknown[] }> {
  try {
    const setup = await prepareAtlasResolution(entry, {
      editorConfig: getGlobalEditorConfig(),
      instanceTreeComposables: instanceTreeComposables.value as any
    })
    console.log(
      '[App] Metamodell-Aufloesung fuer', entry?.name || filePath,
      '- Fundstellen:', setup.searched.join(' | ') || '(keine)',
      setup.note ? `- ${setup.note}` : ''
    )
    return { searched: setup.searched, providers: setup.providers }
  } catch (e) {
    console.warn('[App] Metamodell-Aufloesung liess sich nicht einhaengen:', e)
    return { searched: [], providers: [] }
  }
}

/**
 * Die Metamodelle der geladenen Instanz auch als Modelle fuehren.
 *
 * Der Loader braucht sie nur in der Package-Registry, und genau dorthin legt
 * sie sein URIConverter. Der Model Browser fuehrt aber eine eigene Liste, und
 * der Editor fragt *die*, welche Klassen zu einer Referenz passen — ein so
 * geholtes Metamodell liesse das "Add Child"-Menue bei jedem abstrakten Typ
 * leer (#155).
 */
async function registerMetamodelsAsModels(filePath: string): Promise<void> {
  try {
    const mb =
      (modelBrowserComposables.value as any) ?? tsm.getService<any>('ui.model-browser.composables')
    const resource = instanceTreeComposables.value?.getSharedResources?.().find(
      (r: any) => String(r.getURI?.() ?? '') === filePath
    )
    if (!resource) return
    const registered = registerUsedModels(resource, { modelBrowserComposables: mb })
    if (registered.length > 0) {
      console.log('[App] Metamodelle als Modelle registriert:', registered.join(', '))
      for (const nsURI of registered) {
        const info = mb?.useSharedModelRegistry?.()?.allPackages?.value?.find(
          (p: any) => p.nsURI === nsURI
        )
        if (info?.ePackage) await problemsService.registerPackage(info.ePackage)
      }
    }
  } catch (e) {
    console.warn('[App] Metamodelle liessen sich nicht als Modelle registrieren:', e)
  }
}

/**
 * What the loader could not resolve belongs in the problems panel — with the
 * nsURI and the providers searched, otherwise only the prefix from the parser
 * error is left.
 */
function reportMissingPackages(
  missing: string[] | undefined,
  searched: string[],
  entry: any,
  filePath: string
): void {
  if (!missing?.length) return
  const where = searched.length > 0 ? ` (durchsucht: ${searched.join(' | ')})` : ''
  console.warn('[App] Metamodell nicht gefunden:', missing.join(', '), where)
  for (const nsURI of missing) {
    problemsService.addIssue({
      severity: 'error',
      message: `Metamodell nicht gefunden: ${nsURI}${where}`,
      source: 'xmi-parser',
      objectLabel: entry?.name || filePath.split('/').pop() || filePath,
      eClassName: 'XMI Parser',
      filePath
    })
  }
}

async function handleInstanceAdd(entry: any, content: string, mode?: 'STANDALONE' | 'MERGE' | 'REPLACE') {
  console.log('[App] Adding instances to workspace:', entry.name, 'content length:', content?.length)

  const itc: any = instanceTreeComposables.value
  if (!itc?.loadInstancesFromXMI) {
    console.warn('[App] Instance tree composables not available')
    return
  }

  // No mode yet → ask the user how to open (standalone incl. referenced / add / replace)
  if (!mode) {
    pendingInstanceAdd.value = { entry, content }
    const eventBus = tsm.getService<any>('gene.eventbus')
    eventBus?.emit('instance:showImportDialog', { xmiContent: content, name: entry.name })
    return
  }

  // Clear previous errors for this file
  problemsService.clearIssuesForFile(entry.path)

  // Where the loader may fetch missing metamodels from
  const resolution = await prepareMetamodelResolution(entry, entry.path)

  /*
   * Jede Datei bekommt ihren eigenen Tab mit eigenem Baum. Ab hier liegt er
   * vorn, also laedt alles Folgende dorthin — die Funktionen des
   * Instanz-Moduls arbeiten auf dem vorderen Dokument. Beim Zusammenfuehren
   * (MERGE) bleibt der Tab, der gerade offen ist.
   */
  const instanzTabId: string | null = mode === 'MERGE'
    ? null
    : (itc.instanzTabIdFuer?.(entry.path) ?? null)
  if (instanzTabId) {
    itc.instanzTabDokument?.(instanzTabId)
    itc.instanzTabNachVorn?.(instanzTabId)
  }

  try {
    console.log('[App] Calling instance load, mode:', mode)
    let result: any
    if (mode === 'STANDALONE') {
      result = await itc.loadResourceStandalone(content, entry.path, { replace: true })
    } else if (mode === 'REPLACE') {
      itc.setSharedResource?.(null)
      result = await itc.loadInstancesFromXMI(content, entry.path)
    } else {
      // MERGE — add as a new resource to the current view
      result = await itc.loadInstancesFromXMI(content, entry.path)
    }
    console.log('[App] Instances loaded from:', entry.name, 'count:', result.loadedCount, 'errors:', result.errors.length)
    if (instanzTabId) oeffneInstanzTab(instanzTabId, entry.name || entry.path)
    reportMissingPackages(result.missingPackages, resolution.searched, entry, entry.path)
    // Was der Loader geholt hat, gehoert auch in die Modell-Liste (#155)
    await registerMetamodelsAsModels(entry.path)

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
      /*
       * Adding instances means wanting to see them. The metamodel route does
       * the same (handleMetamodelEdit switches to the metamodeler); coming
       * from the Atlas browser you used to stay put and had to switch the
       * perspective by hand.
       */
      if (currentPerspective.value !== 'model-editor') {
        handlePerspectiveChange('model-editor')
      }

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

/**
 * Die Workspace-Vorschau in der Mitte — solange keine Datei offen ist.
 *
 * Kein eigener Aufbau mehr: Die Flaeche steht schon, hier kommt nur der Tab
 * dazu. Er ist nicht schliessbar und weicht, sobald eine Datei geoeffnet wird.
 */
function zeigeWorkspaceVorschau(layout: any): void {
  const WorkspacePreview = fileExplorerComponents.value?.WorkspacePreview
  if (!WorkspacePreview) {
    tsm.whenService<any>('ui.file-explorer.components', (fec: any) => {
      fileExplorerComponents.value = fec
      zeigeWorkspaceVorschau(layout)
    })
    return
  }

  const Wrapper = defineComponent({
    setup() {
      const aktuelleDatei = computed(() => selectedFile.value)
      return () => h(WorkspacePreview, {
        selectedFile: aktuelleDatei.value,
        onOpenWorkspace: handleOpenWorkspace,
        onCoclAdd: handleCoclAdd
      })
    }
  })

  layout.openEditor({
    id: 'workspace-preview',
    title: 'Workspace',
    icon: 'pi pi-box',
    component: markRaw(Wrapper),
    props: {}
  })
}

/**
 * Der Explorer gehoert in jede Ansicht — oben links.
 *
 * Er zeigt, was es gibt, unabhaengig davon, was offen ist; darunter steht der
 * Baum der offenen Datei. Deshalb wird er hier gebaut und von allen Ansichten
 * eingehaengt, statt nur in seiner eigenen zu leben.
 */
function registriereExplorerOben(layout: any): void {
  const FileExplorer = fileExplorerComponents.value?.FileExplorer
  if (!FileExplorer) {
    // Die Komponenten kommen aus einem Modul, das spaeter aktiviert sein kann
    tsm.whenService<any>('ui.file-explorer.components', (fec: any) => {
      fileExplorerComponents.value = fec
      registriereExplorerOben(layout)
    })
    return
  }

  const Wrapper = defineComponent({
    setup() {
      const isWorkspaceOpen = computed(() => !!currentWorkspaceEntry.value)
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

  layout.registerPanel({
    id: 'file-explorer',
    title: 'Explorer',
    icon: 'pi pi-folder',
    component: markRaw(Wrapper),
    location: 'primary'
  })
  layout.registerActivity({
    id: 'file-explorer',
    icon: 'pi pi-folder',
    label: 'Explorer',
    tooltip: 'File Explorer',
    panel: 'file-explorer'
  })
}

/**
 * Beide Baeume unten links anmelden — der Instanzbaum und der Metamodell-Baum.
 *
 * Welcher zu sehen ist, entscheidet der Tab, der vorn liegt, nicht die
 * Ansicht. Nur so laesst sich zwischen einer .ecore und einer .xmi wechseln,
 * ohne das Layout neu aufzubauen.
 */
function registriereBaeumeUnten(layout: any): void {
  const InstanceTree = instanceTreeComponents.value?.InstanceTree
  const MetamodelerTree = metamodelerComponents.value?.MetamodelerTree
  const contextService = tsm.getService<any>('gene.editor.context')

  /*
   * Beide Baeume kommen aus Modulen, die spaeter aktiviert sein koennen. Statt
   * spaeter noch einmal alles aufzubauen, wird je Baum nachgetragen, sobald er
   * da ist — `registerPanel` ersetzt bei gleicher Id.
   */
  if (!InstanceTree) {
    tsm.whenService<any>('ui.instance-tree.components', (itc: any) => {
      instanceTreeComponents.value = itc
      registriereBaeumeUnten(layout)
    })
  }
  if (!MetamodelerTree) {
    tsm.whenService<any>('ui.metamodeler.components', (mmc: any) => {
      metamodelerComponents.value = mmc
      registriereBaeumeUnten(layout)
    })
  }

  if (InstanceTree) {
    const Wrapper = defineComponent({
      setup() {
        // Zur Renderzeit aufloesen: der vordere Tab bringt seinen Kontext mit
        return () => h(InstanceTree, {
          context: contextService?.getCurrentContext?.() ?? contextService?.getInstanceContext?.(),
          onObjectSelect: handleObjectSelect
        })
      }
    })
    layout.registerPanel({
      id: 'instance-tree',
      title: 'Instances',
      icon: 'pi pi-sitemap',
      component: markRaw(Wrapper),
      location: 'primary-bottom'
    })
  }

  if (MetamodelerTree) {
    layout.registerPanel({
      id: 'metamodeler-tree',
      title: 'Metamodel',
      icon: 'pi pi-sitemap',
      component: markRaw(MetamodelerTree),
      location: 'primary-bottom'
    })
  }
}

/*
 * Die Arbeitsflaeche — einmal gebaut, nicht je Perspektive.
 *
 * Vorher gab es zwei Aufbauten, die beide mit `clearAll()` begannen und
 * dasselbe noch einmal registrierten: Explorer oben, Baeume unten, Model
 * Browser rechts, Probleme unten. Daraus folgte genau das beobachtete Bild —
 * das Layout riss ab, der Explorer verschwand, und eine Perspektive war aktiv,
 * die in der Leiste gar nicht mehr stand.
 *
 * Jetzt gehoeren die Panels der Anwendung, nicht einer Ansicht. Welches davon
 * zu sehen ist, entscheidet der Tab, der vorn liegt (siehe `tabLayout`).
 *
 * Mehrfaches Rufen ist unschaedlich: `registerPanel` ersetzt bei gleicher Id,
 * und so kommt ein Panel nach, dessen Modul spaeter aktiviert wurde.
 */
function baueArbeitsflaeche(layout: any): void {
  registriereExplorerOben(layout)
  registriereBaeumeUnten(layout)
  registriereModellBrowser(layout)
  registriereProblemePanel(layout)
  registriereSuchKnopf(layout)
  verdrahteTabSchliessen(layout)
  beobachteProbleme(layout)

  layout.setPrimarySidebarVisible(true)
}

/**
 * Der Model Browser rechts — fuer Instanzen wie fuer Metamodelle.
 *
 * Ein Panel, nicht zwei: Welches Modell darin steht, sagt der Kontext des
 * vorderen Tabs. Ein fest eingefangener Kontext bliebe beim ersten stehen.
 */
function registriereModellBrowser(layout: any): void {
  const ModelBrowser = modelBrowserComponents.value?.ModelBrowser
  if (!ModelBrowser) {
    tsm.whenService<any>('ui.model-browser.components', (mbc: any) => {
      modelBrowserComponents.value = mbc
      registriereModellBrowser(layout)
    })
    return
  }

  const contextService = tsm.getService<any>('gene.editor.context')

  /** Legt ein Objekt im Baum des vorderen Tabs an. */
  const erzeugeInstanz = (classInfo: any): void => {
    const eClass = classInfo?.eClass
    if (!eClass) {
      console.error('[App] Kein eClass in classInfo')
      return
    }
    const neu = eClass.getEPackage().getEFactoryInstance().create(eClass)
    const kontext = contextService?.getCurrentContext?.()
    if (kontext?.addRootObject) kontext.addRootObject(neu)
    else console.warn('[App] Kein Kontext mit addRootObject')
  }

  const Wrapper = defineComponent({
    setup() {
      return () => h(ModelBrowser, {
        context: contextService?.getCurrentContext?.(),
        onCreateInstance: erzeugeInstanz
      })
    }
  })

  layout.registerPanel({
    id: 'model-browser',
    title: 'Models',
    icon: 'pi pi-box',
    component: markRaw(Wrapper),
    location: 'secondary'
  })
  layout.registerActivity({
    id: 'model-browser',
    icon: 'pi pi-box',
    label: 'Models',
    tooltip: 'Model Browser',
    panel: 'model-browser'
  })

  // Der Metamodeler fragt vor dem Speichern nach, wenn die Pruefung meckert
  registerMetamodelerSaveConfirm()
}

/** Die Probleme unten — und was die Plugins sonst dorthin stellen. */
function registriereProblemePanel(layout: any): void {
  const Wrapper = defineComponent({
    setup() {
      return () => h(ProblemsPanel, {
        onSelectObject: (obj: any) => waehleObjektImBaum(obj)
      })
    }
  })

  layout.registerPanelTab({
    id: 'ocl-problems',
    title: 'Problems',
    icon: 'pi pi-exclamation-triangle',
    component: markRaw(Wrapper)
  })

  /*
   * Die unteren Panels der Plugins. Sie sind je Perspektive angemeldet, waehrend
   * es die Perspektiven nicht mehr gibt — also wird genommen, was fuer eine der
   * beiden Bearbeitungsperspektiven gemeldet war.
   */
  const panelRegistry = tsm.getService('ui.registry.panels') as any
  if (!panelRegistry) return
  for (const perspektive of ['model-editor', 'metamodeler']) {
    for (const panel of panelRegistry.getForLocation?.(perspektive, 'bottom') ?? []) {
      if (panel.id === 'ocl-problems') continue
      const vorhanden = layout.state.panelTabs || []
      if (vorhanden.some((t: any) => t.id === panel.id)) continue
      layout.registerPanelTab({
        id: panel.id,
        title: panel.title,
        icon: panel.icon,
        component: markRaw(panel.component)
      })
    }
  }
}

/**
 * Ein Problem anklicken heisst: das Objekt im Baum zeigen.
 *
 * Welcher Baum das ist, haengt am vorderen Tab — beide werden gefragt, der
 * zustaendige antwortet.
 */
function waehleObjektImBaum(obj: any): void {
  try {
    metamodelerComposables.value?.useSharedMetamodeler?.().selectElement?.(obj)
  } catch { /* kein Metamodell vorn */ }
  try {
    instanceTreeComposables.value?.useSharedInstanceTree?.()?.selectObject?.(obj)
  } catch { /* keine Instanz vorn */ }
}

let problemeBeobachtet = false

/** Die Problemzahl am Reiter, und der Bereich geht auf, wenn etwas dazukommt. */
function beobachteProbleme(layout: any): void {
  if (problemeBeobachtet) return
  problemeBeobachtet = true

  watchEffect(() => {
    const anzahl = problemsService.stats.value.totalCount
    layout.updateBadge('ocl-problems', anzahl > 0 ? anzahl : undefined)
  })

  watch(
    () => problemsService.stats.value.totalCount,
    (neu: number, alt: number | undefined) => {
      if (neu > (alt ?? 0)) {
        layout.setPanelAreaVisible(true)
        layout.selectPanel('ocl-problems', 'panel')
      }
    }
  )

  if (problemsService.hasErrors.value) layout.setPanelAreaVisible(true)
}

/** Die Suche oeffnen, sofern ueberhaupt Instanzen geladen sind. */
function openSearchDialogIfPossible(): void {
  const resource = instanceTreeComposables.value?.getSharedResource?.()
  if (resource) showSearchDialog.value = true
}

let suchKnopfGesetzt = false

/** Die Suche in der Statusleiste. */
function registriereSuchKnopf(layout: any): void {
  if (suchKnopfGesetzt) return
  suchKnopfGesetzt = true

  const SearchButton = defineComponent({
    setup() {
      return () => h('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
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
    onClick: () => openSearchDialogIfPossible()
  })
}

// Watch perspective changes
watch(currentPerspective, (perspectiveId, oldPerspectiveId) => {
  console.log('Perspective changed:', oldPerspectiveId, '->', perspectiveId)

  if (!layoutStateService.value) {
    console.warn('Layout state service not available for perspective switch')
    return
  }
  const layout = layoutStateService.value.useLayoutState()

  waehleNavigator(layout, perspectiveId)
}, { immediate: false })

// Poll for services and update refs
onMounted(() => {
  let initialSetupDone = false
  const metamodelContextRegistered = false

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
  eventBus.on('action:proposedActions', handleProposedActions)
  eventBus.on('instance:showImportDialog', handleShowImportDialog)

  // Approval dialog callbacks via EventBus (Vue emit doesn't work with dynamic <component :is>)
  eventBus.on('approval:execute', async (selected: any[]) => {
    // Process pending artifacts
    for (const artifact of pendingArtifacts.value) {
      if (artifact.type === 'VALIDATION_MESSAGES' && artifact.messages) {
        const problemsService = tsm.getService<any>('gene.problems')
        if (problemsService?.addIssues) problemsService.addIssues(artifact.messages)
      }
    }
    pendingArtifacts.value = []
    // Execute selected commands
    const cr = tsm.getService<any>('gene.command.registry')
    if (cr) {
      for (const action of selected) {
        const args = action.args ? JSON.parse(action.args) : undefined
        await cr.execute(action.commandId, args)
      }
    }
  })

  eventBus.on('xmiImport:execute', async (data: any) => {
    // Explorer-origin add: route the chosen mode back to the full add flow
    // (keeps EditorConfig instanceSource + live OCL wiring)
    if (pendingInstanceAdd.value) {
      const p = pendingInstanceAdd.value
      pendingInstanceAdd.value = null
      await handleInstanceAdd(p.entry, p.content, data.mode)
      return
    }
    const cr = tsm.getService<any>('gene.command.registry')
    if (cr) await cr.execute('instance.importXmi', { xmiContent: data.xmiContent, mode: data.mode })
  })

  // Helper to open search dialog if resource is available
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

    // Note: the metamodel editor context factory is registered by the metamodeler
    // plugin itself (packages/metamodeler activate). gene-app must not depend on a
    // lazily-loaded plugin's composables here — that coupling made context creation
    // race the service-poll teardown and usually never happened.

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

    /*
     * Die Flaeche einmal aufbauen und den Explorer davorstellen.
     *
     * Nicht ueber `switchTo('explorer')`: Der Perspektivwechsel raeumt die
     * Flaeche vorher ab, und genau das soll nicht mehr geschehen.
     */
    if (!initialSetupDone && layoutStateService.value) {
      initialSetupDone = true
      const layout = layoutStateService.value.useLayoutState()

      baueArbeitsflaeche(layout)
      zeigeWorkspaceVorschau(layout)
      perspectiveManager.value?.setCurrentPerspectiveId?.('explorer')
      waehleNavigator(layout, 'explorer')

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
    v-if="referenceSearchCandidates || searchResource || instanceTreeComposables?.getSharedResource?.()"
    :visible="showSearchDialog"
    :resource="searchResource || instanceTreeComposables?.getSharedResource()"
    :candidates="referenceSearchCandidates || undefined"
    :referenceOptions="referenceSearchFeature ? {
      sourceObject: referenceSearchSourceObject,
      reference: referenceSearchFeature,
      oclConstraint: referenceSearchOclConstraint
    } : undefined"
    :problemsService="problemsService"
    @close="showSearchDialog = false; referenceSearchCallback = null; referenceSearchFeature = null; referenceSearchSourceObject = null; referenceSearchOclConstraint = null; searchResource = null; referenceSearchCandidates = null"
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
    :kind="atlasUploadKind"
  />

  <!-- Command Palette -->
  <component
    v-if="commandRegistryRef"
    :is="tsm.getService('gene.action.components')?.CommandPalette"
    ref="commandPaletteRef"
    :commandRegistry="commandRegistryRef"
    :contextProvider="getCommandContext"
  />

  <!-- Action Approval Dialog (ProposedActions from server) -->
  <component
    v-if="tsm.getService('gene.action.components')?.ActionApprovalDialog"
    :is="tsm.getService('gene.action.components').ActionApprovalDialog"
    ref="approvalDialogRef"
    :resultStatus="approvalDialogProps.resultStatus"
    :resultMessage="approvalDialogProps.resultMessage"
    :actions="approvalDialogProps.actions"
  />

  <!-- XMI Import Dialog (UC-ACT-006) -->
  <component
    v-if="tsm.getService('gene.action.components')?.XmiImportDialog"
    :is="tsm.getService('gene.action.components').XmiImportDialog"
    ref="xmiImportDialogRef"
    :xmiContent="xmiImportProps.xmiContent"
    :name="xmiImportProps.name"
  />

  <!-- Save-validation confirm dialog (Metamodeler) -->
  <Dialog
    v-model:visible="saveConfirmVisible"
    header="Validierungsfehler"
    :modal="true"
    :closable="false"
    :style="{ width: '440px' }"
  >
    <div class="save-confirm-body">
      <i class="pi pi-exclamation-triangle save-confirm-icon"></i>
      <div class="save-confirm-text">
        <p class="save-confirm-lead">
          Das Metamodell hat
          <strong>{{ saveConfirmInfo.errorCount }} Validierungsfehler</strong><template
            v-if="saveConfirmInfo.totalCount > saveConfirmInfo.errorCount"
          > und {{ saveConfirmInfo.totalCount - saveConfirmInfo.errorCount }} weitere
            {{ (saveConfirmInfo.totalCount - saveConfirmInfo.errorCount) === 1 ? 'Warnung' : 'Probleme' }}</template>.
        </p>
        <p class="save-confirm-hint">Details findest du im Problems-Panel. Trotzdem speichern?</p>
      </div>
    </div>
    <template #footer>
      <Button label="Abbrechen" severity="secondary" icon="pi pi-times" @click="resolveSaveConfirm(false)" />
      <Button label="Trotzdem speichern" severity="warning" icon="pi pi-save" @click="resolveSaveConfirm(true)" />
    </template>
  </Dialog>

  <!-- Legacy .ecore repair prompt: shown when a metamodel fails to load due to
       absolute self-nsURI hrefs (old serialization). Offers repair & reload. -->
  <Dialog
    v-model:visible="repairPromptVisible"
    header="Metamodell konnte nicht geladen werden"
    :modal="true"
    :closable="false"
    :style="{ width: '460px' }"
  >
    <div class="save-confirm-body">
      <i class="pi pi-wrench save-confirm-icon"></i>
      <div class="save-confirm-text">
        <p class="save-confirm-lead">
          <strong>{{ repairPromptName }}</strong> verwendet ein veraltetes Referenzformat
          (absolute nsURI-Verweise) und lässt sich so nicht laden.
        </p>
        <p class="save-confirm-hint">
          Es kann automatisch repariert werden (interne <code>#//</code>-Verweise) und neu geladen
          werden. Speichere danach, um die reparierte Datei zu sichern.
        </p>
      </div>
    </div>
    <template #footer>
      <Button label="Abbrechen" severity="secondary" icon="pi pi-times" @click="resolveRepairPrompt(false)" />
      <Button label="Reparieren & neu laden" severity="primary" icon="pi pi-wrench" @click="resolveRepairPrompt(true)" />
    </template>
  </Dialog>

  <!-- Generic metamodel load error (no automatic repair applicable) -->
  <Dialog
    v-model:visible="metamodelLoadErrorVisible"
    header="Metamodell konnte nicht geladen werden"
    :modal="true"
    :style="{ width: '460px' }"
  >
    <div class="save-confirm-body">
      <i class="pi pi-times-circle save-confirm-icon"></i>
      <div class="save-confirm-text">
        <p class="save-confirm-lead"><strong>{{ metamodelLoadError.name }}</strong></p>
        <p class="save-confirm-hint">{{ metamodelLoadError.message }}</p>
      </div>
    </div>
    <template #footer>
      <Button label="Schließen" severity="secondary" icon="pi pi-times" @click="metamodelLoadErrorVisible = false" />
    </template>
  </Dialog>

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

/* Dark theme overrides */
.dark-theme {
  --surface-border: #3f3f3f7a;
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

.save-confirm-body {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 0.25rem 0;
}

.save-confirm-icon {
  font-size: 1.6rem;
  color: var(--red-500, #ef4444);
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.save-confirm-text {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.save-confirm-lead {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.save-confirm-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
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
