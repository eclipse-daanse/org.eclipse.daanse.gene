/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EditorConfig Service
 *
 * Manages the fennecui EditorConfig model instance.
 * The EditorConfig is stored as a file in the connected repository.
 *
 * Flow:
 * 1. Connect to repository (Git/IndexedDB/Filesystem)
 * 2. Select or create workspace file (e.g., workspace.fennecui)
 * 3. Load EditorConfig from file
 * 4. Edit configuration (icon mappings, etc.)
 * 5. Save back to repository
 */

import { ref, shallowRef, computed, toRaw, triggerRef } from 'vue'
import { XMIResource, URI, BasicResourceSet, EPackageRegistry } from '@emfts/core'
import type { Resource } from '@emfts/core'
import {
  FennecuiPackage,
  FennecuiFactory,
  MappingScope,
  IconLibrary,
  ResolutionStrategy,
  type EditorConfig,
  type IconMapping,
  type ModelSource,
  type InstanceSource,
  type LayoutConfig,
  type TreeView,
  type PackageResolverChain,
  type PackageResolver,
  type CustomIconDefinition
} from '../generated/fennecui'

// Panel position type for layout state sync
interface PanelPositionData {
  panelId: string
  location: 'primary' | 'secondary' | 'editor' | 'bottom'
  order: number
}
import { loadFromEditorConfig as loadIconsFromConfig, getSharedViews, iconProviderRegistry, CustomIconProvider, CUSTOM_ICONS_PROVIDER_ID, type CustomIconEntry } from 'ui-instance-tree'

// Default workspace filename
const DEFAULT_WORKSPACE_FILENAME = 'workspace.fennecui'

/**
 * EditorConfig composable
 */
