/**
 * useModelView Composable
 *
 * Manages a configurable view into an EMF model hierarchy.
 * The view defines which levels are visible (depth) and which classes are filtered.
 */

import { ref, computed, watch, shallowRef, triggerRef, toRaw } from 'tsm:vue'
import type { Ref } from 'tsm:vue'
import type { Resource, EObject, EClass, EReference } from '@emfts/core'
import { EContentAdapter, type Notification, getEcorePackage } from '@emfts/core'
import type {
  ModelView,
  ModelLevel,
  ClassFilter,
  ModelTreeNode,
  Perspective
} from '../types'
import { DEFAULT_PERSPECTIVES } from '../types'

/**
 * Content adapter that triggers Vue reactivity on model changes
 */
class ViewContentAdapter extends EContentAdapter {
  private onChanged: () => void

  constructor(onChanged: () => void) {
    super()
    this.onChanged = onChanged
  }

  notifyChanged(notification: Notification): void {
    super.notifyChanged(notification)
    console.log('[ViewContentAdapter] Model changed:', notification.toString?.() || notification)
    this.onChanged()
  }
}

/**
 * Generate unique ID for an EObject
 */
let objectIdCounter = 0
const objectIdMap = new WeakMap<EObject, string>()

function getObjectId(obj: EObject): string {
  const rawObj = toRaw(obj)
  let id = objectIdMap.get(rawObj)
  if (!id) {
    id = `mv_${++objectIdCounter}`
    objectIdMap.set(rawObj, id)
  }
  return id
}

/**
 * Get display label for an EObject
 */
function getObjectLabel(obj: EObject): string {
  const rawObj = toRaw(obj)
  const eClass = rawObj.eClass()
  const className = eClass.getName()

  // Try 'name' attribute
  const nameFeature = eClass.getEStructuralFeature('name')
  if (nameFeature) {
    const name = rawObj.eGet(nameFeature)
    if (name) {
      if (className === 'EEnum') {
        return `${String(name)} <<enum>>`
      }
      return String(name)
    }
  }

  // Fallback to class name
  return `(${className})`
}

/**
 * Get icon for an EObject based on its EClass
 */
function getObjectIcon(obj: EObject): string {
  const rawObj = toRaw(obj)
  const eClass = rawObj.eClass()
  const className = eClass.getName()

  // Ecore-specific icons
  switch (className) {
    case 'EPackage':
      return 'pi pi-box'
    case 'EClass':
      if ((rawObj as any).isInterface?.()) return 'pi pi-share-alt'
      if ((rawObj as any).isAbstract?.()) return 'pi pi-file-edit'
      return 'pi pi-file'
    case 'EAttribute':
      return 'pi pi-minus'
    case 'EReference':
      if ((rawObj as any).isContainment?.()) return 'pi pi-inbox'
      return 'pi pi-arrow-right'
    case 'EDataType':
    case 'EEnum':
      return 'pi pi-hashtag'
    case 'EOperation':
      return 'pi pi-bolt'
    case 'EAnnotation':
      return 'pi pi-tag'
    case 'EEnumLiteral':
      return 'pi pi-circle'
    default:
      return 'pi pi-file'
  }
}

/**
 * Main Model View composable
 */
