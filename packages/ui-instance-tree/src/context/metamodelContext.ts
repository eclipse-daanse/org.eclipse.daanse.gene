/**
 * Metamodel Context Adapter
 *
 * Creates an EditorContext from useMetamodeler
 * for the Metamodeler perspective.
 */

import { computed, ref } from 'tsm:vue'
import type { EditorContext, PackageInfo, ClassInfo, TreeNode } from './editorContext'
import type { EClass, EReference, EObject, EPackage } from '@emfts/core'

/**
 * Create an EditorContext for Metamodeler mode
 *
 * @param metamodeler - The result of useSharedMetamodeler()
 */
export function createMetamodelContext(metamodeler: any): EditorContext {
  // Adapt imported packages to PackageInfo
  const allPackages = computed<PackageInfo[]>(() => {
    return metamodeler.allImportedPackages.value.map((pkg: any) => ({
      nsURI: pkg.nsURI,
      name: pkg.name,
      nsPrefix: pkg.nsPrefix,
      ePackage: pkg.ePackage,
      sourceFile: pkg.sourceFile,
      isBuiltIn: pkg.isBuiltIn
    }))
  })

  // Get concrete classes from a package (for Ecore, all classes are relevant)
  function getConcreteClasses(pkg: PackageInfo): ClassInfo[] {
    const classifiers = pkg.ePackage.getEClassifiers?.() || []
    const result: ClassInfo[] = []

    for (const classifier of classifiers) {
      if ('isAbstract' in classifier && 'isInterface' in classifier) {
        const eClass = classifier as EClass
        // For Ecore.ecore, include concrete classes for creating elements
        if (!eClass.isAbstract() && !eClass.isInterface()) {
          result.push({
            qualifiedName: `${pkg.nsPrefix}:${eClass.getName()}`,
            name: eClass.getName(),
            eClass,
            packageInfo: pkg,
            isAbstract: false,
            isInterface: false
          })
        }
      }
    }

    return result
  }

  // Helper to get containment references from an EClass
  function getContainmentReferences(eClass: EClass): EReference[] {
    const refs: EReference[] = []
    const allFeatures = eClass.getEAllStructuralFeatures?.() || []

    for (const feature of allFeatures) {
      if ('isContainment' in feature && (feature as EReference).isContainment()) {
        refs.push(feature as EReference)
      }
    }

    return refs
  }

  // Track selected node (metamodeler doesn't have this, we derive it)
  const selectedNode = ref<TreeNode | null>(null)
  const selectedKeys = ref<Record<string, boolean>>({})

  return {
    mode: 'metamodel',

    // Tree state - metamodeler uses selectedElement, adapt to selectedObject
    treeNodes: metamodeler.treeNodes,
    selectedObject: metamodeler.selectedElement,
    selectedNode,
    selectedKeys,
    expandedKeys: metamodeler.expandedKeys,

    // Selection
    selectObject: (obj) => metamodeler.selectElement(obj),
    selectNode: (node) => {
      selectedNode.value = node
      if (node?.key) {
        selectedKeys.value = { [node.key]: true }
      }
      if (node?.data) {
        metamodeler.selectElement(node.data)
      }
    },

    // Tree operations - context-aware
    createChildInSelected: (eClass, ref) => {
      const parent = metamodeler.selectedElement.value
      if (!parent) return null
      return metamodeler.createChild(parent, ref, eClass)
    },
    deleteSelected: () => {
      const obj = metamodeler.selectedElement.value
      if (!obj) return false
      metamodeler.deleteElement(obj)
      return true
    },

    // Tree operations - explicit parent
    createChild: (parent, ref, eClass) => metamodeler.createChild(parent, ref, eClass),
    deleteObject: (obj) => metamodeler.deleteElement(obj),

    // Get available operations for selected object
    getAvailableContainmentRefs: () => metamodeler.getAvailableContainmentRefs(),
    getValidChildClasses: (ref) => metamodeler.getValidChildClasses(ref),
    getContainmentReferences,

    // Model Browser - shows Ecore.ecore + imported packages
    allPackages,
    getConcreteClasses,
    findClass: (qualifiedName: string) => {
      // Search in all imported packages
      for (const pkg of allPackages.value) {
        const classes = getConcreteClasses(pkg)
        const found = classes.find(c => c.qualifiedName === qualifiedName)
        if (found) return found
      }
      return null
    },

    // Model Browser tree nodes - from metamodeler's imported packages
    modelTreeNodes: metamodeler.modelTreeNodes || computed(() => []),

    // Package management - for metamodeler, this removes imported packages
    unregisterPackage: (nsURI: string) => {
      if (metamodeler.unimportPackage) {
        return metamodeler.unimportPackage(nsURI)
      }
      return false
    },

    // Root object management
    addRootObject: (obj: EObject) => {
      // In metamodeler mode, add to the current ecore resource
      if (metamodeler.addRootObject) {
        metamodeler.addRootObject(obj)
      }
    },

    // Root package (the package being edited in metamodeler)
    rootPackage: metamodeler.rootPackage,

    // Dirty state
    dirty: metamodeler.dirty,

    // Mark as dirty (called when properties are edited)
    markDirty: () => {
      metamodeler.dirty.value = true
    },

    // Trigger update
    triggerUpdate: () => metamodeler.triggerUpdate()
  }
}
