/**
 * Instance Tree Composable
 *
 * Manages the state of the EMF instance tree editor.
 * Uses EMF notifications (EContentAdapter) to automatically react to model changes.
 */

import { ref, computed, watch, triggerRef, toRaw, type Ref } from 'tsm:vue'
import type { EObject, EClass, EReference, Resource } from '@emfts/core'
import { XMIResource, URI, BasicResourceSet, EContentAdapter, type Notification } from '@emfts/core'
import type { InstanceTreeNode, TreeSelection } from '../types'
import { getObjectId, getObjectLabel, getObjectIcon, getObjectIconInfo } from '../types'
import { useSharedViews } from './useViews'

// Shared resource set for creating new resources
let resourceSet: BasicResourceSet | null = null

function getResourceSet(): BasicResourceSet {
  if (!resourceSet) {
    resourceSet = new BasicResourceSet()
  }
  return resourceSet
}

/**
 * Get name from ENamedElement - handles both native and DynamicEObject
 */
function getElementName(element: any): string {
  if (!element) return 'unknown'
  // Try native getName first
  if (typeof element.getName === 'function') {
    const name = element.getName()
    if (name) return name
  }
  // DynamicEObject - try eGet
  try {
    const eClass = element.eClass?.()
    if (eClass) {
      const nameFeature = eClass.getEStructuralFeature?.('name')
      if (nameFeature) {
        const name = element.eGet?.(nameFeature)
        if (name) return String(name)
      }
    }
  } catch { /* ignore */ }
  // Try eSettings Map
  try {
    if (element.eSettings instanceof Map) {
      const name = element.eSettings.get('name')
      if (name) return String(name)
    }
  } catch { /* ignore */ }
  return 'unknown'
}

/**
 * Get EPackage from EClass - handles both native and DynamicEObject
 */
function getClassPackage(eClass: any): any {
  if (!eClass) return null
  // Try native getEPackage first
  if (typeof eClass.getEPackage === 'function') {
    return eClass.getEPackage()
  }
  // DynamicEObject - try eGet
  try {
    const metaClass = eClass.eClass?.()
    if (metaClass) {
      const pkgFeature = metaClass.getEStructuralFeature?.('ePackage')
      if (pkgFeature) {
        return eClass.eGet?.(pkgFeature)
      }
    }
  } catch { /* ignore */ }
  // Try eContainer - EClass is typically contained in EPackage
  if (typeof eClass.eContainer === 'function') {
    return eClass.eContainer()
  }
  return null
}

/**
 * Generate a UUID v4 string
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Track source file paths for objects (object -> source file path)
const objectSourceMap = new WeakMap<EObject, string>()

/**
 * Get the source file path for an object
 * Uses toRaw to handle Vue proxies
 */
export function getObjectSourcePath(obj: EObject): string | undefined {
  const rawObj = toRaw(obj)
  return objectSourceMap.get(rawObj)
}

/**
 * Set the source file path for an object
 * Uses toRaw to handle Vue proxies
 */
export function setObjectSourcePath(obj: EObject, path: string): void {
  const rawObj = toRaw(obj)
  objectSourceMap.set(rawObj, path)
}

/**
 * Content adapter that triggers Vue reactivity on EMF model changes
 */
class TreeContentAdapter extends EContentAdapter {
  private resourceRef: Ref<Resource | null>
  private onChanged: () => void

  constructor(resourceRef: Ref<Resource | null>, onChanged: () => void) {
    super()
    this.resourceRef = resourceRef
    this.onChanged = onChanged
  }

  /**
   * Called when any change occurs in the observed model tree
   */
  notifyChanged(notification: Notification): void {
    // Let EContentAdapter handle adding/removing itself from child objects
    super.notifyChanged(notification)

    // Trigger Vue reactivity
    this.onChanged()
  }
}

/**
 * Composable for managing instance tree state
 */
