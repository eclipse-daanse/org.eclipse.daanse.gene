/**
 * Instance Context Adapter
 *
 * Creates an EditorContext from useInstanceTree + useModelRegistry
 * for the Instance Editor perspective.
 */

import { computed, ref } from 'tsm:vue'
import type { EditorContext, PackageInfo, ClassInfo, TreeNode } from './editorContext'
import { useSharedInstanceTree } from '../composables/useInstanceTree'
import type { EClass, EReference, EObject } from '@emfts/core'

// Model registry resolver — avoids circular dependency with ui-model-browser
let _modelRegistryGetter: (() => any) | null = null

export function setModelRegistryGetter(getter: () => any) {
  _modelRegistryGetter = getter
}

/**
 * Create an EditorContext for Instance Editor mode
 */
export function createInstanceContext(): EditorContext {
  const instanceTree = useSharedInstanceTree()
  // Lazy resolve: model-browser may load after instance-tree
  const getModelRegistry = () => _modelRegistryGetter?.() ?? null

  // Adapt model registry packages to PackageInfo
  const allPackages = computed<PackageInfo[]>(() => {
    const mr = getModelRegistry()
    if (!mr) return []
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

    // Dirty state
    dirty: instanceTree.dirty || ref(false),

    // Mark as dirty (for properties panel to notify changes)
    markDirty: () => {
      if (instanceTree.dirty) {
        instanceTree.dirty.value = true
      }
    },

    // Trigger update
    triggerUpdate: () => instanceTree.triggerUpdate()
  }
}