export function useModelView() {
  // ============ State ============

  /** Current view configuration */
  const currentView = ref<ModelView | null>(null)

  /** Current perspective */
  const currentPerspective = ref<Perspective | null>(null)

  /** All resources in the chain (from top metamodel to instances) */
  const resourceChain = shallowRef<Resource[]>([])

  /** Focus resource (the one being edited) */
  const focusResource = shallowRef<Resource | null>(null)

  /** Selected object */
  const selectedObject = shallowRef<EObject | null>(null)

  /** Expanded keys for tree */
  const expandedKeys = ref<Record<string, boolean>>({})

  /** Selected keys for tree */
  const selectedKeys = ref<Record<string, boolean>>({})

  /** Version counter for reactivity */
  const version = ref(0)

  /** Content adapters per resource */
  const adapters = new Map<Resource, ViewContentAdapter>()

  /** Available perspectives */
  const perspectives = ref<Perspective[]>([...DEFAULT_PERSPECTIVES])

  /** Custom user views */
  const savedViews = ref<ModelView[]>([])

  // ============ Computed ============

  /**
   * Find the focus level index in the resource chain
   */
  const focusIndex = computed((): number => {
    if (!focusResource.value || resourceChain.value.length === 0) return -1
    return resourceChain.value.findIndex(r => r === focusResource.value)
  })

  /**
   * Visible levels based on depth setting
   */
  const visibleLevels = computed((): ModelLevel[] => {
    const _ = version.value // dependency for reactivity

    if (!currentView.value || focusIndex.value < 0) return []

    const depth = currentView.value.depth
    const chain = resourceChain.value
    const fIdx = focusIndex.value

    // Calculate start index (how far up we can see)
    const startIndex = Math.max(0, fIdx - depth)

    const levels: ModelLevel[] = []
    for (let i = startIndex; i <= fIdx; i++) {
      const resource = chain[i]
      levels.push({
        resource,
        uri: resource.getURI()?.toString() || `level-${i}`,
        level: i,
        isFocus: i === fIdx,
        isReadonly: i < fIdx, // Levels above focus are readonly context
        metamodel: i > 0 ? chain[i - 1] : null
      })
    }

    return levels
  })

  /**
   * Build filtered tree nodes for all visible levels
   */
  const treeNodes = computed((): ModelTreeNode[] => {
    const _ = version.value // dependency for reactivity

    if (visibleLevels.value.length === 0) return []

    const nodes: ModelTreeNode[] = []

    for (const level of visibleLevels.value) {
      const resource = toRaw(level.resource)
      const contents = resource.getContents()
      const filter = currentView.value?.filters[level.uri]

      for (const obj of contents) {
        const node = buildTreeNode(toRaw(obj), level, filter)
        if (node && !node.filtered) {
          nodes.push(node)
        }
      }
    }

    return nodes
  })

  // ============ Methods ============

  /**
   * Trigger reactivity update
   */
  function triggerUpdate(): void {
    version.value++
    triggerRef(resourceChain)
    triggerRef(focusResource)
  }

  /**
   * Setup content adapter for a resource
   */
  function setupAdapter(resource: Resource): void {
    if (adapters.has(resource)) return

    const adapter = new ViewContentAdapter(triggerUpdate)
    adapters.set(resource, adapter)

    try {
      const resAdapters = (resource as any).eAdapters?.()
      if (resAdapters) {
        resAdapters.push(adapter)
        adapter.setTarget(resource as any)
        console.log('[ModelView] Adapter attached to resource:', resource.getURI()?.toString())
      }
    } catch (e) {
      console.warn('[ModelView] Failed to attach adapter:', e)
    }
  }

  /**
   * Remove content adapter from a resource
   */
  function removeAdapter(resource: Resource): void {
    const adapter = adapters.get(resource)
    if (!adapter) return

    try {
      const resAdapters = (resource as any).eAdapters?.()
      if (resAdapters) {
        const idx = resAdapters.indexOf(adapter)
        if (idx >= 0) resAdapters.splice(idx, 1)
      }
      adapter.unsetTarget(resource as any)
    } catch (e) {
      console.warn('[ModelView] Failed to remove adapter:', e)
    }

    adapters.delete(resource)
  }

  /**
   * Build a tree node for an EObject
   */
  function buildTreeNode(
    obj: EObject,
    level: ModelLevel,
    filter?: ClassFilter,
    parent?: ModelTreeNode
  ): ModelTreeNode | null {
    const eClass = obj.eClass()
    const className = eClass.getName()

    // Check if filtered out
    const isFiltered = isClassFiltered(className, filter)

    const node: ModelTreeNode = {
      key: getObjectId(obj),
      label: getObjectLabel(obj),
      icon: getObjectIcon(obj),
      data: obj,
      eClass,
      level,
      filtered: isFiltered,
      leaf: true,
      selectable: !level.isReadonly
    }

    // Build children from containment references
    const children: ModelTreeNode[] = []
    const containmentRefs = getContainmentReferences(eClass)

    for (const ref of containmentRefs) {
      const value = toRaw(obj.eGet(ref))
      if (!value) continue

      const items = Array.isArray(value) || (value as any)[Symbol.iterator]
        ? Array.from(value as Iterable<any>)
        : [value]

      for (const child of items) {
        if (child && typeof child.eClass === 'function') {
          const childNode = buildTreeNode(toRaw(child), level, filter, node)
          if (childNode && !childNode.filtered) {
            children.push(childNode)
          }
        }
      }
    }

    if (children.length > 0) {
      node.children = children
      node.leaf = false
    }

    return node
  }

  /**
   * Check if a class should be filtered out
   */
  function isClassFiltered(className: string, filter?: ClassFilter): boolean {
    if (!filter) return false

    // Whitelist approach (visibleClasses)
    if (filter.visibleClasses && filter.visibleClasses.length > 0) {
      return !filter.visibleClasses.includes(className)
    }

    // Blacklist approach (hiddenClasses)
    if (filter.hiddenClasses && filter.hiddenClasses.length > 0) {
      return filter.hiddenClasses.includes(className)
    }

    return false
  }

  /**
   * Get containment references for an EClass
   */
  function getContainmentReferences(eClass: EClass): EReference[] {
    const features = eClass.getEAllStructuralFeatures()
    return features.filter(f => {
      if ('isContainment' in f) {
        return (f as EReference).isContainment()
      }
      return false
    }) as EReference[]
  }

  /**
   * Set the resource chain (all levels from metamodel to instances)
   */
  function setResourceChain(resources: Resource[]): void {
    // Remove adapters from old resources
    for (const res of resourceChain.value) {
      removeAdapter(res)
    }

    resourceChain.value = resources

    // Add adapters to new resources
    for (const res of resources) {
      setupAdapter(res)
    }

    triggerUpdate()
  }

  /**
   * Set the focus resource (what we're editing)
   */
  function setFocus(resource: Resource): void {
    focusResource.value = resource

    // Ensure it's in the chain
    if (!resourceChain.value.includes(resource)) {
      resourceChain.value = [...resourceChain.value, resource]
      setupAdapter(resource)
    }

    triggerUpdate()
  }

  /**
   * Set the view depth (how many levels above focus are visible)
   */
  function setDepth(depth: number): void {
    if (!currentView.value) {
      currentView.value = {
        id: 'custom',
        name: 'Custom View',
        focusUri: focusResource.value?.getURI()?.toString() || '',
        depth,
        filters: {}
      }
    } else {
      currentView.value = { ...currentView.value, depth }
    }
    triggerUpdate()
  }

  /**
   * Set filter for a specific resource
   */
  function setFilter(resourceUri: string, filter: ClassFilter): void {
    if (!currentView.value) return

    currentView.value = {
      ...currentView.value,
      filters: {
        ...currentView.value.filters,
        [resourceUri]: filter
      }
    }
    triggerUpdate()
  }

  /**
   * Toggle a class in the filter
   */
  function toggleClassFilter(resourceUri: string, className: string, visible: boolean): void {
    const currentFilter = currentView.value?.filters[resourceUri] || {}
    const hiddenClasses = new Set(currentFilter.hiddenClasses || [])

    if (visible) {
      hiddenClasses.delete(className)
    } else {
      hiddenClasses.add(className)
    }

    setFilter(resourceUri, {
      ...currentFilter,
      hiddenClasses: Array.from(hiddenClasses)
    })
  }

  /**
   * Load a view configuration
   */
  function loadView(view: ModelView): void {
    currentView.value = { ...view }
    triggerUpdate()
  }

  /**
   * Load a perspective
   */
  function loadPerspective(perspective: Perspective): void {
    currentPerspective.value = perspective
    loadView(perspective.view)
  }

  /**
   * Save current view as a new named view
   */
  function saveViewAs(name: string): ModelView {
    if (!currentView.value) {
      throw new Error('No current view to save')
    }

    const newView: ModelView = {
      ...currentView.value,
      id: `custom-${Date.now()}`,
      name
    }

    savedViews.value = [...savedViews.value, newView]
    return newView
  }

  /**
   * Save current view as a perspective
   */
  function savePerspectiveAs(name: string, icon: string = 'pi pi-bookmark'): Perspective {
    const view = saveViewAs(name)
    const perspective: Perspective = {
      id: `perspective-${Date.now()}`,
      name,
      icon,
      view
    }

    perspectives.value = [...perspectives.value, perspective]
    return perspective
  }

  /**
   * Select a node/object
   */
  function selectNode(node: ModelTreeNode | null): void {
    if (node) {
      selectedKeys.value = { [node.key]: true }
      selectedObject.value = node.data
    } else {
      selectedKeys.value = {}
      selectedObject.value = null
    }
  }

  /**
   * Select an EObject directly
   */
  function selectObject(obj: EObject | null): void {
    selectedObject.value = obj ? toRaw(obj) : null
    if (obj) {
      const id = getObjectId(toRaw(obj))
      selectedKeys.value = { [id]: true }
    } else {
      selectedKeys.value = {}
    }
  }

  /**
   * Get all available EClasses from a level (for filter dialog)
   */
  function getAvailableClasses(level: ModelLevel): string[] {
    const classes = new Set<string>()

    function collectClasses(obj: EObject) {
      classes.add(obj.eClass().getName())
      for (const ref of getContainmentReferences(obj.eClass())) {
        const value = obj.eGet(ref)
        if (value) {
          const items = Array.isArray(value) || (value as any)[Symbol.iterator]
            ? Array.from(value as Iterable<any>)
            : [value]
          for (const child of items) {
            if (child && typeof child.eClass === 'function') {
              collectClasses(toRaw(child))
            }
          }
        }
      }
    }

    const contents = level.resource.getContents()
    for (const obj of contents) {
      collectClasses(toRaw(obj))
    }

    return Array.from(classes).sort()
  }

  /**
   * Get the Ecore package (for metamodel operations)
   */
  function getEcore() {
    return getEcorePackage()
  }

  // ============ Cleanup ============

  /**
   * Cleanup all adapters
   */
  function cleanup(): void {
    for (const res of resourceChain.value) {
      removeAdapter(res)
    }
    resourceChain.value = []
    focusResource.value = null
    selectedObject.value = null
  }

  return {
    // State
    currentView,
    currentPerspective,
    resourceChain,
    focusResource,
    focusIndex,
    selectedObject,
    selectedKeys,
    expandedKeys,
    visibleLevels,
    treeNodes,
    perspectives,
    savedViews,

    // Methods
    setResourceChain,
    setFocus,
    setDepth,
    setFilter,
    toggleClassFilter,
    loadView,
    loadPerspective,
    saveViewAs,
    savePerspectiveAs,
    selectNode,
    selectObject,
    getAvailableClasses,
    getEcore,
    triggerUpdate,
    cleanup
  }
}

// ============ Shared Instance ============

interface SharedModelViewState {
  instance: ReturnType<typeof useModelView>
}

// Module-level singleton
let _sharedState: SharedModelViewState | null = null

function getOrCreateSharedState(): SharedModelViewState {
  if (_sharedState) {
    console.log('[ModelView] Using existing shared state')
    return _sharedState
  }

  console.log('[ModelView] Creating new shared state')
  _sharedState = {
    instance: useModelView()
  }

  return _sharedState
}

/**
 * Get the shared model view instance
 */
export function useSharedModelView(): ReturnType<typeof useModelView> {
  return getOrCreateSharedState().instance
}
