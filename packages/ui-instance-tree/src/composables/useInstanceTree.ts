/**
 * Instance Tree Composable
 *
 * Manages the state of the EMF instance tree editor.
 * Uses EMF notifications (EContentAdapter) to automatically react to model changes.
 */

import { ref, computed, triggerRef, toRaw, type Ref } from 'tsm:vue'
import type { EObject, EClass, EReference, Resource } from '@emfts/core'
import { XMIResource, URI, BasicResourceSet, EContentAdapter, type Notification } from '@emfts/core'
import type { InstanceTreeNode, TreeSelection, AnyTreeNode } from '../types'
import { getObjectId, getObjectLabel, getObjectIcon, getObjectIconInfo } from '../types'
import { useSharedViews } from './useViews'

// Shared resource set for creating new resources
let resourceSet: BasicResourceSet | null = null

// Canonical package registry from TSM service (shared across all plugins)
let _canonicalRegistry: any = null

export function setCanonicalPackageRegistry(registry: any) {
  _canonicalRegistry = registry
  if (resourceSet) {
    resourceSet.setPackageRegistry(registry)
  }
}

function getResourceSet(): BasicResourceSet {
  if (!resourceSet) {
    resourceSet = _canonicalRegistry
      ? new BasicResourceSet(_canonicalRegistry)
      : new BasicResourceSet()
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

/**
 * Get the source file path for an object.
 * Provenance is now the object's own containing Resource (multi-resource model),
 * so this derives from `eObject.eResource().getURI()` — no external bookkeeping.
 */
export function getObjectSourcePath(obj: EObject): string | undefined {
  const res = toRaw(obj).eResource?.()
  return res?.getURI?.()?.toString?.() || undefined
}

/**
 * @deprecated Provenance now derives from `eObject.eResource()`. Kept as a no-op
 * so existing imports/callers keep compiling.
 */
export function setObjectSourcePath(_obj: EObject, _path: string): void {
  /* no-op */
}

/** Derive a display name from a resource URI (last segment, without extension) */
function resourceDisplayName(res: any): string {
  const uri = res?.getURI?.()?.toString?.() || ''
  const last = uri.split(/[\\/]/).pop() || uri || 'resource'
  return last.replace(/\.[^.]+$/, '') || last || 'resource'
}

/**
 * Content adapter that triggers Vue reactivity on EMF model changes
 */
class TreeContentAdapter extends EContentAdapter {
  private onChanged: (notification: Notification) => void

  constructor(onChanged: (notification: Notification) => void) {
    super()
    this.onChanged = onChanged
  }

  /**
   * Called when any change occurs anywhere in the observed ResourceSet tree
   */
  notifyChanged(notification: Notification): void {
    // Let EContentAdapter handle adding/removing itself from child objects
    super.notifyChanged(notification)

    // Trigger Vue reactivity + dirty tracking
    this.onChanged(notification)
  }
}

/**
 * Composable for managing instance tree state
 */
export function useInstanceTree(
  resources: Ref<Resource[]>,
  activeResource: Ref<Resource | null>
) {
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

  // Bumped whenever any resource's modified (dirty) flag flips
  const dirtyVersion = ref(0)

  // Single content adapter attached to the whole ResourceSet
  let contentAdapter: TreeContentAdapter | null = null

  /**
   * Trigger tree update
   */
  function triggerUpdate(): void {
    version.value++
    triggerRef(resources)
  }

  /** Mark a resource as having unsaved changes */
  function markDirty(res: any): void {
    try { res?.setModified?.(true) } catch { /* ignore */ }
    dirtyVersion.value++
  }

  /** Resolve the Resource a notification originates from (notifier or its eResource) */
  function resourceOfNotification(n: Notification): any {
    try {
      const notifier: any = (n as any).getNotifier?.()
      if (!notifier) return null
      if (typeof notifier.getContents === 'function') return notifier // notifier IS a Resource
      return notifier.eResource?.() ?? null
    } catch { return null }
  }

  /**
   * Setup the single ResourceSet-level content adapter (once).
   * EContentAdapter.setTarget propagates to every Resource and EObject,
   * including ones added later, so we never re-attach per resource.
   */
  function ensureAdapter(): void {
    if (contentAdapter) return
    contentAdapter = new TreeContentAdapter((notification) => {
      const res = resourceOfNotification(notification)
      if (res) markDirty(res)
      triggerUpdate()
    })
    try {
      ;(contentAdapter as any).setTarget(getResourceSet())
    } catch (e) {
      console.warn('[InstanceTree] Failed to attach ResourceSet adapter:', e)
    }
  }
  ensureAdapter()

  /**
   * Build tree nodes: a Resource tier (top level) over the object tier.
   * Each managed Resource becomes one node; its children are the resource's roots.
   */
  const treeNodes = computed((): AnyTreeNode[] => {
    // Reactive dependencies
    const _ = version.value
    const _d = dirtyVersion.value

    // Also access views version for reactivity
    const views = useSharedViews()
    const _viewVersion = views.version.value

    nodeCache.clear()

    const result: AnyTreeNode[] = []
    for (const res of resources.value) {
      const rawResource: any = toRaw(res)
      if (!rawResource || typeof rawResource.getContents !== 'function') continue

      const contents = toRaw(rawResource.getContents())
      const validContents = Array.from(contents).filter((obj: any) => {
        const rawObj = toRaw(obj)
        return rawObj && typeof rawObj.eClass === 'function'
      })
      const rawNodes = validContents.map((obj: any) => buildTreeNode(obj))
      const children = filterTreeNodes(rawNodes, views.isNodeVisible)

      const uri = rawResource.getURI?.()?.toString?.() || ''
      result.push({
        kind: 'resource',
        key: `res:${uri}`,
        label: resourceDisplayName(rawResource),
        icon: '',
        resource: rawResource as Resource,
        uri,
        dirty: !!rawResource.isModified?.(),
        children,
        leaf: children.length === 0
      })
    }
    return result
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
  function selectNode(node: AnyTreeNode | null): void {
    if (node && (node as any).kind === 'resource') {
      // Resource node: make it the active target, clear object selection
      selectedKeys.value = { [node.key]: true }
      selectedObject.value = null
      selectedNode.value = null
      const res = (node as any).resource
      if (res) activeResource.value = res
      return
    }
    if (node) {
      const objNode = node as InstanceTreeNode
      selectedKeys.value = { [objNode.key]: true }
      selectedObject.value = objNode.data
      selectedNode.value = objNode
      // Keep the active resource in sync with the selected object's resource
      const res = toRaw(objNode.data)?.eResource?.()
      if (res) activeResource.value = res
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

    // Assign xmi:id after adding to resource (needs eResource() for setID)
    assignXmiId(newObj)

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

    // Check if it's a root object of any managed resource
    const ownerRes: any = rawObj.eResource?.()
    if (ownerRes && typeof ownerRes.getContents === 'function') {
      const contents = ownerRes.getContents()
      for (let i = 0; i < contents.size(); i++) {
        if (toRaw(contents.get(i)) === rawObj) {
          contents.remove(rawObj)
          markDirty(ownerRes)
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
    const raw = toRaw(obj)
    const res: any = raw.eResource?.()
    if (!res || typeof res.getContents !== 'function') return false

    const contents = res.getContents()
    const removed = contents.remove(raw)
    if (removed) {
      markDirty(res)
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
    // Target the active resource; create a default one if none is managed yet
    let res: any = activeResource.value ? toRaw(activeResource.value) : null
    if (!res) res = toRaw(createResource('instances'))

    const contents = toRaw(res.getContents())
    if (typeof (contents as any).add === 'function') {
      // Use EList.add() to trigger EMF notifications
      ;(contents as any).add(obj)
    } else {
      contents.push(obj)
    }

    // Assign xmi:id after adding to resource (needs eResource() for setID)
    assignXmiId(obj)

    markDirty(res)
    // Fallback: manually trigger if notifications don't fire
    triggerUpdate()

    // Select the new object after tree updates
    setTimeout(() => selectObject(obj), 0)
  }

  // ── Resource management ──────────────────────────────────────────────────

  /** List currently managed resources (raw) */
  function listResources(): Resource[] {
    return resources.value.map(r => toRaw(r) as Resource)
  }

  /** Whether a resource has unsaved changes (reactive via dirtyVersion) */
  function isResourceDirty(res: Resource): boolean {
    const _ = dirtyVersion.value
    return !!(toRaw(res) as any).isModified?.()
  }

  /** Set the active (default target) resource */
  function setActiveResource(res: Resource | null): void {
    activeResource.value = res ? (toRaw(res) as Resource) : null
  }

  function rsIndexOf(rsResources: any, raw: any): number {
    try {
      if (typeof rsResources.indexOf === 'function') return rsResources.indexOf(raw)
    } catch { /* ignore */ }
    return -1
  }

  function rsRemove(rsResources: any, raw: any): void {
    const idx = rsIndexOf(rsResources, raw)
    try {
      if (idx >= 0 && typeof rsResources.removeAt === 'function') rsResources.removeAt(idx)
      else if (typeof rsResources.remove === 'function') rsResources.remove(raw)
    } catch { /* ignore */ }
  }

  /** Add an existing resource to the managed set (dedup by URI); makes it active */
  function addResource(res: Resource): Resource {
    const rs = getResourceSet()
    const raw: any = toRaw(res)
    if (typeof raw.setResourceSet === 'function') raw.setResourceSet(rs)

    const rsResources: any = rs.getResources()
    const uriStr = raw.getURI?.()?.toString?.() || ''

    // Replace any existing managed resource with the same (non-empty) URI
    if (uriStr) {
      const existingIdx = resources.value.findIndex(
        r => ((toRaw(r) as any).getURI?.()?.toString?.() || '') === uriStr
      )
      if (existingIdx >= 0) {
        rsRemove(rsResources, toRaw(resources.value[existingIdx]))
        const next = [...resources.value]
        next.splice(existingIdx, 1)
        resources.value = next
      }
    }

    if (rsIndexOf(rsResources, raw) < 0) {
      if (typeof rsResources.add === 'function') rsResources.add(raw)
      else rsResources.push(raw)
    }

    resources.value = [...resources.value, raw]
    activeResource.value = raw
    version.value++
    triggerRef(resources)
    return raw
  }

  /**
   * Create a new empty resource with the given name and optional folder.
   * The resource URI (name + folder → path) determines the target file.
   */
  function createResource(name: string, folder?: string): Resource {
    const rs = getResourceSet()
    const base = sanitizeFilename(name) + '.xmi'
    const cleanFolder = (folder || '').trim().replace(/^\/+|\/+$/g, '')
    const path = cleanFolder ? `${cleanFolder}/${base}` : base
    const res = new XMIResource(URI.createURI(path))
    res.setResourceSet(rs)
    return addResource(res)
  }

  /** Remove a resource from the managed set (and the ResourceSet) */
  function deleteResource(res: Resource): void {
    const raw: any = toRaw(res)
    const rs = getResourceSet()
    rsRemove(rs.getResources(), raw)
    resources.value = resources.value.filter(r => toRaw(r) !== raw)
    if (activeResource.value && toRaw(activeResource.value) === raw) {
      activeResource.value = resources.value.length ? (toRaw(resources.value[0]) as Resource) : null
    }
    version.value++
    triggerRef(resources)
  }

  /** Rename a resource (updates its URI → determines the target file) */
  function renameResource(res: Resource, newName: string): void {
    const raw: any = toRaw(res)
    const fileName = sanitizeFilename(newName) + '.xmi'
    try { raw.setURI?.(URI.createURI(fileName)) } catch { /* ignore */ }
    markDirty(raw)
    version.value++
    triggerRef(resources)
  }

  /** Replace the whole managed set (used by compat shims) */
  function setResources(list: Resource[]): void {
    const rs = getResourceSet()
    const rsResources: any = rs.getResources()
    for (const r of resources.value) rsRemove(rsResources, toRaw(r))
    resources.value = []
    activeResource.value = null
    for (const r of list) addResource(r)
    version.value++
    triggerRef(resources)
  }

  function clearResources(): void {
    setResources([])
  }

  /** Move an EObject (with its containment subtree) into another resource as a root */
  function moveToResource(obj: EObject, target: Resource): boolean {
    const raw: any = toRaw(obj)
    const targetRaw: any = toRaw(target)
    const source: any = raw.eResource?.()
    if (!source || !targetRaw || source === targetRaw) return false
    try {
      // Detach from current containment (or from source root contents)
      const container = raw.eContainer?.()
      if (container) {
        const feature = raw.eContainingFeature?.()
        if (feature) {
          const val = toRaw(container.eGet(feature))
          if (val && typeof (val as any).remove === 'function') (val as any).remove(raw)
          else container.eSet(feature, null)
        }
      } else {
        const sc = toRaw(source.getContents())
        if (typeof (sc as any).remove === 'function') (sc as any).remove(raw)
      }
      // Attach as a root of the target
      const tc = toRaw(targetRaw.getContents())
      if (typeof (tc as any).add === 'function') (tc as any).add(raw)
      else (tc as any).push(raw)

      assignXmiId(raw)
      markDirty(source)
      markDirty(targetRaw)
      triggerUpdate()
      return true
    } catch (e) {
      console.warn('[InstanceTree] moveToResource failed:', e)
      return false
    }
  }

  /** Serialize a single resource to an XMI string */
  async function serializeResource(res: Resource): Promise<string> {
    const raw: any = toRaw(res)
    if (!raw || typeof raw.saveToString !== 'function') return ''
    return raw.saveToString()
  }

  /**
   * Get all objects of a given type (or subtypes) from the instance tree
   */
  function getAllObjectsOfType(eClass: EClass): EObject[] {
    const result: EObject[] = []

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

    for (const res of resources.value) {
      const raw: any = toRaw(res)
      for (const obj of raw.getContents()) {
        collectObjects(obj)
      }
    }

    return result
  }

  /**
   * Get all root objects across all managed resources
   */
  function getRootObjects(): EObject[] {
    const all: EObject[] = []
    for (const res of resources.value) {
      const contents: any = (toRaw(res) as any).getContents()
      const arr = typeof contents.toArray === 'function' ? contents.toArray() : Array.from(contents)
      all.push(...arr)
    }
    return all
  }

  /**
   * Serialize all instances of the ACTIVE resource to an XMI string.
   * (Multi-resource callers should prefer serializeResource / saving per resource.)
   */
  async function serializeAllInstances(): Promise<string> {
    const res: any = activeResource.value ? toRaw(activeResource.value) : (resources.value[0] ? toRaw(resources.value[0]) : null)
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
   * Recursively copy xmi:ids from one resource to another for all contained children
   */
  function copyChildIds(obj: EObject, from: any, to: any): void {
    if (!from || typeof from.getID !== 'function') return
    for (const child of obj.eContents()) {
      const id = from.getID(child)
      if (id) to.setID(child, id)
      copyChildIds(child, from, to)
    }
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

    // Add all objects and transfer their xmi:ids from the original resource
    const rawObjects = objects.map(obj => toRaw(obj))
    // Objects in a group share their source resource; capture it before moving them.
    const origResource: any = rawObjects.length ? (rawObjects[0] as any).eResource?.() ?? null : null
    for (const rawObj of rawObjects) {
      tempResource.getContents().push(rawObj)
      // Copy xmi:id from original resource to temp resource
      if (origResource && typeof (origResource as any).getID === 'function') {
        const id = (origResource as any).getID(rawObj)
        if (id) {
          (tempResource as any).setID(rawObj, id)
        }
      }
      // Also copy IDs for all children recursively
      copyChildIds(rawObj, origResource as any, tempResource as any)
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

    // Resource state
    resources,
    activeResource,
    dirtyVersion,

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

    // Resource management
    listResources,
    isResourceDirty,
    setActiveResource,
    createResource,
    addResource,
    deleteResource,
    renameResource,
    setResources,
    clearResources,
    moveToResource,
    serializeResource,
    markResourceDirty: (res: Resource) => markDirty(res),

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
  resources: Ref<Resource[]>
  activeResource: Ref<Resource | null>
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

  const resources = ref<Resource[]>([])
  const activeResource = ref<Resource | null>(null)
  _sharedState = {
    resources,
    activeResource,
    instance: useInstanceTree(resources, activeResource),
    isLoading: ref(false),
    loadingName: ref('')
  }

  return _sharedState
}

export function useSharedInstanceTree(resource?: Ref<Resource | null>) {
  const state = getOrCreateSharedState()

  // Legacy compat: if a single resource ref is passed, adopt it as the sole resource
  if (resource && resource.value && !state.resources.value.includes(resource.value)) {
    state.instance.setResources([resource.value])
  }

  return state.instance
}

/**
 * Compat shim: replace the managed set with a single resource (or clear).
 */
export function setSharedResource(resource: Resource | null): void {
  const state = getOrCreateSharedState()
  state.instance.setResources(resource ? [resource] : [])
}

/**
 * Compat shim: the "primary" resource = active resource, or the first managed one.
 */
export function getSharedResource(): Resource | null {
  const state = getOrCreateSharedState()
  return state.activeResource.value ?? state.resources.value[0] ?? null
}

/**
 * All managed resources (multi-resource API).
 */
export function getSharedResources(): Resource[] {
  const state = getOrCreateSharedState()
  return state.resources.value
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

    // If we have errors and no objects were loaded, throw to trigger error handling
    if (errors.length > 0 && loadedCount === 0) {
      const errorMessages = errors.map(e =>
        e.line ? `[Line ${e.line}, Col ${e.column || 0}] ${e.message}` : e.message
      ).join('\n')
      throw new Error(errorMessages)
    }

    // Add the loaded file as its OWN managed resource (no merging into one shared
    // resource). Provenance is now the object's containing resource. Re-loading the
    // same URI replaces the existing managed resource (see addResource dedup).
    state.instance.addResource(loadResource)

    // Assign xmi:id to all loaded objects (and their children) that don't have one yet
    assignXmiIdsRecursive(loadResource)

    // A freshly loaded resource has no unsaved changes
    try { (loadResource as any).setModified?.(false) } catch { /* ignore */ }

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

// ── Cross-resource references / referenced-resource auto-load ───────────────

/**
 * App-provided reader that returns the XMI content for a referenced resource URI
 * (or null if it cannot be found). Wired from the app via the file system service.
 */
let _instanceFileReader: ((uri: string) => Promise<string | null>) | null = null

export function setInstanceFileReader(
  reader: ((uri: string) => Promise<string | null>) | null
): void {
  _instanceFileReader = reader
}

/**
 * Collect distinct base URIs of unresolved cross-resource references across all
 * managed resources. Skips metamodel/package URIs (resolved via the package
 * registry) and URIs that are already loaded members.
 */
function collectUnresolvedResourceUris(): string[] {
  const state = getOrCreateSharedState()
  const found = new Set<string>()
  const loadedUris = new Set<string>()
  for (const r of state.resources.value) {
    const u = (toRaw(r) as any).getURI?.()?.toString?.() || ''
    if (u) loadedUris.add(u)
  }
  const registry: any = _canonicalRegistry

  function visit(obj: any): void {
    const raw = toRaw(obj)
    let eClass: any
    try { eClass = raw.eClass() } catch { return }
    const features = eClass.getEAllStructuralFeatures?.() || []
    for (const f of features) {
      // Only non-containment references can point across resources
      if (typeof (f as any).isContainment !== 'function' || (f as any).isContainment()) continue
      let val: any
      try { val = toRaw(raw.eGet(f)) } catch { continue }
      if (!val) continue
      const items = (Array.isArray(val) || (val as any)[Symbol.iterator]) ? Array.from(val as any) : [val]
      for (const v of items) {
        if (v && typeof (v as any).eIsProxy === 'function' && (v as any).eIsProxy()) {
          const puri = (v as any).eProxyURI?.()?.toString?.() || ''
          const base = puri.split('#')[0]
          if (base && !loadedUris.has(base) &&
              !(registry && typeof registry.has === 'function' && registry.has(base))) {
            found.add(base)
          }
        }
      }
    }
    // Recurse into containment children
    let contained: any
    try { contained = raw.eContents?.() } catch { contained = null }
    if (contained) for (const child of contained) visit(child)
  }

  for (const r of state.resources.value) {
    for (const root of (toRaw(r) as any).getContents()) visit(root)
  }
  return Array.from(found)
}

/**
 * Load a resource "standalone": load the primary file, then follow cross-resource
 * references and auto-load each referenced resource (best-effort, via the injected
 * file reader) into the SAME ResourceSet so proxies resolve. Missing files stay
 * unresolved (surfaced as dangling-reference warnings by the caller).
 *
 * @param opts.replace clear the currently managed resources first (fresh view)
 */
export async function loadResourceStandalone(
  xmiContent: string,
  filePath: string,
  opts: { replace?: boolean } = {}
): Promise<XMILoadResult & { referencedLoaded: number }> {
  const state = getOrCreateSharedState()
  if (opts.replace) state.instance.clearResources()

  // Load the primary file as its own resource
  const primary = await loadInstancesFromXMI(xmiContent, filePath)
  const primaryRes = state.activeResource.value

  // Follow references and auto-load referenced resources (bounded; handles cycles)
  let referencedLoaded = 0
  if (_instanceFileReader) {
    const attempted = new Set<string>()
    for (let iter = 0; iter < 25; iter++) {
      const uris = collectUnresolvedResourceUris().filter(u => !attempted.has(u))
      if (uris.length === 0) break
      let progressed = false
      for (const uri of uris) {
        attempted.add(uri)
        try {
          const content = await _instanceFileReader(uri)
          if (content != null) {
            await loadInstancesFromXMI(content, uri)
            referencedLoaded++
            progressed = true
          }
        } catch (e) {
          console.warn('[InstanceTree] Failed to auto-load referenced resource:', uri, e)
        }
      }
      if (!progressed) break
    }
  }

  // Keep the primary resource active (auto-loads changed it)
  if (primaryRes) state.instance.setActiveResource(primaryRes)
  state.instance.triggerUpdate()

  return { ...primary, referencedLoaded }
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
 * Assign an xmi:id to an EObject using the following priority:
 * 1. Already has a manually set xmi:id → keep it
 * 2. EClass has an EAttribute with isID()=true and value is set → use that value
 * 3. Otherwise → generate a UUID
 *
 * Also sets the ID in the resource's ID map for cross-reference resolution.
 */
export function assignXmiId(obj: EObject): string | null {
  const rawObj = toRaw(obj)

  // 1. Already has an ID
  const existing = getXmiId(rawObj)
  if (existing) return existing

  // 2. Check for iD-attribute value
  try {
    const eClass = rawObj.eClass()
    if (eClass) {
      for (const feature of eClass.getEAllStructuralFeatures()) {
        if ('isID' in feature && typeof (feature as any).isID === 'function' && (feature as any).isID()) {
          const val = rawObj.eGet(feature)
          if (val !== null && val !== undefined && val !== '') {
            const id = String(val)
            setXmiId(rawObj, id)
            return id
          }
          break
        }
      }
    }
  } catch { /* ignore */ }

  // 3. Generate UUID
  return generateXmiId(rawObj)
}

/**
 * Update the xmi:id when an iD-attribute value changes.
 * Call this from the editor when a feature with isID()=true is modified.
 */
export function updateXmiIdFromAttribute(obj: EObject, newValue: any): void {
  if (newValue !== null && newValue !== undefined && newValue !== '') {
    setXmiId(toRaw(obj), String(newValue))
  }
}

/**
 * Recursively assign xmi:id to all objects in a resource that don't have one yet.
 * Uses assignXmiId logic (iD-attribute → UUID fallback).
 */
export function assignXmiIdsRecursive(resource: Resource): void {
  function visit(obj: EObject) {
    assignXmiId(obj)
    for (const child of obj.eContents()) {
      visit(child)
    }
  }
  for (const root of resource.getContents()) {
    visit(root)
  }
}

/**
 * Get an EObject by its XMI ID from the shared resource
 * @param id The XMI ID to look up
 * @returns The EObject or null if not found
 */
export function getObjectByXmiId(id: string): EObject | null {
  const state = getOrCreateSharedState()
  // Search across all managed resources
  for (const resource of state.resources.value) {
    const raw: any = toRaw(resource)
    if (typeof raw.getEObject === 'function') {
      const obj = raw.getEObject(id)
      if (obj) return obj
    }
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

  let count = 0

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

  for (const resource of state.resources.value) {
    const raw: any = toRaw(resource)
    for (const obj of raw.getContents()) {
      processObject(obj)
    }
  }

  console.log('[XmiId] Generated', count, 'missing IDs')
  state.instance.triggerUpdate()
  return count
}

