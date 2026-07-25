/**
 * Instance Context Adapter
 *
 * Creates an EditorContext from useInstanceTree + useModelRegistry
 * for the Instance Editor perspective.
 */

import { computed, ref, toRaw } from 'tsm:vue'
import type { EditorContext, PackageInfo, ClassInfo, ResourceInfo, SerializedResource } from './editorContext'
import { useSharedInstanceTree } from '../composables/useInstanceTree'
import type { EClass, EReference, EObject, Resource } from '@emfts/core'

// TSM service getter — set during activate() to avoid circular dependency
let _tsmContext: any = null
// Reactive version counter — incremented when model registry becomes available
const _registryVersion = ref(0)

export function setTsmContext(ctx: any) {
  _tsmContext = ctx
  // Poll until model-browser service is available, then trigger reactivity
  const interval = setInterval(() => {
    if (_tsmContext?.services?.get('ui.model-browser.composables')) {
      _registryVersion.value++
      clearInterval(interval)
    }
  }, 100)
}

function getModelRegistry(): any {
  return _tsmContext?.services?.get('ui.model-browser.composables')?.useSharedModelRegistry()
}

/**
 * Create an EditorContext for Instance Editor mode
 */
export function createInstanceContext(): EditorContext {
  const instanceTree = useSharedInstanceTree()

  // Adapt model registry packages to PackageInfo
  const allPackages = computed<PackageInfo[]>(() => {
    // Track registry availability for reactivity
    const _v = _registryVersion.value
    const mr = getModelRegistry()
    if (!mr?.allPackages) return []
    return mr.allPackages.value.map((pkg: any) => ({
      nsURI: pkg.nsURI,
      name: pkg.name,
      nsPrefix: pkg.nsPrefix,
      ePackage: pkg.ePackage,
      sourceFile: pkg.sourceFile || null,
      isBuiltIn: pkg.isBuiltIn
    }))
  })

  // Get concrete classes from a package
  function getConcreteClasses(pkg: PackageInfo): ClassInfo[] {
    const mr = getModelRegistry()
    if (!mr) return []
    const modelPkg = mr.allPackages.value.find((p: any) => p.nsURI === pkg.nsURI)
    if (!modelPkg) return []

    return mr.getConcreteClasses(modelPkg).map((cls: any) => ({
      qualifiedName: cls.qualifiedName,
      name: cls.name,
      eClass: cls.eClass,
      packageInfo: pkg,
      isAbstract: cls.isAbstract,
      isInterface: cls.isInterface
    }))
  }

  return {
    mode: 'instance',

    // Tree state
    treeNodes: instanceTree.treeNodes as any,
    selectedObject: instanceTree.selectedObject,
    selectedNode: instanceTree.selectedNode as any,
    selectedKeys: instanceTree.selectedKeys,
    expandedKeys: instanceTree.expandedKeys,

    // Selection
    selectObject: (obj) => instanceTree.selectObject(obj),
    selectNode: (node) => instanceTree.selectNode(node as any),

    // Tree operations - context-aware
    createChildInSelected: (eClass, ref) => instanceTree.createChild(eClass, ref),
    deleteSelected: () => instanceTree.deleteSelected(),

    // Tree operations - explicit parent
    createChild: (parent, ref, eClass) => instanceTree.createChild(parent, ref, eClass),
    deleteObject: (obj) => instanceTree.deleteObject(obj),

    // Get available operations for selected object
    getAvailableContainmentRefs: () => instanceTree.getAvailableContainmentRefs(),
    getValidChildClasses: (ref) => instanceTree.getValidChildClasses(ref),
    getContainmentReferences: (eClass) => instanceTree.getContainmentReferences(eClass),

    // Model Browser
    allPackages,
    getConcreteClasses,
    findClass: (qualifiedName: string) => {
      const mr = getModelRegistry()
      if (!mr) return null
      const classInfo = mr.findClass(qualifiedName)
      if (!classInfo) return null
      const pkg = allPackages.value.find(p => p.nsURI === classInfo.packageInfo.nsURI)
      if (!pkg) return null
      return {
        qualifiedName: classInfo.qualifiedName,
        name: classInfo.name,
        eClass: classInfo.eClass,
        packageInfo: pkg,
        isAbstract: classInfo.isAbstract,
        isInterface: classInfo.isInterface
      }
    },

    // Model Browser tree nodes (lazy computed to handle late loading)
    modelTreeNodes: computed(() => getModelRegistry()?.treeNodes?.value ?? []),

    // Package management
    unregisterPackage: (nsURI: string) => getModelRegistry()?.unregisterPackage(nsURI),

    // Root object management
    addRootObject: (obj: EObject) => instanceTree.addRootObject(obj),

    // Dirty state — true if any managed resource has unsaved changes
    dirty: computed(() => {
      const _ = instanceTree.dirtyVersion.value
      return instanceTree.resources.value.some((r: any) => !!r.isModified?.())
    }),

    // Mark the active resource as dirty (properties panel notifies edits)
    markDirty: () => {
      const r = instanceTree.activeResource.value
      if (r) instanceTree.markResourceDirty(r)
    },

    // ── Resource management ──────────────────────────────────────────────
    resources: computed<ResourceInfo[]>(() => {
      const _ = instanceTree.dirtyVersion.value
      const activeRaw = instanceTree.activeResource.value ? toRaw(instanceTree.activeResource.value) : null
      return instanceTree.resources.value.map((r: any) => {
        const raw: any = toRaw(r)
        const uri = raw.getURI?.()?.toString?.() || ''
        return {
          resource: raw as Resource,
          name: (uri.split(/[\\/]/).pop() || 'resource').replace(/\.[^.]+$/, '') || 'resource',
          uri,
          dirty: !!raw.isModified?.(),
          isActive: raw === activeRaw
        }
      })
    }),
    activeResource: instanceTree.activeResource,
    setActiveResource: (res: Resource) => instanceTree.setActiveResource(res),
    createResource: (name: string, folder?: string) => instanceTree.createResource(name, folder),
    renameResource: (res: Resource, newName: string) => instanceTree.renameResource(res, newName),
    deleteResource: (res: Resource) => instanceTree.deleteResource(res),
    moveToResource: (obj: EObject, target: Resource) => instanceTree.moveToResource(obj, target),
    moveObjectBeside: (dragged: EObject, target: EObject, after?: boolean) => instanceTree.moveObjectBeside(dragged, target, after),
    canMoveBeside: (dragged: EObject, target: EObject) => instanceTree.canMoveBeside(dragged, target),
    isResourceDirty: (res: Resource) => instanceTree.isResourceDirty(res),
    saveResource: async (res: Resource): Promise<SerializedResource> => {
      const content = await instanceTree.serializeResource(res)
      const uri = (toRaw(res) as any).getURI?.()?.toString?.() || ''
      return { filename: uri.split(/[\\/]/).pop() || 'instance.xmi', content }
    },
    saveAll: async (): Promise<SerializedResource[]> => {
      const out: SerializedResource[] = []
      for (const r of instanceTree.resources.value) {
        const raw: any = toRaw(r)
        const content = await instanceTree.serializeResource(raw)
        const uri = raw.getURI?.()?.toString?.() || ''
        out.push({ filename: uri.split(/[\\/]/).pop() || 'instance.xmi', content })
      }
      return out
    },

    // Trigger update
    triggerUpdate: () => instanceTree.triggerUpdate()
  }
}
