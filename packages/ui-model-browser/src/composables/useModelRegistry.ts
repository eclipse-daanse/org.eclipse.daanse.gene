/**
 * Model Registry Composable
 *
 * Manages registered EPackages for the model browser.
 * Supports runtime-loaded .ecore files that users add to their workspace.
 */

import { reactive, computed, ref, shallowRef } from 'tsm:vue'
import type { EPackage, EClass, EClassifier } from '@emfts/core'
import {
  EResourceSetImpl,
  XMIResource,
  URI,
  EPackageRegistry
} from '@emfts/core'
import type { ModelPackageInfo, ClassInfo, EnumInfo, ModelTreeNode, AttributeInfo, ReferenceInfo, ConstraintInfo } from '../types'
import { getClassifierIcon, MODEL_ICONS, getIconForClassViaRegistry } from '../types'
// Views service injected via setViewsService() from plugin activate
const _viewsServiceRef = shallowRef<any>(null)

/**
 * Resolve internal cross-references within an EPackage.
 * EMFTs may not resolve eType="#//ClassName" references during XMI parsing.
 * This walks all EReferences and EAttributes and sets their eType
 * by looking up classifiers in the same package (and registered packages).
 */
function resolveInternalReferences(ePackage: EPackage, ecoreXml?: string): void {
  const classifiers = ePackage.getEClassifiers?.() || []
  const classifierMap = new Map<string, any>()
  for (const c of classifiers) {
    const name = c.getName?.()
    if (name) classifierMap.set(name, c)
  }

  // Parse eType mappings from XML source
  const typeMap = ecoreXml ? parseETypeMapFromXml(ecoreXml) : new Map<string, string>()
  console.log('[resolveInternalReferences] Package:', ePackage.getName?.(), 'typeMap entries:', typeMap.size)

  for (const classifier of classifiers) {
    const metaName = classifier.eClass?.()?.getName?.()
    if (metaName !== 'EClass') continue
    const clsName = classifier.getName?.()

    const features = classifier.getEAllStructuralFeatures?.() || []
    for (const feature of features) {
      const featureMeta = feature.eClass?.()
      if (!featureMeta) continue
      const featureName = feature.getName?.()

      const eTypeFeature = featureMeta.getEStructuralFeature?.('eType')
      if (!eTypeFeature) continue

      const currentType = feature.eGet?.(eTypeFeature)
      if (currentType) continue // Already resolved

      // Look up type from XML-parsed map: "ClassName.featureName" → eType URI
      const key = `${clsName}.${featureName}`
      const eTypeUri = typeMap.get(key)
      if (!eTypeUri) continue

      const typeName = extractClassNameFromURI(eTypeUri)
      if (!typeName) continue

      // Resolve from same package
      const resolved = classifierMap.get(typeName)
      if (resolved) {
        feature.eSet(eTypeFeature, resolved)
        console.log('[resolveInternalReferences] RESOLVED:', key, '→', typeName)
        continue
      }
      // Resolve from package registry (cross-package refs like Ecore#//EString)
      const fromRegistry = resolveFromPackageRegistry(typeName)
      if (fromRegistry) {
        feature.eSet(eTypeFeature, fromRegistry)
        console.log('[resolveInternalReferences] RESOLVED (registry):', key, '→', typeName)
      }
    }

    // Resolve eOpposite
    resolveOpposites(classifier, classifierMap, typeMap)
  }
}

/**
 * Parse eType attribute mappings from raw ecore XML.
 * Returns a map: "ClassName.featureName" → "eType URI string"
 */
function parseETypeMapFromXml(xml: string): Map<string, string> {
  const result = new Map<string, string>()

  // Match EClass elements and their features
  // Pattern: <eClassifiers ... name="University" ...> ... <eStructuralFeatures ... name="students" eType="#//Student" ...> ...
  let currentClass = ''

  // Simple regex-based parser for ecore XML
  const tagRegex = /<(\w+:)?(\w+)\s([^>]*?)(?:\/>|>)/g
  let match

  while ((match = tagRegex.exec(xml)) !== null) {
    const tagName = match[2]
    const attrs = match[3]

    if (tagName === 'eClassifiers' || tagName === 'EClass') {
      const nameMatch = attrs.match(/\bname="([^"]*)"/)
      if (nameMatch) {
        currentClass = nameMatch[1]
      }
    }

    if (tagName === 'eStructuralFeatures') {
      const nameMatch = attrs.match(/\bname="([^"]*)"/)
      const eTypeMatch = attrs.match(/\beType="([^"]*)"/)
      const eOppositeMatch = attrs.match(/\beOpposite="([^"]*)"/)

      if (nameMatch && eTypeMatch && currentClass) {
        result.set(`${currentClass}.${nameMatch[1]}`, eTypeMatch[1])
      }
      if (nameMatch && eOppositeMatch && currentClass) {
        result.set(`${currentClass}.${nameMatch[1]}.__opposite`, eOppositeMatch[1])
      }
    }
  }

  return result
}