export function useEditorConfig() {
  const factory = FennecuiFactory.eINSTANCE
  const resourceSet = new BasicResourceSet()

  // Register fennecui package
  const nsURI = FennecuiPackage.eINSTANCE.getNsURI()
  if (nsURI) {
    EPackageRegistry.INSTANCE.set(nsURI, FennecuiPackage.eINSTANCE)
  }

  // State
  const resource = shallowRef<Resource | null>(null)
  const editorConfig = shallowRef<EditorConfig | null>(null)
  const initialized = ref(false)
  const loading = ref(false)
  const dirty = ref(false)

  // Current workspace file info
  const workspaceFilePath = ref<string | null>(null)
  const workspaceRepository = ref<any>(null) // Repository from useWorkspace
  const workspaceFileEntry = ref<any>(null) // FileEntry for file system save

  // Computed: Custom icon libraries - supports both EditorConfigImpl and DynamicEObject
  const customIconLibraries = computed(() => {
    if (!editorConfig.value) return []

    const config = toRaw(editorConfig.value) as any

    let libs = config.customIconLibraries
    if (libs === undefined && typeof config.eGet === 'function') {
      const eClass = config.eClass()
      const feature = eClass.getEStructuralFeature('customIconLibraries')
      if (feature) {
        libs = config.eGet(feature)
      }
    }

    if (libs && typeof libs.toArray === 'function') {
      return libs.toArray()
    }
    return libs || []
  })

  // Computed: Icon mappings - supports both EditorConfigImpl and DynamicEObject
  const iconMappings = computed(() => {
    if (!editorConfig.value) return []

    const config = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl)
    let mappings = config.iconMappings
    if (mappings === undefined && typeof config.eGet === 'function') {
      // DynamicEObject - use reflective API
      const eClass = config.eClass()
      const iconMappingsFeature = eClass.getEStructuralFeature('iconMappings')
      if (iconMappingsFeature) {
        mappings = config.eGet(iconMappingsFeature)
      }
    }

    // Convert EList to array if needed
    if (mappings && typeof mappings.toArray === 'function') {
      return mappings.toArray()
    }
    return mappings || []
  })

  // Computed: Model sources - supports both EditorConfigImpl and DynamicEObject
  const modelSources = computed(() => {
    if (!editorConfig.value) return []

    const config = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl)
    let sources = config.modelSources
    if (sources === undefined && typeof config.eGet === 'function') {
      // DynamicEObject - use reflective API
      const eClass = config.eClass()
      const modelSourcesFeature = eClass.getEStructuralFeature('modelSources')
      if (modelSourcesFeature) {
        sources = config.eGet(modelSourcesFeature)
      }
    }

    // Convert EList to array if needed
    if (sources && typeof sources.toArray === 'function') {
      return sources.toArray()
    }
    return sources || []
  })

  // Computed: Instance sources - supports both EditorConfigImpl and DynamicEObject
  const instanceSources = computed(() => {
    if (!editorConfig.value) return []

    const config = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl)
    let sources = config.instanceSources
    if (sources === undefined && typeof config.eGet === 'function') {
      // DynamicEObject - use reflective API
      const eClass = config.eClass()
      const instanceSourcesFeature = eClass.getEStructuralFeature('instanceSources')
      if (instanceSourcesFeature) {
        sources = config.eGet(instanceSourcesFeature)
      }
    }

    // Convert EList to array if needed
    if (sources && typeof sources.toArray === 'function') {
      return sources.toArray()
    }
    return sources || []
  })

  // Computed: Layout config - supports both EditorConfigImpl and DynamicEObject
  const layoutConfig = computed(() => {
    if (!editorConfig.value) return null

    const config = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl)
    let layout = config.layoutConfig
    if (layout === undefined && typeof config.eGet === 'function') {
      // DynamicEObject - use reflective API
      const eClass = config.eClass()
      const layoutConfigFeature = eClass.getEStructuralFeature('layoutConfig')
      if (layoutConfigFeature) {
        layout = config.eGet(layoutConfigFeature)
      }
    }

    return layout as LayoutConfig | null
  })

  // Computed: Tree views - supports both EditorConfigImpl and DynamicEObject
  const treeViews = computed(() => {
    if (!editorConfig.value) return []

    const config = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl)
    let views = config.treeViews
    if (views === undefined && typeof config.eGet === 'function') {
      // DynamicEObject - use reflective API
      const eClass = config.eClass()
      const treeViewsFeature = eClass.getEStructuralFeature('treeViews')
      if (treeViewsFeature) {
        views = config.eGet(treeViewsFeature)
      }
    }

    // Convert EList to array if needed
    if (views && typeof views.toArray === 'function') {
      return views.toArray()
    }
    return views || []
  })

  // Computed: Active view ID
  const activeViewId = computed(() => {
    if (!editorConfig.value) return null

    const config = toRaw(editorConfig.value) as any

    // Try property access first
    let viewId = config.activeViewId
    if (viewId === undefined && typeof config.eGet === 'function') {
      const eClass = config.eClass()
      const activeViewIdFeature = eClass.getEStructuralFeature('activeViewId')
      if (activeViewIdFeature) {
        viewId = config.eGet(activeViewIdFeature)
      }
    }

    return viewId || null
  })

  // Computed: Package resolver chain - supports both EditorConfigImpl and DynamicEObject
  const packageResolverChain = computed(() => {
    if (!editorConfig.value) return null

    const config = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl)
    let chain = config.packageResolverChain
    if (chain === undefined && typeof config.eGet === 'function') {
      // DynamicEObject - use reflective API
      const eClass = config.eClass()
      const chainFeature = eClass.getEStructuralFeature('packageResolverChain')
      if (chainFeature) {
        chain = config.eGet(chainFeature)
      }
    }

    return chain as PackageResolverChain | null
  })

  /**
   * Get or create the PackageResolverChain on the EditorConfig
   */
  function getOrCreatePackageResolverChain(): PackageResolverChain {
    if (!editorConfig.value) {
      throw new Error('No EditorConfig loaded')
    }

    const existing = packageResolverChain.value
    if (existing) return existing

    const chain = factory.createPackageResolverChain()
    const config = toRaw(editorConfig.value) as any

    if (typeof config.eSet === 'function') {
      const eClass = config.eClass()
      const feature = eClass.getEStructuralFeature('packageResolverChain')
      if (feature) {
        config.eSet(feature, chain)
      }
    } else {
      config.packageResolverChain = chain
    }

    triggerRef(editorConfig)
    dirty.value = true
    return chain
  }

  /**
   * Add a PackageResolver to the chain
   */
  function addPackageResolver(options: {
    name: string
    kind: string
    enabled?: boolean
    baseUrl?: string
    scopeName?: string
    stage?: string
    token?: string
  }): PackageResolver {
    const chain = getOrCreatePackageResolverChain()
    const resolver = factory.createPackageResolver()

    resolver.name = options.name
    resolver.kind = options.kind as any
    resolver.enabled = options.enabled ?? true
    if (options.baseUrl) resolver.baseUrl = options.baseUrl
    if (options.scopeName) resolver.scopeName = options.scopeName
    if (options.stage) resolver.stage = options.stage
    if (options.token) resolver.token = options.token

    const rawChain = toRaw(chain) as any
    if (typeof rawChain.eGet === 'function') {
      const eClass = rawChain.eClass()
      const resolversFeature = eClass.getEStructuralFeature('resolvers')
      if (resolversFeature) {
        const list = rawChain.eGet(resolversFeature)
        if (list && typeof list.push === 'function') {
          list.push(resolver)
        } else if (Array.isArray(rawChain.resolvers)) {
          rawChain.resolvers.push(resolver)
        }
      }
    } else if (Array.isArray(rawChain.resolvers)) {
      rawChain.resolvers.push(resolver)
    }

    triggerRef(editorConfig)
    dirty.value = true
    return resolver
  }

  /**
   * Remove a PackageResolver from the chain by index
   */
  function removePackageResolver(index: number): void {
    const chain = packageResolverChain.value
    if (!chain) return

    const rawChain = toRaw(chain) as any
    if (Array.isArray(rawChain.resolvers) && index >= 0 && index < rawChain.resolvers.length) {
      rawChain.resolvers.splice(index, 1)
      triggerRef(editorConfig)
      dirty.value = true
    }
  }

  /**
   * Load EditorConfig from XMI string content
   * @param xmiContent The XMI content
   * @param filePath The file path
   * @param fileEntry Optional FileEntry for saving back via file system
   */
  async function loadFromString(xmiContent: string, filePath: string, fileEntry?: any): Promise<void> {
    loading.value = true

    try {
      const uri = URI.createURI(filePath)
      const res = new XMIResource(uri)
      resourceSet.getResources().push(res)
      res.setResourceSet(resourceSet)

      await res.loadFromString(xmiContent)
      resource.value = res

      const contents = res.getContents()
      if (contents.length > 0) {
        editorConfig.value = contents.get(0) as EditorConfig
        console.log('[EditorConfig] Loaded from file:', filePath, 'iconMappings:', editorConfig.value.iconMappings?.length || 0)
      } else {
        // Empty file - create new config
        createNewConfig(filePath)
      }

      workspaceFilePath.value = filePath
      workspaceFileEntry.value = fileEntry || null
      initialized.value = true
      dirty.value = false

      // Initialize treeViews if it doesn't exist (for older workspace files)
      initializeTreeViewsIfNeeded()

      // Apply icon mappings to registry
      if (editorConfig.value) {
        loadIconsFromConfig(editorConfig.value)
        loadCustomIconsIntoRegistry()
      }

      // Load tree views into composable
      loadTreeViewsIntoComposable()
    } catch (error) {
      console.error('[EditorConfig] Failed to load:', error)
      // Create new config on error
      createNewConfig(filePath)
    } finally {
      loading.value = false
    }
  }

  /**
   * Initialize treeViews EList if it doesn't exist (for older workspace files)
   * Calling eGet on a containment reference will create the EList if needed
   */
  function initializeTreeViewsIfNeeded(): void {
    if (!editorConfig.value) return

    const rawConfig = toRaw(editorConfig.value) as any
    const eClass = rawConfig.eClass?.()
    const treeViewsFeature = eClass?.getEStructuralFeature('treeViews')

    if (typeof rawConfig.eGet === 'function' && treeViewsFeature) {
      // This will create the EObjectContainmentEList if it doesn't exist
      const viewsList = rawConfig.eGet(treeViewsFeature)
      console.log('[EditorConfig] initializeTreeViewsIfNeeded - list type:', viewsList?.constructor?.name, 'length:', viewsList?.length ?? viewsList?.size?.())
    } else {
      // Fallback for EditorConfigImpl
      if (!rawConfig.treeViews) {
        rawConfig.treeViews = []
        console.log('[EditorConfig] initializeTreeViewsIfNeeded - initialized via direct assignment')
      }
    }
  }

  /**
   * Load tree views from EditorConfig into the shared views composable
   */
  function loadTreeViewsIntoComposable(): void {
    try {
      const sharedViews = getSharedViews()
      if (sharedViews) {
        const viewsData = getTreeViewsForComposable()
        sharedViews.fromJSON(viewsData)
        console.log('[EditorConfig] Loaded', viewsData.views.length, 'tree views into composable')
      }
    } catch (error) {
      console.warn('[EditorConfig] Failed to load tree views into composable:', error)
    }
  }

  /**
   * Set the file entry for saving
   */
  function setFileEntry(entry: any): void {
    workspaceFileEntry.value = entry
  }

  /**
   * Load EditorConfig from repository file
   * @param repository The repository from useWorkspace
   * @param file The file object to load
   * @param readFileFn Function to read file content from repository
   */
  async function loadFromRepository(
    repository: any,
    file: any,
    readFileFn: (repo: any, file: any) => Promise<string>
  ): Promise<void> {
    workspaceRepository.value = repository
    const content = await readFileFn(repository, file)
    await loadFromString(content, file.path)
  }

  /**
   * Create a new EditorConfig
   */
  function createNewConfig(filePath?: string): void {
    const uri = URI.createURI(filePath || DEFAULT_WORKSPACE_FILENAME)
    const res = new XMIResource(uri)
    resourceSet.getResources().push(res)
    res.setResourceSet(resourceSet)

    const config = factory.createEditorConfig()
    config.name = 'Workspace Configuration'
    config.enabled = true

    res.getContents().push(config)
    resource.value = res
    editorConfig.value = config
    workspaceFilePath.value = filePath || null
    initialized.value = true
    dirty.value = true

    console.log('[EditorConfig] Created new config')
  }

  /**
   * Sync tree views from composable to EditorConfig before saving
   */
  function syncTreeViewsBeforeSave(): void {
    try {
      const sharedViews = getSharedViews()
      if (sharedViews) {
        const viewsData = sharedViews.toJSON()
        console.log('[EditorConfig] syncTreeViewsBeforeSave - Views data to sync:', viewsData.views.length, 'views, activeViewId:', viewsData.activeViewId)

        if (viewsData.views.length > 0) {
          console.log('[EditorConfig] First view:', viewsData.views[0].name, 'with', viewsData.views[0].filters.length, 'filters')
        }

        // Make sure treeViews is initialized before syncing
        initializeTreeViewsIfNeeded()

        syncTreeViewsFromComposable(viewsData)
        console.log('[EditorConfig] Synced', viewsData.views.length, 'tree views before save')

        // Verify sync worked by checking the raw config
        const rawConfig = toRaw(editorConfig.value) as any
        let actualList = rawConfig.treeViews
        if (actualList === undefined && typeof rawConfig.eGet === 'function') {
          const eClass = rawConfig.eClass()
          const feature = eClass?.getEStructuralFeature('treeViews')
          if (feature) {
            actualList = rawConfig.eGet(feature)
          }
        }
        console.log('[EditorConfig] treeViews after sync - actual list length:', actualList?.length ?? 'undefined')
      } else {
        console.log('[EditorConfig] syncTreeViewsBeforeSave - no shared views instance')
      }
    } catch (error) {
      console.warn('[EditorConfig] Failed to sync tree views before save:', error)
    }
  }

  /**
   * Get XMI string content for saving
   */
  async function saveToString(): Promise<string> {
    if (!resource.value || !editorConfig.value) {
      throw new Error('No EditorConfig to save')
    }

    // Sync tree views from composable before saving
    syncTreeViewsBeforeSave()

    const rawConfig = toRaw(editorConfig.value) as any

    // Get eClass once for all feature lookups
    const eClass = rawConfig.eClass()

    // Get iconMappings via eGet for DynamicEObject
    let mappings = rawConfig.iconMappings
    if (mappings === undefined && typeof rawConfig.eGet === 'function') {
      const iconMappingsFeature = eClass.getEStructuralFeature('iconMappings')
      if (iconMappingsFeature) {
        mappings = rawConfig.eGet(iconMappingsFeature)
      }
    }
    console.log('[EditorConfig] saveToString - iconMappings:', mappings, 'length:', mappings?.length ?? mappings?.data?.length)

    // Log modelSources before save
    let modelSourcesList = rawConfig.modelSources
    const modelSourcesFeature = eClass?.getEStructuralFeature('modelSources')
    if (modelSourcesList === undefined && typeof rawConfig.eGet === 'function' && modelSourcesFeature) {
      modelSourcesList = rawConfig.eGet(modelSourcesFeature)
    }
    console.log('[EditorConfig] saveToString - modelSources:', modelSourcesList, 'length:', modelSourcesList?.length ?? modelSourcesList?.data?.length ?? 0)

    // Log treeViews before save
    let treeViewsList = rawConfig.treeViews
    const treeViewsFeature = eClass?.getEStructuralFeature('treeViews')
    if (treeViewsList === undefined && typeof rawConfig.eGet === 'function' && treeViewsFeature) {
      treeViewsList = rawConfig.eGet(treeViewsFeature)
    }
    console.log('[EditorConfig] saveToString - treeViews:', treeViewsList, 'length:', treeViewsList?.length ?? treeViewsList?.data?.length ?? 0)

    // Debug: check if treeViews items have proper container
    if (treeViewsList && treeViewsList.length > 0) {
      for (let i = 0; i < treeViewsList.length; i++) {
        const view = treeViewsList[i]
        console.log('[EditorConfig] saveToString - treeView[' + i + ']:', view?.name || view?._name,
          'eContainer:', view?.eContainer?.(),
          'eContainingFeature:', view?.eContainingFeature?.()?.getName?.())
      }
    }

    // Debug: check eIsSet for treeViews
    if (typeof rawConfig.eIsSet === 'function' && treeViewsFeature) {
      console.log('[EditorConfig] saveToString - eIsSet(treeViews):', rawConfig.eIsSet(treeViewsFeature))
    }

    const rawResource = toRaw(resource.value) as XMIResource
    const xmiContent = await rawResource.saveToString()
    console.log('[EditorConfig] XMI content length:', xmiContent.length)
    console.log('[EditorConfig] XMI contains treeViews?:', xmiContent.includes('treeViews'))
    console.log('[EditorConfig] XMI content preview:', xmiContent.substring(0, 1000))
    return xmiContent
  }

  /**
   * Save EditorConfig to repository file
   * @param saveFileFn Function to save file content to repository
   */
  async function saveToRepository(
    saveFileFn: (repo: any, file: any, content: string) => Promise<void>
  ): Promise<void> {
    if (!workspaceRepository.value || !workspaceFilePath.value) {
      throw new Error('No repository or file path set')
    }

    const content = await saveToString()

    // Create a file object with the path
    const file = { path: workspaceFilePath.value }
    await saveFileFn(workspaceRepository.value, file, content)

    dirty.value = false
    console.log('[EditorConfig] Saved to repository:', workspaceFilePath.value)
  }

  /**
   * Save EditorConfig via file system
   * @param writeFileFn Function to write file content
   */
  async function saveToFileSystem(
    writeFileFn: (entry: any, content: string) => Promise<void>
  ): Promise<void> {
    if (!workspaceFileEntry.value) {
      throw new Error('No file entry set for saving')
    }

    const content = await saveToString()
    await writeFileFn(workspaceFileEntry.value, content)

    dirty.value = false
    console.log('[EditorConfig] Saved to file system:', workspaceFilePath.value)
  }

  /**
   * Mark as dirty (needs saving)
   */
  function markDirty(): void {
    dirty.value = true
  }

  /**
   * Add an icon mapping
   */
  function addIconMapping(
    targetTypeUri: string,
    iconName: string,
    options?: {
      scope?: MappingScope
      priority?: number
      library?: IconLibrary
      variant?: string
    }
  ): IconMapping {
    if (!editorConfig.value) {
      throw new Error('EditorConfig not initialized')
    }

    // Create IconMapping
    const mapping = factory.createIconMapping()
    mapping.targetTypeUri = targetTypeUri
    mapping.scope = options?.scope ?? 0 as MappingScope // 0=TYPE_ONLY
    mapping.priority = options?.priority ?? 50

    // Create LibraryIcon
    const icon = factory.createLibraryIcon()
    icon.library = options?.library ?? 1 as IconLibrary // 1=CUSTOM
    icon.name = iconName
    if (options?.variant) {
      icon.variant = options.variant
    }
    mapping.icon = icon

    // Add to config - use eGet() for DynamicEObject compatibility
    const rawConfig = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl), then eGet (DynamicEObject)
    let mappings = rawConfig.iconMappings
    if (mappings === undefined && typeof rawConfig.eGet === 'function') {
      // DynamicEObject - use reflective API
      const eClass = rawConfig.eClass()
      const iconMappingsFeature = eClass.getEStructuralFeature('iconMappings')
      if (iconMappingsFeature) {
        mappings = rawConfig.eGet(iconMappingsFeature)
      }
    }

    if (mappings && typeof mappings.add === 'function') {
      // EList has add() method
      mappings.add(mapping)
    } else if (mappings && typeof mappings.push === 'function') {
      // Plain array fallback
      mappings.push(mapping)
    } else {
      console.error('[EditorConfig] Cannot add to iconMappings - no add/push method, mappings:', mappings)
    }

    dirty.value = true

    // Trigger reactivity for shallowRef
    triggerRef(editorConfig)

    // Update icon registry
    loadIconsFromConfig(rawConfig)

    console.log('[EditorConfig] Added icon mapping:', targetTypeUri, '->', iconName)
    return mapping
  }

  /**
   * Remove an icon mapping
   */
  function removeIconMapping(mapping: IconMapping): boolean {
    if (!editorConfig.value) return false

    const rawConfig = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl), then eGet (DynamicEObject)
    let mappings = rawConfig.iconMappings
    if (mappings === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const iconMappingsFeature = eClass.getEStructuralFeature('iconMappings')
      if (iconMappingsFeature) {
        mappings = rawConfig.eGet(iconMappingsFeature)
      }
    }

    if (mappings && typeof mappings.remove === 'function') {
      // EList has remove() method
      mappings.remove(mapping)
    } else if (mappings) {
      // Plain array fallback
      const index = mappings.indexOf(mapping)
      if (index >= 0) {
        mappings.splice(index, 1)
      }
    }

    dirty.value = true

    // Trigger reactivity for shallowRef
    triggerRef(editorConfig)

    // Update icon registry
    loadIconsFromConfig(rawConfig)

    console.log('[EditorConfig] Removed icon mapping')
    return true
  }

  /**
   * Clear all custom icon mappings
   */
  function clearIconMappings(): void {
    if (!editorConfig.value) return

    const rawConfig = toRaw(editorConfig.value) as any

    // Try property access first (EditorConfigImpl), then eGet (DynamicEObject)
    let mappings = rawConfig.iconMappings
    if (mappings === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const iconMappingsFeature = eClass.getEStructuralFeature('iconMappings')
      if (iconMappingsFeature) {
        mappings = rawConfig.eGet(iconMappingsFeature)
      }
    }

    if (mappings && typeof mappings.clear === 'function') {
      // EList has clear() method
      mappings.clear()
    } else if (mappings) {
      // Plain array fallback
      mappings.length = 0
    }

    dirty.value = true

    // Trigger reactivity for shallowRef
    triggerRef(editorConfig)

    // Update icon registry
    loadIconsFromConfig(rawConfig)

    console.log('[EditorConfig] Cleared all icon mappings')
  }

  // ============================================
  // Custom Icon Libraries Management
  // ============================================

  /**
   * Register all custom icons from the EditorConfig into the icon provider registry.
   * Called on workspace load and after add/remove.
   */
  function loadCustomIconsIntoRegistry(): void {
    const icons = customIconLibraries.value.map((e: any) => {
      const raw = toRaw(e) as any
      return {
        id: getFeatureValue(raw, 'id') || '',
        label: getFeatureValue(raw, 'label') || '',
        category: getFeatureValue(raw, 'category') || 'custom',
        dataUrl: getFeatureValue(raw, 'dataUrl') || '',
        keywords: getFeatureValue(raw, 'keywords') || ''
      }
    })

    iconProviderRegistry.unregister(CUSTOM_ICONS_PROVIDER_ID)
    if (icons.length > 0) {
      const iconsRef = ref(icons)
      const provider = new CustomIconProvider(iconsRef)
      iconProviderRegistry.register(provider)
      console.log('[EditorConfig] Registered CustomIconProvider with', icons.length, 'icons')
    }
  }

  /**
   * Add a custom icon to the EditorConfig
   */
  function addCustomIcon(options: CustomIconEntry): CustomIconDefinition | null {
    if (!editorConfig.value) {
      console.error('[EditorConfig] EditorConfig not initialized')
      return null
    }

    const iconDef = factory.createCustomIconDefinition()
    const rawIcon = toRaw(iconDef) as any
    setFeatureValue(rawIcon, 'id', options.id)
    setFeatureValue(rawIcon, 'label', options.label || options.id)
    setFeatureValue(rawIcon, 'category', options.category || 'custom')
    setFeatureValue(rawIcon, 'dataUrl', options.dataUrl)
    setFeatureValue(rawIcon, 'keywords', options.keywords || '')

    const rawConfig = toRaw(editorConfig.value) as any
    let libs = rawConfig.customIconLibraries
    if (libs === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const feature = eClass.getEStructuralFeature('customIconLibraries')
      if (feature) {
        libs = rawConfig.eGet(feature)
      }
    }

    if (libs && typeof libs.add === 'function') {
      libs.add(iconDef)
    } else if (libs && typeof libs.push === 'function') {
      libs.push(iconDef)
    } else {
      console.error('[EditorConfig] Cannot add to customIconLibraries')
      return null
    }

    dirty.value = true
    triggerRef(editorConfig)
    loadCustomIconsIntoRegistry()

    console.log('[EditorConfig] Added custom icon:', options.id)
    return iconDef as CustomIconDefinition
  }

  /**
   * Remove a custom icon from the EditorConfig
   */
  function removeCustomIcon(icon: CustomIconDefinition): boolean {
    if (!editorConfig.value) return false

    const rawConfig = toRaw(editorConfig.value) as any
    let libs = rawConfig.customIconLibraries
    if (libs === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const feature = eClass.getEStructuralFeature('customIconLibraries')
      if (feature) {
        libs = rawConfig.eGet(feature)
      }
    }

    if (libs && typeof libs.remove === 'function') {
      libs.remove(icon)
    } else if (libs) {
      const index = libs.indexOf(icon)
      if (index >= 0) libs.splice(index, 1)
    }

    dirty.value = true
    triggerRef(editorConfig)
    loadCustomIconsIntoRegistry()

    console.log('[EditorConfig] Removed custom icon')
    return true
  }

  // ============================================
  // Model Source Management
  // ============================================

  /**
   * Helper to get feature value from EObject (supports both Impl and DynamicEObject)
   */
  function getFeatureValue(obj: any, featureName: string): any {
    if (obj[featureName] !== undefined) {
      return obj[featureName]
    }
    if (typeof obj.eGet === 'function') {
      const eClass = obj.eClass()
      const feature = eClass?.getEStructuralFeature(featureName)
      if (feature) {
        return obj.eGet(feature)
      }
    }
    return undefined
  }

  /**
   * Add a model source
   * @param location The file path or URI of the model
   * @param name Optional display name (defaults to filename)
   * @param options Additional options
   */
  function addModelSource(
    location: string,
    name?: string,
    options?: {
      registerPackages?: boolean
      enabled?: boolean
    }
  ): ModelSource | null {
    console.log('[EditorConfig] addModelSource called:', location, name, options)

    if (!editorConfig.value) {
      console.error('[EditorConfig] EditorConfig not initialized')
      return null
    }

    // Check if already exists
    const existing = findModelSourceByLocation(location)
    if (existing) {
      console.log('[EditorConfig] Model source already exists:', location)
      return existing
    }

    // Create ModelSource
    const modelSource = factory.createModelSource()
    modelSource.location = location
    modelSource.name = name || location.split('/').pop() || location
    modelSource.registerPackages = options?.registerPackages ?? true
    modelSource.enabled = options?.enabled ?? true
    console.log('[EditorConfig] Created modelSource:', modelSource.location, modelSource.name)

    // Add to config
    const rawConfig = toRaw(editorConfig.value) as any

    let sources = rawConfig.modelSources
    console.log('[EditorConfig] rawConfig.modelSources:', sources, 'type:', typeof sources)

    if (sources === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const modelSourcesFeature = eClass.getEStructuralFeature('modelSources')
      console.log('[EditorConfig] Using eGet, modelSourcesFeature:', modelSourcesFeature?.getName?.())
      if (modelSourcesFeature) {
        sources = rawConfig.eGet(modelSourcesFeature)
        console.log('[EditorConfig] Got sources via eGet:', sources, 'length:', sources?.length ?? sources?.data?.length)
      }
    }

    if (sources && typeof sources.add === 'function') {
      console.log('[EditorConfig] Adding via sources.add()')
      sources.add(modelSource)
      console.log('[EditorConfig] After add, sources length:', sources.length ?? sources.data?.length)
    } else if (sources && typeof sources.push === 'function') {
      console.log('[EditorConfig] Adding via sources.push()')
      sources.push(modelSource)
    } else {
      console.error('[EditorConfig] Cannot add to modelSources - no add/push method, sources:', sources)
      return null
    }

    dirty.value = true
    triggerRef(editorConfig)

    // Verify the addition
    const allSources = modelSources.value
    console.log('[EditorConfig] Added model source:', location, '- total modelSources now:', allSources.length)

    return modelSource
  }

  /**
   * Remove a model source
   */
  function removeModelSource(modelSource: ModelSource): boolean {
    if (!editorConfig.value) return false

    const rawConfig = toRaw(editorConfig.value) as any

    let sources = rawConfig.modelSources
    if (sources === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const modelSourcesFeature = eClass.getEStructuralFeature('modelSources')
      if (modelSourcesFeature) {
        sources = rawConfig.eGet(modelSourcesFeature)
      }
    }

    if (sources && typeof sources.remove === 'function') {
      sources.remove(modelSource)
    } else if (sources) {
      const index = sources.indexOf(modelSource)
      if (index >= 0) {
        sources.splice(index, 1)
      }
    }

    dirty.value = true
    triggerRef(editorConfig)

    console.log('[EditorConfig] Removed model source')
    return true
  }

  /**
   * Find a model source by location
   */
  function findModelSourceByLocation(location: string): ModelSource | null {
    for (const source of modelSources.value) {
      const loc = getFeatureValue(source, 'location')
      if (loc === location) {
        return source
      }
    }
    return null
  }

  /**
   * Clear all model sources
   */
  function clearModelSources(): void {
    if (!editorConfig.value) return

    const rawConfig = toRaw(editorConfig.value) as any

    let sources = rawConfig.modelSources
    if (sources === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const modelSourcesFeature = eClass.getEStructuralFeature('modelSources')
      if (modelSourcesFeature) {
        sources = rawConfig.eGet(modelSourcesFeature)
      }
    }

    if (sources && typeof sources.clear === 'function') {
      sources.clear()
    } else if (sources) {
      sources.length = 0
    }

    dirty.value = true
    triggerRef(editorConfig)

    console.log('[EditorConfig] Cleared all model sources')
  }

  // ============================================
  // Instance Source Management
  // ============================================

  /**
   * Add an instance source
   * @param location The file path or URI of the instance XMI file
   * @param name Optional display name (defaults to filename)
   * @param options Additional options
   */
  function addInstanceSource(
    location: string,
    name?: string,
    options?: {
      resolution?: ResolutionStrategy
      enabled?: boolean
    }
  ): InstanceSource | null {
    if (!editorConfig.value) {
      console.error('[EditorConfig] EditorConfig not initialized')
      return null
    }

    // Check if already exists
    const existing = findInstanceSourceByLocation(location)
    if (existing) {
      console.log('[EditorConfig] Instance source already exists:', location)
      return existing
    }

    // Create InstanceSource
    const instanceSource = factory.createInstanceSource()
    instanceSource.location = location
    instanceSource.name = name || location.split('/').pop() || location
    instanceSource.resolution = options?.resolution ?? 0 as ResolutionStrategy // 0=RELATIVE_TO_CONFIG
    instanceSource.enabled = options?.enabled ?? true

    // Add to config
    const rawConfig = toRaw(editorConfig.value) as any

    let sources = rawConfig.instanceSources
    if (sources === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const instanceSourcesFeature = eClass.getEStructuralFeature('instanceSources')
      if (instanceSourcesFeature) {
        sources = rawConfig.eGet(instanceSourcesFeature)
      }
    }

    if (sources && typeof sources.add === 'function') {
      sources.add(instanceSource)
    } else if (sources && typeof sources.push === 'function') {
      sources.push(instanceSource)
    } else {
      console.error('[EditorConfig] Cannot add to instanceSources - no add/push method')
      return null
    }

    dirty.value = true
    triggerRef(editorConfig)

    console.log('[EditorConfig] Added instance source:', location)
    return instanceSource
  }

  /**
   * Remove an instance source
   */
  function removeInstanceSource(instanceSource: InstanceSource): boolean {
    if (!editorConfig.value) return false

    const rawConfig = toRaw(editorConfig.value) as any

    let sources = rawConfig.instanceSources
    if (sources === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const instanceSourcesFeature = eClass.getEStructuralFeature('instanceSources')
      if (instanceSourcesFeature) {
        sources = rawConfig.eGet(instanceSourcesFeature)
      }
    }

    if (sources && typeof sources.remove === 'function') {
      sources.remove(instanceSource)
    } else if (sources) {
      const index = sources.indexOf(instanceSource)
      if (index >= 0) {
        sources.splice(index, 1)
      }
    }

    dirty.value = true
    triggerRef(editorConfig)

    console.log('[EditorConfig] Removed instance source')
    return true
  }

  /**
   * Find an instance source by location
   */
  function findInstanceSourceByLocation(location: string): InstanceSource | null {
    for (const source of instanceSources.value) {
      const loc = getFeatureValue(source, 'location')
      if (loc === location) {
        return source
      }
    }
    return null
  }

  /**
   * Clear all instance sources
   */
  function clearInstanceSources(): void {
    if (!editorConfig.value) return

    const rawConfig = toRaw(editorConfig.value) as any

    let sources = rawConfig.instanceSources
    if (sources === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const instanceSourcesFeature = eClass.getEStructuralFeature('instanceSources')
      if (instanceSourcesFeature) {
        sources = rawConfig.eGet(instanceSourcesFeature)
      }
    }

    if (sources && typeof sources.clear === 'function') {
      sources.clear()
    } else if (sources) {
      sources.length = 0
    }

    dirty.value = true
    triggerRef(editorConfig)

    console.log('[EditorConfig] Cleared all instance sources')
  }

  // ============================================
  // Layout Configuration Management
  // ============================================

  /**
   * Helper to set feature value on EObject (supports both Impl and DynamicEObject)
   */
  function setFeatureValue(obj: any, featureName: string, value: any): void {
    if (obj[featureName] !== undefined || !(typeof obj.eGet === 'function')) {
      // Direct property access
      obj[featureName] = value
    } else {
      // DynamicEObject - use reflective API
      const eClass = obj.eClass()
      const feature = eClass?.getEStructuralFeature(featureName)
      if (feature && typeof obj.eSet === 'function') {
        obj.eSet(feature, value)
      }
    }
  }

  /**
   * Get or create LayoutConfig
   */
  function getOrCreateLayoutConfig(): LayoutConfig {
    if (!editorConfig.value) {
      throw new Error('EditorConfig not initialized')
    }

    const rawConfig = toRaw(editorConfig.value) as any
    let layout = layoutConfig.value

    if (!layout) {
      // Create new LayoutConfig
      layout = factory.createLayoutConfig()

      // Set on EditorConfig
      if (rawConfig.layoutConfig !== undefined || !(typeof rawConfig.eSet === 'function')) {
        rawConfig.layoutConfig = layout
      } else {
        const eClass = rawConfig.eClass()
        const layoutConfigFeature = eClass.getEStructuralFeature('layoutConfig')
        if (layoutConfigFeature) {
          rawConfig.eSet(layoutConfigFeature, layout)
        }
      }

      dirty.value = true
      triggerRef(editorConfig)
      console.log('[EditorConfig] Created new LayoutConfig')
    }

    return layout
  }

  /**
   * Update layout configuration from layout state
   * @param dimensions Panel dimensions
   * @param visibility Panel visibility settings
   * @param activeActivityId Currently active activity
   */
  function updateLayoutConfig(
    dimensions: {
      primarySidebarWidth?: number
      secondarySidebarWidth?: number
      panelAreaHeight?: number
    },
    visibility: {
      primarySidebar?: boolean
      secondarySidebar?: boolean
      panelArea?: boolean
      activityBar?: boolean
      statusBar?: boolean
    },
    activeActivityId?: string | null,
    panelPositions?: PanelPositionData[]
  ): void {
    const layout = getOrCreateLayoutConfig()
    const rawLayout = toRaw(layout) as any

    // Update dimensions
    if (dimensions.primarySidebarWidth !== undefined) {
      setFeatureValue(rawLayout, 'primarySidebarWidth', dimensions.primarySidebarWidth)
    }
    if (dimensions.secondarySidebarWidth !== undefined) {
      setFeatureValue(rawLayout, 'secondarySidebarWidth', dimensions.secondarySidebarWidth)
    }
    if (dimensions.panelAreaHeight !== undefined) {
      setFeatureValue(rawLayout, 'panelAreaHeight', dimensions.panelAreaHeight)
    }

    // Update visibility
    if (visibility.primarySidebar !== undefined) {
      setFeatureValue(rawLayout, 'primarySidebarVisible', visibility.primarySidebar)
    }
    if (visibility.secondarySidebar !== undefined) {
      setFeatureValue(rawLayout, 'secondarySidebarVisible', visibility.secondarySidebar)
    }
    if (visibility.panelArea !== undefined) {
      setFeatureValue(rawLayout, 'panelAreaVisible', visibility.panelArea)
    }
    if (visibility.activityBar !== undefined) {
      setFeatureValue(rawLayout, 'activityBarVisible', visibility.activityBar)
    }
    if (visibility.statusBar !== undefined) {
      setFeatureValue(rawLayout, 'statusBarVisible', visibility.statusBar)
    }

    // Update active activity
    if (activeActivityId !== undefined) {
      setFeatureValue(rawLayout, 'activeActivityId', activeActivityId || '')
    }

    // Update panel positions
    if (panelPositions !== undefined) {
      updatePanelPositions(rawLayout, panelPositions)
    }

    dirty.value = true
    triggerRef(editorConfig)
    console.log('[EditorConfig] Updated layout config')
  }

  /**
   * Update panel positions in LayoutConfig
   */
  function updatePanelPositions(rawLayout: any, positions: PanelPositionData[]): void {
    // Get or create panelPositions list
    const positionsList = getFeatureValue(rawLayout, 'panelPositions')

    // Clear existing positions
    if (positionsList && typeof positionsList.clear === 'function') {
      positionsList.clear()
    } else if (positionsList && Array.isArray(positionsList)) {
      positionsList.length = 0
    }

    // Add new positions
    for (const pos of positions) {
      const panelPosition = factory.createPanelPosition()
      setFeatureValue(panelPosition, 'panelId', pos.panelId)
      // Map location string to enum value (0=PRIMARY, 1=SECONDARY, 2=BOTTOM)
      const locationValue = pos.location === 'primary' ? 0 : pos.location === 'secondary' ? 1 : 2
      setFeatureValue(panelPosition, 'location', locationValue)
      setFeatureValue(panelPosition, 'order', pos.order)

      if (positionsList && typeof positionsList.add === 'function') {
        positionsList.add(panelPosition)
      } else if (positionsList && typeof positionsList.push === 'function') {
        positionsList.push(panelPosition)
      }
    }
  }

  /**
   * Get layout values for applying to layout state
   * Returns null if no layout config exists
   */
  function getLayoutValues(): {
    dimensions: {
      primarySidebarWidth: number
      secondarySidebarWidth: number
      panelAreaHeight: number
    }
    visibility: {
      primarySidebar: boolean
      secondarySidebar: boolean
      panelArea: boolean
      activityBar: boolean
      statusBar: boolean
    }
    activeActivityId: string | null
    panelPositions: PanelPositionData[]
  } | null {
    const layout = layoutConfig.value
    if (!layout) return null

    const rawLayout = toRaw(layout) as any

    // Get panel positions and convert to data format
    const panelPositions: PanelPositionData[] = []
    const positionsList = getFeatureValue(rawLayout, 'panelPositions')
    if (positionsList) {
      const positions = typeof positionsList.toArray === 'function' ? positionsList.toArray() : positionsList
      for (const pos of positions) {
        const rawPos = toRaw(pos) as any
        const panelId = getFeatureValue(rawPos, 'panelId')
        const locationValue = getFeatureValue(rawPos, 'location') ?? 0
        const order = getFeatureValue(rawPos, 'order') ?? 0

        // Map enum value back to string (0=PRIMARY, 1=SECONDARY, 2=BOTTOM)
        const location: 'primary' | 'secondary' | 'editor' | 'bottom' =
          locationValue === 0 ? 'primary' :
          locationValue === 1 ? 'secondary' : 'bottom'

        if (panelId) {
          panelPositions.push({ panelId, location, order })
        }
      }
    }

    return {
      dimensions: {
        primarySidebarWidth: getFeatureValue(rawLayout, 'primarySidebarWidth') ?? 260,
        secondarySidebarWidth: getFeatureValue(rawLayout, 'secondarySidebarWidth') ?? 300,
        panelAreaHeight: getFeatureValue(rawLayout, 'panelAreaHeight') ?? 200
      },
      visibility: {
        primarySidebar: getFeatureValue(rawLayout, 'primarySidebarVisible') ?? true,
        secondarySidebar: getFeatureValue(rawLayout, 'secondarySidebarVisible') ?? true,
        panelArea: getFeatureValue(rawLayout, 'panelAreaVisible') ?? false,
        activityBar: getFeatureValue(rawLayout, 'activityBarVisible') ?? true,
        statusBar: getFeatureValue(rawLayout, 'statusBarVisible') ?? true
      },
      activeActivityId: getFeatureValue(rawLayout, 'activeActivityId') || null,
      panelPositions
    }
  }

  // ============================================
  // Tree Views Management
  // ============================================

  /**
   * TreeViewState and TreeFilterState types for sync with useViews composable
   */
  interface TreeViewState {
    id: string
    name: string
    description?: string
    enabled: boolean
    filters: TreeFilterState[]
    // Perspective configuration
    showInActivityBar?: boolean
    perspectiveIcon?: string
    perspectiveOrder?: number
  }

  interface TreeFilterState {
    filterType: 'ECLASS_TYPE' | 'ELEMENT'
    targetTypeUri?: string
    scope?: 'TYPE_ONLY' | 'TYPE_AND_SUBTYPES'
    elementUri?: string
    hidden: boolean
  }

  /**
   * Set the active view ID
   */
  function setActiveViewId(viewId: string | null): void {
    if (!editorConfig.value) return

    const rawConfig = toRaw(editorConfig.value) as any
    setFeatureValue(rawConfig, 'activeViewId', viewId || '')

    dirty.value = true
    triggerRef(editorConfig)
    console.log('[EditorConfig] Set active view ID:', viewId)
  }

  /**
   * Add a tree view
   */
  function addTreeView(viewState: TreeViewState): TreeView | null {
    if (!editorConfig.value) {
      console.error('[EditorConfig] EditorConfig not initialized')
      return null
    }

    // Create TreeView
    const treeView = factory.createTreeView()
    setFeatureValue(treeView, 'id', viewState.id)
    setFeatureValue(treeView, 'name', viewState.name)
    if (viewState.description) {
      setFeatureValue(treeView, 'description', viewState.description)
    }
    setFeatureValue(treeView, 'enabled', viewState.enabled)

    // Set perspective configuration
    if (viewState.showInActivityBar !== undefined) {
      setFeatureValue(treeView, 'showInActivityBar', viewState.showInActivityBar)
    }
    if (viewState.perspectiveIcon) {
      setFeatureValue(treeView, 'perspectiveIcon', viewState.perspectiveIcon)
    }
    if (viewState.perspectiveOrder !== undefined) {
      setFeatureValue(treeView, 'perspectiveOrder', viewState.perspectiveOrder)
    }

    // Create filters array
    const filters: any[] = []
    for (const filterState of viewState.filters) {
      const filter = factory.createTreeFilter()
      // FilterType enum is empty in codegen, use numeric value (0=ECLASS_TYPE, 1=ELEMENT)
      const filterTypeValue = filterState.filterType === 'ECLASS_TYPE' ? 0 : 1
      setFeatureValue(filter, 'filterType', filterTypeValue)
      if (filterState.targetTypeUri) {
        setFeatureValue(filter, 'targetTypeUri', filterState.targetTypeUri)
      }
      if (filterState.scope) {
        // MappingScope: 0=TYPE_ONLY, 1=TYPE_AND_SUBTYPES
        const scopeValue = filterState.scope === 'TYPE_ONLY' ? 0 : 1
        setFeatureValue(filter, 'scope', scopeValue)
      }
      if (filterState.elementUri) {
        setFeatureValue(filter, 'elementUri', filterState.elementUri)
      }
      setFeatureValue(filter, 'hidden', filterState.hidden)
      filters.push(filter)
    }

    // Set filters array directly on TreeView
    setFeatureValue(treeView, 'filters', filters)
    console.log('[EditorConfig] Added TreeView with', filters.length, 'filters')

    // Add to config
    const rawConfig = toRaw(editorConfig.value) as any
    const eClass = rawConfig.eClass?.()
    const treeViewsFeature = eClass?.getEStructuralFeature('treeViews')

    // Get treeViews list via eGet - this creates the EObjectContainmentEList if it doesn't exist
    let viewsList: any
    if (typeof rawConfig.eGet === 'function' && treeViewsFeature) {
      // eGet will create an EObjectContainmentEList if the feature is many-valued and containment
      viewsList = rawConfig.eGet(treeViewsFeature)
      console.log('[EditorConfig] addTreeView - got viewsList via eGet:', viewsList?.constructor?.name, 'length:', viewsList?.length ?? viewsList?.size?.())
    } else {
      // Fallback for EditorConfigImpl
      viewsList = rawConfig.treeViews
      if (!viewsList) {
        rawConfig.treeViews = []
        viewsList = rawConfig.treeViews
      }
      console.log('[EditorConfig] addTreeView - got viewsList via property:', viewsList?.constructor?.name)
    }

    // Add the tree view to the list using EList's add() method
    // The EObjectContainmentEList will automatically set the container
    if (viewsList && typeof viewsList.add === 'function') {
      viewsList.add(treeView)
      console.log('[EditorConfig] Added treeView via EList.add(), list length now:', viewsList.length ?? viewsList.size?.())
    } else if (viewsList && typeof viewsList.push === 'function') {
      viewsList.push(treeView)
      console.log('[EditorConfig] Added treeView via push(), list length now:', viewsList.length)
    } else {
      console.error('[EditorConfig] Cannot add to treeViews - viewsList:', viewsList, 'type:', typeof viewsList)
      return null
    }

    // Verify container was set
    const container = (treeView as any).eContainer?.()
    console.log('[EditorConfig] TreeView container after add:', container ? 'set' : 'NOT SET')

    dirty.value = true
    triggerRef(editorConfig)

    console.log('[EditorConfig] Added tree view:', viewState.name)
    return treeView
  }

  /**
   * Remove a tree view by ID
   */
  function removeTreeView(viewId: string): boolean {
    if (!editorConfig.value) return false

    const rawConfig = toRaw(editorConfig.value) as any

    let viewsList = rawConfig.treeViews
    if (viewsList === undefined && typeof rawConfig.eGet === 'function') {
      const eClass = rawConfig.eClass()
      const treeViewsFeature = eClass.getEStructuralFeature('treeViews')
      if (treeViewsFeature) {
        viewsList = rawConfig.eGet(treeViewsFeature)
      }
    }

    if (!viewsList) return false

    // Find view by ID
    const views = typeof viewsList.toArray === 'function' ? viewsList.toArray() : viewsList
    let viewToRemove: any = null
    for (const view of views) {
      const id = getFeatureValue(toRaw(view), 'id')
      if (id === viewId) {
        viewToRemove = view
        break
      }
    }

    if (!viewToRemove) return false

    if (typeof viewsList.remove === 'function') {
      viewsList.remove(viewToRemove)
    } else if (Array.isArray(viewsList)) {
      const index = viewsList.indexOf(viewToRemove)
      if (index >= 0) {
        viewsList.splice(index, 1)
      }
    }

    // Clear activeViewId if it was the deleted view
    if (activeViewId.value === viewId) {
      setActiveViewId(null)
    }

    dirty.value = true
    triggerRef(editorConfig)

    console.log('[EditorConfig] Removed tree view:', viewId)
    return true
  }

  /**
   * Clear all tree views
   */
  function clearTreeViews(): void {
    if (!editorConfig.value) return

    const rawConfig = toRaw(editorConfig.value) as any
    const eClass = rawConfig.eClass?.()
    const treeViewsFeature = eClass?.getEStructuralFeature('treeViews')

    // Use eGet to get (or create) the EList
    let viewsList: any
    if (typeof rawConfig.eGet === 'function' && treeViewsFeature) {
      viewsList = rawConfig.eGet(treeViewsFeature)
    } else {
      viewsList = rawConfig.treeViews
    }

    console.log('[EditorConfig] clearTreeViews - list type:', viewsList?.constructor?.name, 'length:', viewsList?.length ?? viewsList?.size?.())

    if (viewsList && typeof viewsList.clear === 'function') {
      viewsList.clear()
      console.log('[EditorConfig] Cleared via EList.clear()')
    } else if (viewsList && Array.isArray(viewsList)) {
      viewsList.length = 0
      console.log('[EditorConfig] Cleared via array.length = 0')
    }

    setActiveViewId(null)

    dirty.value = true
    triggerRef(editorConfig)

    console.log('[EditorConfig] Cleared all tree views')
  }

  /**
   * Sync tree views from useViews composable to EditorConfig
   * Call this before saving to persist the current views state
   */
  function syncTreeViewsFromComposable(viewsData: { views: TreeViewState[], activeViewId: string | null }): void {
    if (!editorConfig.value) {
      console.warn('[EditorConfig] syncTreeViewsFromComposable - no editorConfig')
      return
    }

    console.log('[EditorConfig] syncTreeViewsFromComposable - starting with', viewsData.views.length, 'views to sync')

    // Clear existing views (this also initializes treeViews if needed)
    clearTreeViews()

    // Add all views from composable
    let addedCount = 0
    for (const viewState of viewsData.views) {
      console.log('[EditorConfig] syncTreeViewsFromComposable - adding view:', viewState.name, 'with', viewState.filters.length, 'filters')
      const result = addTreeView(viewState)
      if (result) {
        addedCount++
      } else {
        console.error('[EditorConfig] syncTreeViewsFromComposable - failed to add view:', viewState.name)
      }
    }

    // Set active view ID
    if (viewsData.activeViewId) {
      setActiveViewId(viewsData.activeViewId)
    }

    console.log('[EditorConfig] syncTreeViewsFromComposable - completed, added', addedCount, 'of', viewsData.views.length, 'views')
  }

  /**
   * Load tree views from EditorConfig into useViews composable format
   * Returns data in the format expected by useViews.fromJSON()
   */
  function getTreeViewsForComposable(): { views: TreeViewState[], activeViewId: string | null } {
    const result: { views: TreeViewState[], activeViewId: string | null } = {
      views: [],
      activeViewId: activeViewId.value
    }

    for (const view of treeViews.value) {
      const rawView = toRaw(view) as any
      const viewState: TreeViewState = {
        id: getFeatureValue(rawView, 'id') || '',
        name: getFeatureValue(rawView, 'name') || '',
        description: getFeatureValue(rawView, 'description'),
        enabled: getFeatureValue(rawView, 'enabled') ?? true,
        filters: [],
        // Perspective configuration
        showInActivityBar: getFeatureValue(rawView, 'showInActivityBar') ?? false,
        perspectiveIcon: getFeatureValue(rawView, 'perspectiveIcon'),
        perspectiveOrder: getFeatureValue(rawView, 'perspectiveOrder') ?? 100
      }

      // Get filters
      const filtersList = getFeatureValue(rawView, 'filters')
      if (filtersList) {
        const filters = typeof filtersList.toArray === 'function' ? filtersList.toArray() : filtersList
        for (const filter of filters) {
          const rawFilter = toRaw(filter) as any
          const filterTypeValue = getFeatureValue(rawFilter, 'filterType')
          // Map numeric value back to string (0=ECLASS_TYPE, 1=ELEMENT)
          const filterType: 'ECLASS_TYPE' | 'ELEMENT' = filterTypeValue === 1 ? 'ELEMENT' : 'ECLASS_TYPE'

          const scopeValue = getFeatureValue(rawFilter, 'scope')
          // Map MappingScope back to string (0=TYPE_ONLY, 1=TYPE_AND_SUBTYPES)
          const scope: 'TYPE_ONLY' | 'TYPE_AND_SUBTYPES' = scopeValue === 1 ? 'TYPE_AND_SUBTYPES' : 'TYPE_ONLY'

          viewState.filters.push({
            filterType,
            targetTypeUri: getFeatureValue(rawFilter, 'targetTypeUri'),
            scope,
            elementUri: getFeatureValue(rawFilter, 'elementUri'),
            hidden: getFeatureValue(rawFilter, 'hidden') ?? true
          })
        }
      }

      result.views.push(viewState)
    }

    return result
  }

  /**
   * Reset state (when switching workspaces)
   */
  function reset(): void {
    resource.value = null
    editorConfig.value = null
    workspaceFilePath.value = null
    workspaceRepository.value = null
    workspaceFileEntry.value = null
    initialized.value = false
    dirty.value = false
  }

  return {
    // State
    editorConfig,
    customIconLibraries,
    iconMappings,
    modelSources,
    instanceSources,
    layoutConfig,
    treeViews,
    activeViewId,
    packageResolverChain,
    initialized,
    loading,
    dirty,
    workspaceFilePath,
    workspaceRepository,
    workspaceFileEntry,

    // Methods
    loadFromString,
    loadFromRepository,
    createNewConfig,
    saveToString,
    saveToRepository,
    saveToFileSystem,
    setFileEntry,
    markDirty,
    reset,
    // Icon mapping methods
    addIconMapping,
    removeIconMapping,
    clearIconMappings,
    // Custom icon library methods
    addCustomIcon,
    removeCustomIcon,
    loadCustomIconsIntoRegistry,
    // Model source methods
    addModelSource,
    removeModelSource,
    findModelSourceByLocation,
    clearModelSources,
    // Instance source methods
    addInstanceSource,
    removeInstanceSource,
    findInstanceSourceByLocation,
    clearInstanceSources,
    // Layout config methods
    getOrCreateLayoutConfig,
    updateLayoutConfig,
    getLayoutValues,
    // Tree views methods
    setActiveViewId,
    addTreeView,
    removeTreeView,
    clearTreeViews,
    syncTreeViewsFromComposable,
    getTreeViewsForComposable,
    // Package resolver chain methods
    getOrCreatePackageResolverChain,
    addPackageResolver,
    removePackageResolver
  }
}

/**
 * Public service type for TSM consumers
 */
export type EditorConfigService = ReturnType<typeof useEditorConfig>

/**
 * Shared singleton instance
 */
let sharedInstance: EditorConfigService | null = null

export function useSharedEditorConfig() {
  if (!sharedInstance) {
    console.log('[EditorConfig] Creating new shared instance')
    sharedInstance = useEditorConfig()
    // Create default in-memory config immediately
    // This allows editing before a workspace file is opened
    sharedInstance.createNewConfig()
    console.log('[EditorConfig] Created default in-memory config, initialized:', sharedInstance.initialized.value)
  }
  return sharedInstance
}

/**
 * Get the shared EditorConfig (for use in other packages)
 * Returns null if not initialized
 */
export function getGlobalEditorConfig(): ReturnType<typeof useEditorConfig> | null {
  return sharedInstance
}