export function useInstanceTree(resource: Ref<Resource | null>) {
  // Selection state - PrimeVue Tree expects selectionKeys as { 'key': true } object
  const selectedKeys = ref<Record<string, boolean>>({})
  const selectedObject = ref<EObject | null>(null)
  const selectedNode = ref<InstanceTreeNode | null>(null)

  // Expanded nodes
  const expandedKeys = ref<Record<string, boolean>>({})

  // Show direct supertypes in labels
  const showSuperTypes = ref(false)

  // Node cache for quick lookup
  const nodeCache = new Map<string, InstanceTreeNode>()

  // Version counter to force reactivity (incremented on each change)
  const version = ref(0)

  // Content adapter for automatic change detection
  let contentAdapter: TreeContentAdapter | null = null

  /**
   * Trigger tree update
   */
  function triggerUpdate(): void {
    version.value++
    triggerRef(resource)
  }

  /**
   * Setup content adapter for a resource
   */
  function setupAdapter(res: Resource | null, oldRes: Resource | null): void {
    // Remove adapter from old resource
    if (oldRes && contentAdapter) {
      try {
        const adapters = (oldRes as any).eAdapters?.()
        if (adapters) {
          const idx = adapters.indexOf(contentAdapter)
          if (idx >= 0) {
            adapters.splice(idx, 1)
          }
        }
      } catch (e) {
        console.warn('[InstanceTree] Failed to remove adapter from old resource:', e)
      }
    }

    // Add adapter to new resource
    if (res) {
      contentAdapter = new TreeContentAdapter(resource, triggerUpdate)
      try {
        const adapters = (res as any).eAdapters?.()
        if (adapters) {
          adapters.push(contentAdapter)
        } else {
          console.warn('[InstanceTree] Resource does not support eAdapters')
        }
      } catch (e) {
        console.warn('[InstanceTree] Failed to add adapter to resource:', e)
      }
    }
  }

  // Watch for resource changes to setup/remove adapter
  watch(resource, (newRes, oldRes) => {
    setupAdapter(newRes, oldRes)
  }, { immediate: true })

  /**
   * Build tree nodes from resource contents
   */
  const treeNodes = computed((): InstanceTreeNode[] => {
    // Access version to create dependency
    const _ = version.value

    // Also access views version for reactivity
    const views = useSharedViews()
    const _viewVersion = views.version.value
    const activeView = views.activeView.value

    nodeCache.clear()

    if (!resource.value) {
      return []
    }

    // Use toRaw to bypass Vue's reactive proxy
    const rawResource = toRaw(resource.value)
    const contents = toRaw(rawResource.getContents())

    // Filter to only valid EObjects
    const validContents = Array.from(contents).filter(obj => {
      const rawObj = toRaw(obj)
      const isValid = rawObj && typeof rawObj.eClass === 'function'
      if (!isValid) {
        console.warn('[InstanceTree] Skipping invalid root object:', obj)
      }
      return isValid
    })

    // Build tree nodes
    const rawNodes = validContents.map(obj => buildTreeNode(obj))

    // Apply view filtering
    return filterTreeNodes(rawNodes, views.isNodeVisible)
  })

  /**
   * Recursively filter tree nodes based on view visibility
   */
  function filterTreeNodes(
    nodes: InstanceTreeNode[],
    isVisible: (data: EObject | null) => boolean
  ): InstanceTreeNode[] {
    return nodes
      .filter(node => isVisible(node.data))
      .map(node => {
        if (!node.children || node.children.length === 0) {
          return node
        }
        const filteredChildren = filterTreeNodes(node.children, isVisible)
        return {
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : undefined,
          leaf: filteredChildren.length === 0
        }
      })
  }

  /**
   * Build a tree node for an EObject
   */
  function buildTreeNode(obj: EObject, parent?: InstanceTreeNode, containmentRef?: EReference): InstanceTreeNode {
    // Use toRaw to bypass Vue's reactive proxy
    const rawObj = toRaw(obj)
    const eClass = rawObj.eClass()
    const id = getObjectId(rawObj)

    let label = getObjectLabel(rawObj)
    if (showSuperTypes.value) {
      try {
        const superTypes = typeof eClass.getESuperTypes === 'function' ? eClass.getESuperTypes() : []
        const names: string[] = []
        if (superTypes && (Array.isArray(superTypes) || (superTypes as any)[Symbol.iterator])) {
          for (const st of superTypes) {
            const n = st.getName?.()
            if (n) names.push(n)
          }
        }
        if (names.length > 0) {
          label += `  \u2039 ${names.join(', ')}`
        }
      } catch { /* ignore */ }
    }

    const { icon, iconClass, iconDataUrl } = getObjectIconInfo(rawObj)
    const node: InstanceTreeNode = {
      key: id,
      label,
      icon,
      iconClass,
      iconDataUrl,
      data: rawObj,
      eClass,
      leaf: true,
      containmentRef,
      parent,
      xmiId: getXmiId(rawObj)
    }

    // Get containment references and build children
    const containmentRefs = getContainmentReferences(eClass)
    const children: InstanceTreeNode[] = []

    for (const ref of containmentRefs) {
      // Use toRaw to get the actual EList, not Vue's proxy
      const value = toRaw(rawObj.eGet(ref))
      if (value) {
        if (Array.isArray(value) || (value as any)[Symbol.iterator]) {
          // Handle both arrays and EList (iterable)
          const items = Array.from(value as Iterable<any>)
          for (const child of items) {
            // Skip non-EObjects
            if (child && typeof child.eClass === 'function') {
              children.push(buildTreeNode(child, node, ref))
            } else {
              console.warn('[InstanceTree] Skipping non-EObject child:', child)
            }
          }
        } else if (typeof (value as any).eClass === 'function') {
          children.push(buildTreeNode(value as EObject, node, ref))
        }
      }
    }

    if (children.length > 0) {
      node.children = children
      node.leaf = false
    }

    nodeCache.set(id, node)
    return node
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
   * Handle node selection
   */
  function selectNode(node: InstanceTreeNode | null): void {
    if (node) {
      selectedKeys.value = { [node.key]: true }
      selectedObject.value = node.data
      selectedNode.value = node
    } else {
      selectedKeys.value = {}
      selectedObject.value = null
      selectedNode.value = null
    }
  }

  /**
   * Select an EObject in the tree
   */
  function selectObject(obj: EObject | null): void {
    if (!obj) {
      selectNode(null)
      return
    }

    // Use toRaw to handle Vue's reactive proxies
    const rawObj = toRaw(obj)
    const id = getObjectId(rawObj)
    const node = nodeCache.get(id)
    if (node) {
      selectNode(node)
      expandToNode(node)
    } else {
      console.warn('[InstanceTree] Object not found in tree cache:', id)
    }
  }

  /**
   * Expand all parent nodes to make a node visible
   */
  function expandToNode(node: InstanceTreeNode): void {
    let current = node.parent
    while (current) {
      expandedKeys.value[current.key] = true
      current = current.parent
    }
  }

  /**
   * Create a new instance as child of the selected object
   */
  function createChild(eClass: EClass, containmentRef: EReference): EObject | null {
    if (!selectedObject.value) {
      console.warn('[InstanceTree] createChild: No object selected')
      return null
    }

    // Use toRaw to bypass Vue's reactive proxy - important for EMF operations
    const parent = toRaw(selectedObject.value)
    const parentClass = parent.eClass()

    // Verify the reference is valid for this parent - compare by name since object references may differ
    const refName = getElementName(containmentRef)
    const parentFeatures = parentClass.getEAllStructuralFeatures()
    const actualRef = parentFeatures.find((f: any) => getElementName(f) === refName)
    if (!actualRef) {
      console.error('[InstanceTree] Invalid containment reference for parent class:', refName)
      return null
    }
    // Use the actual reference from the parent class to ensure correct EMF operations
    containmentRef = actualRef as EReference

    // Create new instance - handle both native EClass and DynamicEObject
    const pkg = getClassPackage(eClass)
    if (!pkg) {
      console.error('[InstanceTree] Cannot find package for class:', getElementName(eClass))
      return null
    }
    const factory = typeof pkg.getEFactoryInstance === 'function'
      ? pkg.getEFactoryInstance()
      : pkg.eGet?.(pkg.eClass?.().getEStructuralFeature?.('eFactoryInstance'))
    if (!factory) {
      console.error('[InstanceTree] Cannot find factory for package')
      return null
    }
    const newObj = factory.create(eClass)

    // Add to parent - use EList.add() to trigger EMF notifications
    // Use toRaw to get the actual EList, not Vue's reactive proxy
    const value = toRaw(parent.eGet(containmentRef))
    if (value && typeof (value as any).add === 'function') {
      // Use EList.add() to trigger EMF notifications
      ;(value as any).add(newObj)
    } else if (Array.isArray(value)) {
      // Fallback to array push
      ;(value as EObject[]).push(newObj)
    } else {
      parent.eSet(containmentRef, newObj)
    }

    // Fallback: manually trigger if notifications don't fire
    triggerUpdate()

    // Expand parent and select new object
    if (selectedNode.value) {
      expandedKeys.value[selectedNode.value.key] = true
    }

    // After tree updates, select the new object
    setTimeout(() => selectObject(newObj), 0)

    return newObj
  }

  /**
   * Delete the selected object
   */
  function deleteSelected(): boolean {
    if (!selectedObject.value || !selectedNode.value) {
      return false
    }

    // Use toRaw to bypass Vue's reactive proxy
    const obj = toRaw(selectedObject.value)
    const node = selectedNode.value

    // Cannot delete root objects (for now)
    if (!node.parent || !node.containmentRef) {
      // Try deleting as root object from resource
      return deleteRootObject(obj)
    }

    const parent = toRaw(node.parent.data)
    const parentClass = parent.eClass()

    // Resolve the containment reference by name (object references may differ across module boundaries)
    const refName = getElementName(node.containmentRef)
    const parentFeatures = parentClass.getEAllStructuralFeatures()
    const ref = parentFeatures.find((f: any) => getElementName(f) === refName) as EReference
    if (!ref) {
      console.error('[InstanceTree] Cannot resolve containment reference:', refName)
      return false
    }

    const value = toRaw(parent.eGet(ref))

    if (value && typeof (value as any).remove === 'function') {
      // Use EList.remove() to trigger EMF notifications
      ;(value as any).remove(obj)
    } else if (Array.isArray(value)) {
      const list = value as EObject[]
      const idx = list.indexOf(obj)
      if (idx >= 0) {
        list.splice(idx, 1)
      }
    } else {
      parent.eSet(ref, null)
    }

    // Fallback: manually trigger if notifications don't fire
    triggerUpdate()

    // Clear selection
    selectNode(null)

    return true
  }

  /**
   * Delete an object from the model (handles both root and child objects)
   */
  function deleteObject(obj: EObject): boolean {
    const rawObj = toRaw(obj)

    // Check if it's a root object
    const res = resource.value
    if (res) {
      const contents = res.getContents()
      for (let i = 0; i < contents.size(); i++) {
        if (toRaw(contents.get(i)) === rawObj) {
          contents.remove(rawObj)
          triggerUpdate()
          return true
        }
      }
    }

    // Otherwise, remove from container
    const container = rawObj.eContainer?.()
    if (container) {
      const containmentFeature = rawObj.eContainingFeature?.()
      if (containmentFeature) {
        const value = toRaw(container.eGet(containmentFeature))
        if (value && typeof (value as any).remove === 'function') {
          ;(value as any).remove(rawObj)
        } else {
          container.eSet(containmentFeature, null)
        }
        triggerUpdate()
        return true
      }
    }

    return false
  }

  /**
   * Delete a root object from the resource
   */
  function deleteRootObject(obj: EObject): boolean {
    const res = resource.value
    if (!res) return false

    const contents = res.getContents()
    const removed = contents.remove(obj)
    if (removed) {
      triggerUpdate()
      selectNode(null)
    }
    return removed
  }

  /**
   * Get available containment references for adding children to selected object
   */
  function getAvailableContainmentRefs(): EReference[] {
    if (!selectedObject.value) {
      return []
    }

    return getContainmentReferences(selectedObject.value.eClass())
  }

  /**
   * Get concrete classes that can be added to a containment reference
   */
  function getValidChildClasses(ref: EReference): EClass[] {
    const refType = ref.getEType() as EClass
    if (!refType) return []

    // Check if abstract/interface - handle both native EClass and DynamicEObject
    let isAbstract = false
    let isInterface = false

    if (typeof refType.isAbstract === 'function') {
      isAbstract = refType.isAbstract()
    } else {
      // DynamicEObject - try eGet
      try {
        const eClass = (refType as any).eClass?.()
        if (eClass) {
          const abstractFeature = eClass.getEStructuralFeature?.('abstract')
          if (abstractFeature) {
            isAbstract = (refType as any).eGet?.(abstractFeature) ?? false
          }
        }
      } catch { /* ignore */ }
    }

    if (typeof refType.isInterface === 'function') {
      isInterface = refType.isInterface()
    } else {
      // DynamicEObject - try eGet
      try {
        const eClass = (refType as any).eClass?.()
        if (eClass) {
          const interfaceFeature = eClass.getEStructuralFeature?.('interface')
          if (interfaceFeature) {
            isInterface = (refType as any).eGet?.(interfaceFeature) ?? false
          }
        }
      } catch { /* ignore */ }
    }

    // For now, just return the reference type if it's not abstract
    // In a full implementation, we'd query for all subtypes
    if (!isAbstract && !isInterface) {
      return [refType]
    }

    return []
  }

  // Selection info computed
  const selection = computed<TreeSelection>(() => ({
    key: Object.keys(selectedKeys.value)[0] ?? null,
    object: selectedObject.value,
    node: selectedNode.value
  }))

  /**
   * Add a root object to the resource
   * Creates a new resource if none exists
   */
  function addRootObject(obj: EObject): void {
    // Create a new resource if none exists
    if (!resource.value) {
      const rs = getResourceSet()
      const uri = URI.createURI('instances.xmi')
      const newResource = new XMIResource(uri)
      rs.getResources().push(newResource)
      newResource.setResourceSet(rs)
      resource.value = newResource

      // Setup adapter for the new resource
      setupAdapter(newResource, null)
    }

    // Use toRaw to bypass Vue's reactive proxy
    const res = toRaw(resource.value)
    const contents = toRaw(res.getContents())
    if (typeof (contents as any).add === 'function') {
      // Use EList.add() to trigger EMF notifications
      ;(contents as any).add(obj)
    } else {
      contents.push(obj)
    }

    // Fallback: manually trigger if notifications don't fire
    triggerUpdate()

    // Select the new object after tree updates
    setTimeout(() => selectObject(obj), 0)
  }

  /**
   * Get all objects of a given type (or subtypes) from the instance tree
   */
  function getAllObjectsOfType(eClass: EClass): EObject[] {
    const res = resource.value
    if (!res) {
      console.warn('[InstanceTree] getAllObjectsOfType: no resource')
      return []
    }

    const result: EObject[] = []
    const contents = res.getContents()

    // Helper to compare EClasses by identity or by name+package URI
    function isSameClass(a: EClass, b: EClass): boolean {
      if (a === b) return true
      try {
        const aName = typeof a.getName === 'function' ? a.getName() : null
        const bName = typeof b.getName === 'function' ? b.getName() : null
        if (aName && bName && aName === bName) {
          const aPkg = typeof a.getEPackage === 'function' ? a.getEPackage() : null
          const bPkg = typeof b.getEPackage === 'function' ? b.getEPackage() : null
          const aURI = aPkg && typeof aPkg.getNsURI === 'function' ? aPkg.getNsURI() : null
          const bURI = bPkg && typeof bPkg.getNsURI === 'function' ? bPkg.getNsURI() : null
          if (aURI && bURI && aURI === bURI) return true
        }
      } catch { /* ignore */ }
      return false
    }

    function collectObjects(obj: EObject) {
      // Check if this object is instance of the target class
      const objClass = obj.eClass()
      const same = isSameClass(objClass, eClass)
      const sub = !same && isSubtypeOf(objClass, eClass)
      if (same || sub) {
        result.push(obj)
      }

      // Recursively check contained objects
      for (const feature of objClass.getEAllContainments()) {
        const value = obj.eGet(feature)
        if (value) {
          if (feature.isMany()) {
            for (const child of value as EObject[]) {
              collectObjects(child)
            }
          } else {
            collectObjects(value as EObject)
          }
        }
      }
    }

    // Helper to check subtype relationship
    function isSubtypeOf(subClass: EClass, superClass: EClass): boolean {
      if (isSameClass(subClass, superClass)) return true
      try {
        const superTypes = typeof subClass.getESuperTypes === 'function' ? subClass.getESuperTypes() : []
        if (superTypes && (Array.isArray(superTypes) || superTypes[Symbol.iterator])) {
          for (const superType of superTypes) {
            if (isSubtypeOf(superType, superClass)) return true
          }
        }
      } catch (e) {
        // Ignore errors in type hierarchy traversal
      }
      return false
    }

    for (const obj of contents) {
      collectObjects(obj)
    }

    return result
  }

  /**
   * Get all root objects from the resource
   */
  function getRootObjects(): EObject[] {
    const res = resource.value
    if (!res) return []
    const contents = res.getContents()
    return typeof (contents as any).toArray === 'function'
      ? (contents as any).toArray()
      : Array.from(contents)
  }

  /**
   * Serialize all instances in the resource to XMI string
   */
  async function serializeAllInstances(): Promise<string> {
    const res = resource.value
    if (!res) return ''
    return res.saveToString()
  }

  /**
   * Serialize a single root object to XMI string
   * Creates a temporary resource with just this object
   */
  async function serializeSingleInstance(obj: EObject): Promise<string> {
    return serializeInstances([obj])
  }

  /**
   * Serialize multiple objects to a single XMI string
   * Used when saving multiple objects that belong to the same source file
   */
  async function serializeInstances(objects: EObject[]): Promise<string> {
    if (objects.length === 0) return ''

    // Create a temporary resource for serialization
    const rs = getResourceSet()
    const uri = URI.createURI('temp-instance.xmi')
    const tempResource = new XMIResource(uri)
    tempResource.setResourceSet(rs)

    // Add all objects
    const rawObjects = objects.map(obj => toRaw(obj))
    for (const rawObj of rawObjects) {
      tempResource.getContents().push(rawObj)
    }

    const xmiString = await tempResource.saveToString()

    // Remove from temp resource (don't leave dangling)
    const tempContents = tempResource.getContents()
    for (let i = rawObjects.length - 1; i >= 0; i--) {
      if (typeof (tempContents as any).removeAt === 'function') {
        (tempContents as any).removeAt(i)
      } else if (typeof (tempContents as any).remove === 'function') {
        (tempContents as any).remove(rawObjects[i])
      }
    }

    return xmiString
  }

  /**
   * Get suggested filename for an EObject based on name/id attributes
   */
  function getSuggestedFilename(obj: EObject): string {
    const eClass = obj.eClass()

    // Try 'name' attribute
    const nameAttr = eClass.getEStructuralFeature('name')
    if (nameAttr) {
      const name = obj.eGet(nameAttr)
      if (name && typeof name === 'string') {
        return sanitizeFilename(name) + '.xmi'
      }
    }

    // Try 'id' attribute
    const idAttr = eClass.getEStructuralFeature('id')
    if (idAttr) {
      const id = obj.eGet(idAttr)
      if (id && typeof id === 'string') {
        return sanitizeFilename(id) + '.xmi'
      }
    }

    // Fallback to class name + counter
    return sanitizeFilename(getElementName(eClass).toLowerCase()) + '.xmi'
  }

  /**
   * Sanitize a string to be used as a filename
   */
  function sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9äöüß_-]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || 'instance'
  }

  return {
    // State
    treeNodes,
    selectedKeys,
    selectedObject,
    selectedNode,
    expandedKeys,
    showSuperTypes,
    selection,

    // Methods
    selectNode,
    selectObject,
    expandToNode,
    createChild,
    deleteSelected,
    deleteObject,
    getAvailableContainmentRefs,
    getValidChildClasses,
    addRootObject,
    getAllObjectsOfType,
    triggerUpdate,

    // Serialization
    getRootObjects,
    serializeAllInstances,
    serializeSingleInstance,
    serializeInstances,
    getSuggestedFilename,

    // Source tracking
    getObjectSourcePath,
    setObjectSourcePath
  }
}