function extractClassNameFromURI(uri: string): string | null {
  // '#//Student' or 'http://example.org/pkg#//Student'
  const hashIdx = uri.indexOf('#//')
  if (hashIdx >= 0) {
    return uri.substring(hashIdx + 3)
  }
  // '#Student'
  const simpleHash = uri.indexOf('#')
  if (simpleHash >= 0) {
    return uri.substring(simpleHash + 1).replace(/^\/\//, '')
  }
  // 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString'
  if (uri.includes('ecore:EDataType')) {
    const parts = uri.split('#//')
    if (parts.length > 1) return parts[1]
  }
  return null
}

function resolveFromPackageRegistry(typeName: string): any | null {
  // Check all registered packages
  for (const nsURI of EPackageRegistry.INSTANCE.keys()) {
    const pkg = EPackageRegistry.INSTANCE.getEPackage(nsURI)
    if (pkg) {
      const classifier = (pkg as any).getEClassifier?.(typeName)
      if (classifier) return classifier
    }
  }
  return null
}

/**
 * Resolve cross-package eType proxies in all registered packages.
 * After loading multiple .ecore files, EReferences that point to types
 * in other packages may still be proxies. This walks all features
 * and resolves them via the EPackageRegistry.
 */
function resolveCrossPackageProxies(): void {
  for (const [, info] of state.packages) {
    resolveProxiesInPackage(info.ePackage)
  }
}

// Find an EPackage by nsURI from state.packages (navigates into subpackage paths)
function findPackageForProxy(nsURI: string, subPath: string[]): any {
  let pkg: any = state.packages.get(nsURI)?.ePackage
  if (!pkg) return null
  for (const seg of subPath) {
    const subs = pkg.getESubpackages?.() || []
    pkg = null
    for (const sp of subs) {
      if (sp.getName?.() === seg) { pkg = sp; break }
    }
    if (!pkg) return null
  }
  return pkg
}

function resolveProxiesInPackage(pkg: EPackage): void {
  const classifiers = (pkg as any).getEClassifiers?.() || []
  for (const classifier of classifiers) {
    if (classifier.eClass?.()?.getName?.() !== 'EClass') continue
    // Use getEStructuralFeatures (own features only) to avoid traversing
    // supertype chains that may themselves contain unresolved proxies
    const features = classifier.getEStructuralFeatures?.() || []
    for (const feature of features) {
      const eType = feature.eType
      if (!eType || typeof eType.eIsProxy !== 'function' || !eType.eIsProxy()) continue

      const proxyURI = eType.eProxyURI?.()?.toString?.() || ''
      const hashIdx = proxyURI.indexOf('#')
      if (hashIdx < 0) continue

      const nsURI = proxyURI.substring(0, hashIdx)
      const fragment = proxyURI.substring(hashIdx + 1).replace(/^\/+/, '')
      const segments = fragment.split('/')
      const className = segments.pop()!

      const targetPkg = findPackageForProxy(nsURI, segments)
      if (!targetPkg) continue

      const resolved = targetPkg.getEClassifier?.(className)
      if (resolved) {
        feature.eType = resolved
        if (typeof feature.setEType === 'function') feature.setEType(resolved)
      }
    }
  }

  // Recurse into subpackages
  const subPackages = (pkg as any).getESubpackages?.() || []
  for (const sub of subPackages) {
    resolveProxiesInPackage(sub)
  }
}

/**
 * Resolve eOpposite references between EReferences in the same package
 */
function resolveOpposites(classifier: any, classifierMap: Map<string, any>, typeMap: Map<string, string>): void {
  const clsName = classifier.getName?.()
  const features = classifier.getEAllStructuralFeatures?.() || []
  for (const feature of features) {
    const featureMeta = feature.eClass?.()
    if (!featureMeta || featureMeta.getName?.() !== 'EReference') continue

    const oppositeFeature = featureMeta.getEStructuralFeature?.('eOpposite')
    if (!oppositeFeature) continue

    const currentOpposite = feature.eGet?.(oppositeFeature)
    if (currentOpposite) continue

    const featureName = feature.getName?.()
    const key = `${clsName}.${featureName}.__opposite`
    const oppositeUri = typeMap.get(key)
    if (!oppositeUri) continue

    // Format: '#//ClassName/featureName'
    const match = oppositeUri.match(/#\/\/(\w+)\/(\w+)/)
    if (match) {
      const [, targetClass, targetFeature] = match
      const targetCls = classifierMap.get(targetClass)
      if (targetCls) {
        const targetFeatures = targetCls.getEAllStructuralFeatures?.() || []
        const opposite = targetFeatures.find((f: any) => f.getName?.() === targetFeature)
        if (opposite) {
          feature.eSet(oppositeFeature, opposite)
          console.log('[resolveInternalReferences] RESOLVED opposite:', key, '→', targetClass + '.' + targetFeature)
        }
      }
    }
  }
}

export function setViewsService(views: any) {
  _viewsServiceRef.value = views
}

/**
 * Registry state
 */
interface RegistryState {
  packages: Map<string, ModelPackageInfo>
}

const state = reactive<RegistryState>({
  packages: new Map()
})

// Register built-in EMF packages (Ecore, XMLType) from EPackageRegistry.INSTANCE
// into state.packages so cross-package proxy resolution can find them.
function registerBuiltInPackages(): void {
  for (const nsURI of EPackageRegistry.INSTANCE.keys()) {
    if (state.packages.has(nsURI)) continue
    const ePackage = EPackageRegistry.INSTANCE.getEPackage(nsURI) as EPackage
    if (!ePackage) continue
    state.packages.set(nsURI, {
      nsURI,
      name: ePackage.getName?.() ?? 'unknown',
      nsPrefix: ePackage.getNsPrefix?.() ?? '',
      ePackage,
      sourceFile: '<built-in>',
      isBuiltIn: true
    })
  }
}
registerBuiltInPackages()

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

      // Resolve internal cross-references (eType="#//ClassName") that EMFTs may not resolve
      resolveInternalReferences(ePackage, ecoreContent)

      // Register in global package registry (for XMI loading)
      EPackageRegistry.INSTANCE.set(ePackage.getNsURI(), ePackage)

      // Register in our local registry
      const info = registerLoadedPackage(ePackage, sourceFile)
      console.log('[ModelRegistry] Registered, total packages:', state.packages.size)

      // Resolve cross-package eType proxies now that all packages are registered
      resolveCrossPackageProxies()

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
        EPackageRegistry.INSTANCE.set(nsURI, subPkg)
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

    // Access views version for reactivity (injected via setViewsService)
    const _viewVersion = _viewsServiceRef.value?.version?.value ?? 0

    console.log('[ModelRegistry] Computing treeNodes, icon version:', _iconVersion, 'packages:', allPackages.value.length)
    try {
      // Filter to only show root packages (those without an eSuperPackage)
      // Hide built-in packages (Ecore, XMLType etc.) from the model browser
      const rootPackages = allPackages.value.filter(pkg => {
        if (pkg.isBuiltIn) return false
        const eSuperPackage = pkg.ePackage.getESuperPackage?.()
        return !eSuperPackage
      })
      console.log('[ModelRegistry] Root packages:', rootPackages.length)

      const rawNodes = rootPackages.map(pkg => packageToTreeNode(pkg))
      // Apply view filtering to hide types
      const isTypeHidden = _viewsServiceRef.value?.isTypeHidden ?? (() => false)
      return filterModelTreeNodes(rawNodes, isTypeHidden)
    } catch (e) {
      console.error('[ModelRegistry] Error computing treeNodes:', e)
      return []
    }
  })

  /**
   * Check if a node subtree contains at least one visible class
   */
  function hasVisibleClass(node: ModelTreeNode, isTypeHidden: (eClass: EClass) => boolean): boolean {
    if (node.type === 'class' && node.data?.eClass) {
      return !isTypeHidden(node.data.eClass)
    }
    if (node.children) {
      return node.children.some(child => hasVisibleClass(child, isTypeHidden))
    }
    return false
  }

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
            return null
          }
          return node
        }

        // For packages/subpackages, only keep if they contain visible classes
        if (node.type === 'package' || node.type === 'subpackage') {
          if (!node.children || !hasVisibleClass(node, isTypeHidden)) {
            return null
          }
          const filteredChildren = filterModelTreeNodes(node.children, isTypeHidden)
          if (filteredChildren.length === 0) return null
          return {
            ...node,
            children: filteredChildren,
            leaf: false
          }
        }

        // Other nodes (enums, attributes, etc.) — keep as-is
        return node
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
