/**
 * Model Registry Composable
 *
 * Manages registered EPackages for the model browser.
 * Supports runtime-loaded .ecore files that users add to their workspace.
 */

import { reactive, computed, ref } from 'tsm:vue'
import type { EPackage, EClass, EClassifier } from '@emfts/core'
import {
  EResourceSetImpl,
  XMIResource,
  URI,
  EPackageRegistry
} from '@emfts/core'
import type { ModelPackageInfo, ClassInfo, EnumInfo, ModelTreeNode, AttributeInfo, ReferenceInfo, ConstraintInfo } from '../types'
import { getClassifierIcon, MODEL_ICONS, getIconForClassViaRegistry } from '../types'
import { useSharedViews } from 'ui-instance-tree'

/**
 * Registry state
 */
interface RegistryState {
  packages: Map<string, ModelPackageInfo>
}

const state = reactive<RegistryState>({
  packages: new Map()
})

// Track icon version for reactivity - used to trigger tree re-renders when icons change
const iconVersionRef = ref(0)

// Loading state for model loading
const isLoadingModel = ref(false)
const loadingModelName = ref('')

// Resource set for loading .ecore files
let ecoreResourceSet: InstanceType<typeof EResourceSetImpl> | null = null

function getEcoreResourceSet() {
  if (!ecoreResourceSet) {
    ecoreResourceSet = new EResourceSetImpl()
  }
  return ecoreResourceSet
}

/**
 * Composable for managing EPackage registry
 */