/**
 * Shared singleton instance
 * Module-level singleton for shared state across components
 */
interface SharedState {
  resource: Ref<Resource | null>
  instance: ReturnType<typeof useInstanceTree>
  isLoading: Ref<boolean>
  loadingName: Ref<string>
}

// Module-level singleton
let _sharedState: SharedState | null = null

function getOrCreateSharedState(): SharedState {
  if (_sharedState) {
    return _sharedState
  }

  const resource = ref<Resource | null>(null)
  _sharedState = {
    resource,
    instance: useInstanceTree(resource),
    isLoading: ref(false),
    loadingName: ref('')
  }

  return _sharedState
}

export function useSharedInstanceTree(resource?: Ref<Resource | null>) {
  const state = getOrCreateSharedState()

  if (resource && resource !== state.resource) {
    // Replace the resource ref's value, but keep the same ref
    state.resource.value = resource.value
  }

  return state.instance
}

/**
 * Set the resource for the shared instance tree
 */
export function setSharedResource(resource: Resource | null): void {
  const state = getOrCreateSharedState()

  state.resource.value = resource
}

/**
 * Get the shared resource ref
 */
export function getSharedResource(): Resource | null {
  const state = getOrCreateSharedState()
  return state.resource.value
}

/**
 * Get loading state for instance tree
 */
export function getInstanceLoadingState() {
  const state = getOrCreateSharedState()
  return {
    isLoading: state.isLoading,
    loadingName: state.loadingName
  }
}

/**
 * XMI Loading result with potential errors
 */
export interface XMILoadResult {
  /** Number of objects loaded */
  loadedCount: number
  /** Errors encountered during loading */
  errors: Array<{ message: string; line?: number; column?: number }>
}

/**
 * Load instances from XMI content into the shared instance tree
 * If a resource already exists, the new objects are added to it
 * Otherwise, a new resource is created
 *
 * @returns Load result with object count and any errors
 * @throws Error if critical parsing errors occurred and no objects were loaded
 */
export async function loadInstancesFromXMI(xmiContent: string, filePath: string): Promise<XMILoadResult> {
  const state = getOrCreateSharedState()
  const rs = getResourceSet()

  // Set loading state
  const fileName = filePath.split('/').pop() || filePath
  state.loadingName.value = fileName
  state.isLoading.value = true

  // Allow Vue to render loading state before blocking operation
  await new Promise(resolve => setTimeout(resolve, 100))

  try {
    // Create a temporary resource to load the XMI
    const uri = URI.createURI(filePath)
    const loadResource = new XMIResource(uri)
    loadResource.setResourceSet(rs)
    await loadResource.loadFromString(xmiContent)

    // Check for errors collected during parsing
    const resourceErrors = loadResource.getErrors?.() || []
    const errors: Array<{ message: string; line?: number; column?: number }> = resourceErrors.map((e: any) => ({
      message: e.message || String(e),
      line: e.line,
      column: e.column
    }))

    // Make a copy of loaded objects - the original array will be modified when we transfer objects
    const loadedObjects = [...loadResource.getContents()]
    const loadedCount = loadedObjects.length

    // Track source file path for each loaded object (for saving back to original file)
    for (const obj of loadedObjects) {
      setObjectSourcePath(obj, filePath)
    }

    // If we have errors and no objects were loaded, throw to trigger error handling
    if (errors.length > 0 && loadedCount === 0) {
      const errorMessages = errors.map(e =>
        e.line ? `[Line ${e.line}, Col ${e.column || 0}] ${e.message}` : e.message
      ).join('\n')
      throw new Error(errorMessages)
    }

    // Ensure we have a resource to add objects to
    if (!state.resource.value) {
      // Use the loaded resource directly
      state.resource.value = loadResource
    } else {
      // Add loaded objects to existing resource
      const existingContents = state.resource.value.getContents()
      const tempContents = loadResource.getContents()
      for (const obj of loadedObjects) {
        // Remove from temp resource first
        if (typeof (tempContents as any).remove === 'function') {
          (tempContents as any).remove(obj)
        } else {
          const idx = tempContents.indexOf(obj)
          if (idx >= 0 && typeof (tempContents as any).removeAt === 'function') {
            (tempContents as any).removeAt(idx)
          }
        }
        // Add to existing resource
        if (typeof (existingContents as any).add === 'function') {
          ;(existingContents as any).add(obj)
        } else {
          existingContents.push(obj)
        }
      }
    }

    // Trigger tree update to reflect the new objects
    state.instance.triggerUpdate()

    // Return result with errors (for caller to handle warnings even when some objects loaded)
    return {
      loadedCount,
      errors
    }
  } finally {
    state.isLoading.value = false
    state.loadingName.value = ''
  }
}