export function useModelRegistry() {
  /**
   * Initialize the registry (no built-in packages loaded by default)
   */
  function initialize(): void {
    console.log('[ModelRegistry] Initialized')
  }

  /**
   * Load an .ecore file and register its EPackage
   * @param ecoreContent The XML content of the .ecore file
   * @param sourceFile The path to the source file (for reference)
   * @returns The registered ModelPackageInfo or null if loading failed
   */
  async function loadEcoreFile(ecoreContent: string, sourceFile: string): Promise<ModelPackageInfo | null> {
    // Set loading state
    const fileName = sourceFile.split('/').pop() || sourceFile
    loadingModelName.value = fileName
    isLoadingModel.value = true

    console.log('[ModelRegistry] Setting loading state:', fileName)

    // Allow Vue to render loading state before blocking operation
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      console.log('[ModelRegistry] Loading .ecore file:', sourceFile)

      const rs = getEcoreResourceSet()
      const uri = URI.createURI(sourceFile)

      // Parse XMI content via temporary resource
      const tempUri = URI.createURI('file://temp.ecore')
      const resource = new XMIResource(tempUri)
      resource.setResourceSet(rs)
      resource.loadFromString(ecoreContent)

      const contents = resource.getContents()
      if (contents.length === 0) {
        console.error('[ModelRegistry] No contents in .ecore file')
        return null
      }

      // The root element should be an EPackage
      const ePackage = contents.get(0) as EPackage
      if (!ePackage.getNsURI || !ePackage.getName) {
        console.error('[ModelRegistry] Root element is not an EPackage')
        return null
      }

      console.log('[ModelRegistry] Loaded EPackage:', ePackage.getName(), ePackage.getNsURI())

      // Log classifiers
      const classifiers = ePackage.getEClassifiers ? ePackage.getEClassifiers() : []
      console.log('[ModelRegistry] EClassifiers count:', classifiers.length)
      classifiers.forEach((c: any) => {
        console.log('[ModelRegistry]   -', c.getName ? c.getName() : c)
      })

      // Check for subpackages
      const subPackages = ePackage.getESubpackages ? ePackage.getESubpackages() : []
      console.log('[ModelRegistry] Subpackages count:', subPackages.length)
      subPackages.forEach((sp: any) => {
        console.log('[ModelRegistry]   Subpackage:', sp.getName ? sp.getName() : sp)
      })

      // Register in global package registry (for XMI loading)
      EPackageRegistry.INSTANCE.set(ePackage.getNsURI(), ePackage)

      // Register in our local registry
      const info = registerLoadedPackage(ePackage, sourceFile)
      console.log('[ModelRegistry] Registered, total packages:', state.packages.size)

      return info
    } catch (error) {
      console.error('[ModelRegistry] Failed to load .ecore file:', error)
      return null
    } finally {
      isLoadingModel.value = false
      loadingModelName.value = ''
    }
  }

  /**
   * Register a package loaded from .ecore file
   * Also recursively registers subpackages that have their own nsURI
   */
  function registerLoadedPackage(ePackage: EPackage, sourceFile: string): ModelPackageInfo {
    const info: ModelPackageInfo = {
      nsURI: ePackage.getNsURI(),
      name: ePackage.getName(),
      nsPrefix: ePackage.getNsPrefix(),
      ePackage,
      sourceFile,
      isBuiltIn: false
    }
    state.packages.set(info.nsURI, info)
    console.log('[ModelRegistry] Registered package:', info.name, info.nsURI)

    // Recursively register subpackages that have their own nsURI/nsPrefix
    registerSubpackages(ePackage, sourceFile)

    return info
  }

  /**
   * Recursively register subpackages with their own nsURI
   */
  function registerSubpackages(parentPkg: EPackage, sourceFile: string): void {
    const subPackages = parentPkg.getESubpackages ? parentPkg.getESubpackages() : []
    for (const subPkg of subPackages) {
      const nsURI = subPkg.getNsURI?.()
      const nsPrefix = subPkg.getNsPrefix?.()
      const name = subPkg.getName?.()

      // Only register if subpackage has its own nsURI (not inherited from parent)
      if (nsURI && nsPrefix && !state.packages.has(nsURI)) {
        const info: ModelPackageInfo = {
          nsURI,
          name: name || 'unknown',
          nsPrefix,
          ePackage: subPkg,
          sourceFile,
          isBuiltIn: false
        }
        state.packages.set(nsURI, info)
        console.log('[ModelRegistry] Registered subpackage:', info.name, info.nsURI, 'prefix:', nsPrefix)
      }

      // Recurse into nested subpackages
      registerSubpackages(subPkg, sourceFile)
    }
  }

  /**
   * Unregister a package by namespace URI
   */
  function unregisterPackage(nsURI: string): boolean {
    return state.packages.delete(nsURI)
  }

  /**
   * Get package by namespace URI
   */
  function getPackage(nsURI: string): ModelPackageInfo | undefined {
    return state.packages.get(nsURI)
  }

  /**
   * Get all registered packages
   */
  const allPackages = computed((): ModelPackageInfo[] => {
    return Array.from(state.packages.values())
  })

  /**
   * Get concrete (non-abstract, non-interface) classes from a package (including subpackages)
   */
  function getConcreteClasses(packageInfo: ModelPackageInfo): ClassInfo[] {
    const result: ClassInfo[] = []
    collectConcreteClasses(packageInfo.ePackage, packageInfo, result)
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Recursively collect concrete classes from a package and its subpackages
   */
  function collectConcreteClasses(ePackage: EPackage, packageInfo: ModelPackageInfo, result: ClassInfo[]): void {
    const classifiers = ePackage.getEClassifiers ? ePackage.getEClassifiers() : []

    for (const classifier of classifiers) {
      if (isEClass(classifier)) {
        const eClass = classifier as EClass
        if (!eClass.isAbstract() && !eClass.isInterface()) {
          result.push({
            qualifiedName: `${packageInfo.nsPrefix}:${eClass.getName()}`,
            name: eClass.getName(),
            isAbstract: false,
            isInterface: false,
            eClass,
            packageInfo
          })
        }
      }
    }

    // Recursively process subpackages
    const subPackages = ePackage.getESubpackages ? ePackage.getESubpackages() : []
    for (const subPkg of subPackages) {
      collectConcreteClasses(subPkg, packageInfo, result)
    }
  }

  /**
   * Get all classes (including abstract) from a package
   */
  function getAllClasses(packageInfo: ModelPackageInfo): ClassInfo[] {
    const classifiers = packageInfo.ePackage.getEClassifiers()
    const result: ClassInfo[] = []

    for (const classifier of classifiers) {
      if (isEClass(classifier)) {
        const eClass = classifier as EClass
        result.push({
          qualifiedName: `${packageInfo.nsPrefix}:${eClass.getName()}`,
          name: eClass.getName(),
          isAbstract: eClass.isAbstract(),
          isInterface: eClass.isInterface(),
          eClass,
          packageInfo
        })
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Convert registry to tree nodes for PrimeVue Tree
   * Note: We access iconVersionRef to trigger re-computation when icons change
   * Only shows root packages - subpackages are shown as children of their parent
   */
  const treeNodes = computed((): ModelTreeNode[] => {
    // Access iconVersionRef to create reactive dependency on icon changes
    const _iconVersion = iconVersionRef.value

    // Access views version for reactivity
    const views = useSharedViews()
    const _viewVersion = views.version.value

    console.log('[ModelRegistry] Computing treeNodes, icon version:', _iconVersion, 'packages:', allPackages.value.length)
    try {
      // Filter to only show root packages (those without an eSuperPackage)
      const rootPackages = allPackages.value.filter(pkg => {
        const eSuperPackage = pkg.ePackage.getESuperPackage?.()
        return !eSuperPackage
      })
      console.log('[ModelRegistry] Root packages:', rootPackages.length)

      const rawNodes = rootPackages.map(pkg => packageToTreeNode(pkg))
      // Apply view filtering to hide types
      return filterModelTreeNodes(rawNodes, views.isTypeHidden)
    } catch (e) {
      console.error('[ModelRegistry] Error computing treeNodes:', e)
      return []
    }
  })

  /**
   * Recursively filter model tree nodes based on type visibility
   */
  function filterModelTreeNodes(
    nodes: ModelTreeNode[],
    isTypeHidden: (eClass: EClass) => boolean
  ): ModelTreeNode[] {
    return nodes
      .map(node => {
        // For class nodes, check if the type is hidden
        if (node.type === 'class' && node.data?.eClass) {
          if (isTypeHidden(node.data.eClass)) {
            return null // Mark for removal
          }
          return node
        }

        // For packages/subpackages, filter children first
        if (!node.children || node.children.length === 0) {
          // Package with no children - remove it
          if (node.type === 'package' || node.type === 'subpackage') {
            return null
          }
          return node
        }

        const filteredChildren = filterModelTreeNodes(node.children, isTypeHidden)

        // Remove packages that have no visible children
        if ((node.type === 'package' || node.type === 'subpackage') && filteredChildren.length === 0) {
          return null
        }

        return {
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : undefined,
          leaf: filteredChildren.length === 0
        }
      })
      .filter((node): node is ModelTreeNode => node !== null)
  }

  /**
   * Convert a package to a tree node (including subpackages)
   */
  function packageToTreeNode(pkg: ModelPackageInfo): ModelTreeNode {
    const children: ModelTreeNode[] = []

    try {
      const classes = getAllClasses(pkg)

      // Add subpackages first
      const subPackages = pkg.ePackage.getESubpackages ? pkg.ePackage.getESubpackages() : []
      for (const subPkg of subPackages) {
        try {
          children.push(ePackageToTreeNode(subPkg, pkg))
        } catch (e) {
          console.warn('[ModelRegistry] Error processing subpackage:', e)
        }
      }

      // Add classes
      for (const cls of classes) {
        try {
          children.push(classToTreeNode(cls))
        } catch (e) {
          console.warn('[ModelRegistry] Error processing class:', cls.name, e)
        }
      }

      // Add EEnums
      const classifiers = pkg.ePackage.getEClassifiers ? pkg.ePackage.getEClassifiers() : []
      for (const classifier of classifiers) {
        if (isEEnum(classifier)) {
          try {
            children.push(enumToTreeNode(classifier, pkg))
          } catch (e) {
            console.warn('[ModelRegistry] Error processing enum:', e)
          }
        }
      }
    } catch (e) {
      console.error('[ModelRegistry] Error in packageToTreeNode:', e)
    }

    return {
      key: `pkg:${pkg.nsURI}`,
      label: pkg.name,
      icon: MODEL_ICONS.package,
      data: pkg,
      type: 'package',
      leaf: children.length === 0,
      selectable: true,
      children
    }
  }

  /**
   * Convert an EPackage (subpackage) to a tree node
   */
  function ePackageToTreeNode(ePackage: EPackage, parentPkgInfo: ModelPackageInfo): ModelTreeNode {
    const children: ModelTreeNode[] = []

    // Add subpackages recursively
    const subPackages = ePackage.getESubpackages ? ePackage.getESubpackages() : []
    for (const subPkg of subPackages) {
      children.push(ePackageToTreeNode(subPkg, parentPkgInfo))
    }

    // Add classifiers
    const classifiers = ePackage.getEClassifiers ? ePackage.getEClassifiers() : []
    for (const classifier of classifiers) {
      if (isEClass(classifier)) {
        const eClass = classifier as EClass
        const classInfo: ClassInfo = {
          qualifiedName: `${parentPkgInfo.nsPrefix}:${ePackage.getName()}:${eClass.getName()}`,
          name: eClass.getName(),
          isAbstract: eClass.isAbstract(),
          isInterface: eClass.isInterface(),
          eClass,
          packageInfo: parentPkgInfo
        }
        children.push(classToTreeNode(classInfo))
      } else if (isEEnum(classifier)) {
        children.push(enumToTreeNode(classifier, parentPkgInfo))
      }
    }

    return {
      key: `pkg:${parentPkgInfo.nsURI}:${ePackage.getName()}`,
      label: ePackage.getName(),
      icon: MODEL_ICONS.package,
      data: { ePackage, parentPkgInfo },
      type: 'subpackage',
      leaf: children.length === 0,
      selectable: true,
      children
    }
  }

  /**
   * Convert a class to a tree node
   */
  function classToTreeNode(cls: ClassInfo): ModelTreeNode {
    // Try icon registry first, then fall back to default classifier icon
    const customIcon = getIconForClassViaRegistry(cls.eClass)
    const icon = customIcon || getClassifierIcon(cls.eClass)

    const children: ModelTreeNode[] = []

    // Add attributes
    try {
      const attributes = cls.eClass.getEAttributes ? cls.eClass.getEAttributes() : []
      for (const attr of attributes) {
        try {
          const eType = attr.getEType ? attr.getEType() : null
          const typeName = getEObjectName(eType) || 'unknown'
          const attrName = typeof attr.getName === 'function' ? attr.getName() : (attr.name || 'unknown')
          const attrInfo: AttributeInfo = {
            name: attrName,
            typeName,
            isMany: typeof attr.isMany === 'function' ? attr.isMany() : false,
            isRequired: typeof attr.isRequired === 'function' ? attr.isRequired() : false
          }
          children.push({
            key: `attr:${cls.qualifiedName}:${attrName}`,
            label: `${attrName}: ${typeName}${attrInfo.isMany ? '[]' : ''}`,
            icon: 'pi pi-minus',
            data: attrInfo,
            type: 'attribute',
            leaf: true,
            selectable: false
          })
        } catch (e) {
          console.warn('[ModelRegistry] Error processing attribute:', e)
        }
      }
    } catch (e) {
      console.warn('[ModelRegistry] Error getting attributes:', e)
    }

    // Add references
    try {
      const references = cls.eClass.getEReferences ? cls.eClass.getEReferences() : []
      for (const ref of references) {
        try {
          const refType = ref.getEReferenceType ? ref.getEReferenceType() : null
          const typeName = getEObjectName(refType) || 'unknown'
          const refName = typeof ref.getName === 'function' ? ref.getName() : (ref.name || 'unknown')
          const refInfo: ReferenceInfo = {
            name: refName,
            typeName,
            isMany: typeof ref.isMany === 'function' ? ref.isMany() : false,
            isRequired: typeof ref.isRequired === 'function' ? ref.isRequired() : false,
            isContainment: typeof ref.isContainment === 'function' ? ref.isContainment() : false
          }
          const refIcon = refInfo.isContainment ? 'pi pi-box' : 'pi pi-link'
          children.push({
            key: `ref:${cls.qualifiedName}:${refName}`,
            label: `${refName}: ${typeName}${refInfo.isMany ? '[]' : ''}`,
            icon: refIcon,
            data: refInfo,
            type: 'reference',
            leaf: true,
            selectable: false
          })
        } catch (e) {
          console.warn('[ModelRegistry] Error processing reference:', e)
        }
      }
    } catch (e) {
      console.warn('[ModelRegistry] Error getting references:', e)
    }

    // Add OCL constraints
    try {
      const constraints = extractOclConstraints(cls.eClass, cls.name)
      for (const constraint of constraints) {
        children.push({
          key: `ocl:${cls.qualifiedName}:${constraint.name}`,
          label: constraint.name,
          icon: 'pi pi-code',
          data: constraint,
          type: 'constraint',
          leaf: true,
          selectable: true
        })
      }
    } catch (e) {
      console.warn('[ModelRegistry] Error getting OCL constraints:', e)
    }

    return {
      key: `cls:${cls.qualifiedName}`,
      label: cls.name,
      icon,
      data: cls,
      type: 'class',
      leaf: children.length === 0,
      selectable: true,
      children: children.length > 0 ? children : undefined,
      // Only concrete classes are draggable (for creating instances)
      draggable: !cls.isAbstract && !cls.isInterface
    }
  }

  /**
   * Convert an EEnum to a tree node
   */
  function enumToTreeNode(classifier: any, pkg: ModelPackageInfo): ModelTreeNode {
    const enumName = getEObjectName(classifier) || '(EEnum)'
    const literals: string[] = []
    const children: ModelTreeNode[] = []

    try {
      // Get literals - try getELiterals() first, then eGet for DynamicEObject
      let eLiterals: any = null
      if (typeof classifier.getELiterals === 'function') {
        eLiterals = classifier.getELiterals()
      } else if (typeof classifier.eClass === 'function') {
        const ec = classifier.eClass()
        const litFeature = ec.getEStructuralFeature?.('eLiterals')
        if (litFeature) eLiterals = classifier.eGet?.(litFeature)
      }

      if (eLiterals) {
        for (const lit of eLiterals) {
          const litName = getEObjectName(lit) || '?'
          // Get value - try getValue() first, then eGet
          let value: any = undefined
          if (typeof lit.getValue === 'function') {
            value = lit.getValue()
          } else if (typeof lit.eClass === 'function') {
            const ec = lit.eClass()
            const vf = ec.getEStructuralFeature?.('value')
            if (vf) value = lit.eGet?.(vf)
          }
          const label = value !== undefined && value !== null ? `${litName} = ${value}` : litName
          literals.push(litName)
          children.push({
            key: `enumlit:${pkg.nsPrefix}:${enumName}:${litName}`,
            label,
            icon: 'pi pi-minus',
            data: { name: litName, typeName: enumName, isMany: false, isRequired: false } as AttributeInfo,
            type: 'attribute',
            leaf: true,
            selectable: false
          })
        }
      }
    } catch (e) {
      console.warn('[ModelRegistry] Error reading enum literals:', e)
    }

    const enumInfo: EnumInfo = {
      name: enumName,
      qualifiedName: `${pkg.nsPrefix}:${enumName}`,
      literals,
      packageInfo: pkg
    }

    return {
      key: `enum:${pkg.nsPrefix}:${enumName}`,
      label: `${enumName} <<enum>>`,
      icon: MODEL_ICONS.enum,
      data: enumInfo,
      type: 'enum',
      leaf: children.length === 0,
      selectable: false,
      children: children.length > 0 ? children : undefined
    }
  }

  /**
   * Find a class by qualified name
   */
  function findClass(qualifiedName: string): ClassInfo | undefined {
    const [prefix, name] = qualifiedName.split(':')

    for (const pkg of state.packages.values()) {
      if (pkg.nsPrefix === prefix) {
        const classes = getAllClasses(pkg)
        return classes.find(c => c.name === name)
      }
    }

    return undefined
  }

  /**
   * Find a class by EClass instance
   */
  function findClassInfo(eClass: EClass): ClassInfo | undefined {
    const ePackage = eClass.getEPackage()
    if (!ePackage) return undefined

    const pkg = state.packages.get(ePackage.getNsURI())
    if (!pkg) return undefined

    const classes = getAllClasses(pkg)
    return classes.find(c => c.eClass === eClass)
  }

  /**
   * Force refresh of icon mappings (call after loading icons from EditorConfig)
   */
  function refreshIcons(): void {
    iconVersionRef.value++
    console.log('[ModelRegistry] Icons refreshed, version:', iconVersionRef.value)
  }

  return {
    // State
    allPackages,
    treeNodes,
    isLoading: isLoadingModel,
    loadingName: loadingModelName,

    // Methods
    initialize,
    loadEcoreFile,
    registerLoadedPackage,
    unregisterPackage,
    getPackage,
    getConcreteClasses,
    getAllClasses,
    findClass,
    findClassInfo,
    refreshIcons,
    getEcoreResourceSet
  }
}

/**
 * Type guard for EClass
 */
function isEClass(classifier: EClassifier): classifier is EClass {
  return 'isAbstract' in classifier && 'isInterface' in classifier
}

/**
 * Check if a classifier is an EEnum
 * Handles both BasicEEnum (getELiterals) and DynamicEObject (check metaclass name)
 */
function isEEnum(classifier: any): boolean {
  if (typeof classifier.getELiterals === 'function') return true
  // DynamicEObject: check metaclass name
  if (typeof classifier.eClass === 'function') {
    return classifier.eClass().getName() === 'EEnum'
  }
  return false
}

/**
 * Check if a classifier is an EDataType (but not EEnum)
 */
function isEDataType(classifier: any): boolean {
  if (isEEnum(classifier)) return false
  if (typeof classifier.getInstanceClassName === 'function') return true
  if (typeof classifier.eClass === 'function') {
    return classifier.eClass().getName() === 'EDataType'
  }
  return false
}

/**
 * Get name from any EObject (handles DynamicEObject without getName())
 */
function getEObjectName(obj: any): string | null {
  if (!obj) return null
  if (typeof obj.getName === 'function') {
    const n = obj.getName()
    if (n) return n
  }
  if (typeof obj.eClass === 'function') {
    const ec = obj.eClass()
    const nf = ec.getEStructuralFeature?.('name')
    if (nf) {
      const val = obj.eGet?.(nf)
      if (val) return String(val)
    }
  }
  return null
}

/**
 * OCL annotation source URIs
 */
const OCL_SOURCES = ['http://www.eclipse.org/fennec/m2x/ocl/1.0', 'http://www.eclipse.org/emf/2002/Ecore/OCL', 'http://www.eclipse.org/OCL/Pivot']
function isOclSource(s: string | null | undefined): boolean { return !!s && OCL_SOURCES.includes(s) }

/**
 * Helper to get annotation source from EAnnotation
 */
function getAnnotationSource(annotation: any): string | null {
  if ('getSource' in annotation && typeof annotation.getSource === 'function') {
    return annotation.getSource()
  }
  if ('eGet' in annotation && typeof annotation.eGet === 'function') {
    const eClass = annotation.eClass?.()
    if (eClass) {
      const sourceFeature = eClass.getEStructuralFeature('source')
      if (sourceFeature) {
        return annotation.eGet(sourceFeature) as string | null
      }
    }
  }
  return null
}

/**
 * Helper to get annotation details from EAnnotation
 */
function getAnnotationDetails(annotation: any): Map<string, string> {
  if ('getDetails' in annotation && typeof annotation.getDetails === 'function') {
    const details = annotation.getDetails()
    if (details instanceof Map) {
      return details
    }
  }

  if ('eGet' in annotation && typeof annotation.eGet === 'function') {
    const eClass = annotation.eClass?.()
    if (eClass) {
      const detailsFeature = eClass.getEStructuralFeature('details')
      if (detailsFeature) {
        const detailsList = annotation.eGet(detailsFeature)
        const result = new Map<string, string>()

        if (Array.isArray(detailsList)) {
          for (const entry of detailsList) {
            const key = getMapEntryKey(entry)
            const value = getMapEntryValue(entry)
            if (key !== null) {
              result.set(key, value ?? '')
            }
          }
        } else if (detailsList && typeof detailsList === 'object') {
          const list = detailsList as any
          if (typeof list.size === 'function') {
            for (let i = 0; i < list.size(); i++) {
              const entry = list.get(i)
              const key = getMapEntryKey(entry)
              const value = getMapEntryValue(entry)
              if (key !== null) {
                result.set(key, value ?? '')
              }
            }
          }
        }

        return result
      }
    }
  }

  return new Map()
}

function getMapEntryKey(entry: any): string | null {
  if (!entry) return null
  if ('key' in entry) return entry.key
  if ('eGet' in entry && typeof entry.eGet === 'function') {
    const eClass = entry.eClass?.()
    if (eClass) {
      const keyFeature = eClass.getEStructuralFeature('key')
      if (keyFeature) return entry.eGet(keyFeature) as string | null
    }
  }
  return null
}

function getMapEntryValue(entry: any): string | null {
  if (!entry) return null
  if ('value' in entry) return entry.value
  if ('eGet' in entry && typeof entry.eGet === 'function') {
    const eClass = entry.eClass?.()
    if (eClass) {
      const valueFeature = eClass.getEStructuralFeature('value')
      if (valueFeature) return entry.eGet(valueFeature) as string | null
    }
  }
  return null
}

/**
 * Extract OCL constraints from an EClass
 */
function extractOclConstraints(eClass: EClass, className: string): ConstraintInfo[] {
  const constraints: ConstraintInfo[] = []

  try {
    const annotations = eClass.getEAnnotations?.() ?? []

    for (const annotation of annotations) {
      const source = getAnnotationSource(annotation)

      if (isOclSource(source)) {
        const details = getAnnotationDetails(annotation)

        for (const [constraintName, oclExpression] of details) {
          // Skip special keys
          if (['body', 'derivation', 'documentation', '_body'].includes(constraintName)) {
            continue
          }

          constraints.push({
            name: constraintName,
            expression: oclExpression,
            contextClass: className
          })
        }
      }
    }
  } catch (e) {
    console.warn('[ModelRegistry] Error extracting OCL constraints:', e)
  }

  return constraints
}

/**
 * Shared singleton instance
 */
let sharedInstance: ReturnType<typeof useModelRegistry> | null = null

export function useSharedModelRegistry() {
  if (!sharedInstance) {
    sharedInstance = useModelRegistry()
    sharedInstance.initialize()
  }
  return sharedInstance
}