/**
 * Get the XMI ID for an EObject from its containing resource
 * @param obj The EObject to get the ID for
 * @returns The XMI ID or null if not set
 */
export function getXmiId(obj: EObject): string | null {
  const rawObj = toRaw(obj)
  const resource = rawObj.eResource?.()
  if (!resource) return null

  // XMLResource and XMIResource have getID method
  if (typeof (resource as any).getID === 'function') {
    return (resource as any).getID(rawObj)
  }
  return null
}

/**
 * Set the XMI ID for an EObject in its containing resource
 * @param obj The EObject to set the ID for
 * @param id The ID to set
 * @returns true if successful, false if no resource or resource doesn't support IDs
 */
export function setXmiId(obj: EObject, id: string): boolean {
  const rawObj = toRaw(obj)
  const resource = rawObj.eResource?.()
  if (!resource) {
    console.warn('[XmiId] Cannot set ID - object is not in a resource')
    return false
  }

  // XMLResource and XMIResource have setID method
  if (typeof (resource as any).setID === 'function') {
    (resource as any).setID(rawObj, id)
    console.log('[XmiId] Set ID for object:', id)
    return true
  }
  console.warn('[XmiId] Resource does not support IDs')
  return false
}

/**
 * Generate and set a new UUID as XMI ID for an EObject
 * @param obj The EObject to generate an ID for
 * @returns The generated ID, or null if setting failed
 */
export function generateXmiId(obj: EObject): string | null {
  const id = generateUUID()
  if (setXmiId(obj, id)) {
    return id
  }
  return null
}

/**
 * Check if an EObject has an XMI ID
 * @param obj The EObject to check
 */
export function hasXmiId(obj: EObject): boolean {
  return getXmiId(obj) !== null
}

/**
 * Get an EObject by its XMI ID from the shared resource
 * @param id The XMI ID to look up
 * @returns The EObject or null if not found
 */
export function getObjectByXmiId(id: string): EObject | null {
  const state = getOrCreateSharedState()
  const resource = state.resource.value
  if (!resource) return null

  // XMLResource has getEObject method that accepts ID as URI fragment
  if (typeof (resource as any).getEObject === 'function') {
    return (resource as any).getEObject(id)
  }
  return null
}

/**
 * Generate XMI IDs for all objects in the tree that don't have one
 * Recursively processes all contained objects
 * @param rootOnly If true, only generate for root objects; if false, generate for all objects
 * @returns Number of IDs generated
 */
export function generateMissingXmiIds(rootOnly: boolean = false): number {
  const state = getOrCreateSharedState()
  const resource = state.resource.value
  if (!resource) return 0

  let count = 0
  const contents = resource.getContents()

  function processObject(obj: EObject): void {
    if (!hasXmiId(obj)) {
      if (generateXmiId(obj)) {
        count++
      }
    }

    if (!rootOnly) {
      // Process all contained objects
      const eClass = obj.eClass()
      const features = eClass.getEAllContainments?.() || []
      for (const ref of features) {
        const value = obj.eGet(ref)
        if (value) {
          if (Array.isArray(value) || (value as any)[Symbol.iterator]) {
            for (const child of value as Iterable<EObject>) {
              processObject(child)
            }
          } else if (typeof (value as any).eClass === 'function') {
            processObject(value as EObject)
          }
        }
      }
    }
  }

  for (const obj of contents) {
    processObject(obj)
  }

  console.log('[XmiId] Generated', count, 'missing IDs')
  state.instance.triggerUpdate()
  return count
}

