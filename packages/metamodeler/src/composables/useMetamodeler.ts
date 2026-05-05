/**
 * useMetamodeler Composable
 *
 * State management for the Ecore Metamodel Editor.
 * Follows the Instance Tree pattern, treating Ecore elements (EPackage, EClass, etc.)
 * as instances of the Ecore.ecore metamodel.
 */

import { ref, computed, shallowRef, triggerRef, toRaw, type Ref } from 'tsm:vue'
import type { EObject, EPackage, EClass, EAttribute, EReference, ENamedElement, EAnnotation, EEnum, Resource } from '@emfts/core'
import {
  BasicEPackage, BasicEClass, BasicEAttribute, BasicEReference, BasicEFactory,
  BasicEEnum, BasicEEnumLiteral,
  EContentAdapter, XMIResource, URI, BasicResourceSet,
  getEcorePackage,
  type Notification
} from '@emfts/core'
import type { MetamodelerState, MetaTreeNode, OclConstraintInfo } from '../types'
import { META_ICONS, OCL_ANNOTATION_SOURCES, getClassifierIcon } from '../types'

// Icon registry reference (set externally via setIconRegistry)
let _iconRegistry: { getIconForClass: (eClass: EClass) => string } | null = null

export function setMetamodelerIconRegistry(registry: any): void {
  _iconRegistry = registry
}

// Reactive version counter for icon changes
const _iconVersion = ref(0)

export function refreshMetamodelerIcons(): void {
  _iconVersion.value++
}

function getIconForClassViaRegistry(eClass: EClass): string | null {
  if (_iconRegistry?.getIconForClass) {
    const icon = _iconRegistry.getIconForClass(eClass)
    if (icon && icon !== 'pi pi-circle') {
      return icon
    }
  }
  return null
}

// Shared resource set for creating new resources
let resourceSet: BasicResourceSet | null = null

function getResourceSet(): BasicResourceSet {
  if (!resourceSet) {
    resourceSet = new BasicResourceSet()
  }
  return resourceSet
}

/**
 * Content adapter that triggers Vue reactivity on EMF model changes
 * Listens to changes in the Ecore metamodel (EPackage, EClass, etc.)
 */
class MetamodelerContentAdapter extends EContentAdapter {
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
    console.log('[MetamodelerContentAdapter] Model changed:', notification.toString?.() || notification)
    this.onChanged()
  }
}

/**
 * Generate a unique ID for an EObject
 */
let objectIdCounter = 0
const objectIdMap = new WeakMap<EObject, string>()

function getObjectId(obj: EObject): string {
  const rawObj = toRaw(obj)
  let id = objectIdMap.get(rawObj)
  if (!id) {
    id = `meta_${++objectIdCounter}`
    objectIdMap.set(rawObj, id)
  }
  return id
}

/**
 * Imported Package Info - metadata for imported .ecore packages
 */
interface ImportedPackageInfo {
  nsURI: string
  name: string
  nsPrefix: string
  ePackage: EPackage
  sourceFile: string | null  // null for Ecore.ecore (built-in)
  isBuiltIn: boolean
}

/**
 * Create the metamodeler composable
 */
export function useMetamodeler() {
  // State - use Resource like Instance Tree does
  const resource = shallowRef<Resource | null>(null)
  const selectedElement = shallowRef<ENamedElement | null>(null)
  const dirty = ref(false)
  const filePath = ref<string | null>(null)
  const fileHandle = shallowRef<FileSystemFileHandle | null>(null)

  // Version counter to force reactivity (incremented on each change)
  const version = ref(0)

  // Expanded nodes for tree
  const expandedKeys = ref<Record<string, boolean>>({})

  // Show direct supertypes in EClass labels
  const showSuperTypes = ref(false)

  // Node cache for quick lookup
  const nodeCache = new Map<string, MetaTreeNode>()

  // Content adapter for automatic change detection
  let contentAdapter: MetamodelerContentAdapter | null = null

  // ============ Imported Packages Registry ============
  // Registry of EPackages that can be used as supertypes in the metamodel being edited
  // Pre-initialized with Ecore.ecore (the meta-metamodel)
  const importedPackages = ref<Map<string, ImportedPackageInfo>>(new Map())

  // Initialize with Ecore.ecore
  function initializeRegistry(): void {
    const ecorePkg = getEcorePackage()
    const nsURI = ecorePkg.getNsURI() || 'http://www.eclipse.org/emf/2002/Ecore'
    importedPackages.value.set(nsURI, {
      nsURI,
      name: ecorePkg.getName() || 'ecore',
      nsPrefix: ecorePkg.getNsPrefix() || 'ecore',
      ePackage: ecorePkg,
      sourceFile: null,
      isBuiltIn: true
    })
    console.log('[Metamodeler] Registry initialized with Ecore.ecore')
  }

  // Initialize on creation
  initializeRegistry()

  /**
   * Import an .ecore package into the registry
   * Used for adding supertypes from other metamodels
   */
  async function importPackage(ecoreContent: string, sourceFile: string): Promise<ImportedPackageInfo | null> {
    try {
      console.log('[Metamodeler] Importing package from:', sourceFile)

      const rs = getResourceSet()
      const uri = URI.createURI(sourceFile)
      const res = rs.createResource(uri) as XMIResource
      if (!res) {
        console.error('[Metamodeler] Failed to create resource')
        return null
      }
      await res.loadFromString(ecoreContent)

      const contents = res.getContents()
      if (contents.length === 0) {
        console.error('[Metamodeler] No contents in .ecore file')
        return null
      }

      const ePackage = contents.get(0) as EPackage
      if (!ePackage.getNsURI || !ePackage.getName) {
        console.error('[Metamodeler] Root element is not an EPackage')
        return null
      }

      const info: ImportedPackageInfo = {
        nsURI: ePackage.getNsURI() || '',
        name: ePackage.getName() || 'unnamed',
        nsPrefix: ePackage.getNsPrefix() || '',
        ePackage,
        sourceFile,
        isBuiltIn: false
      }

      importedPackages.value.set(info.nsURI, info)
      console.log('[Metamodeler] Package imported:', info.name, info.nsURI)

      return info
    } catch (error) {
      console.error('[Metamodeler] Failed to import package:', error)
      return null
    }
  }

  /**
   * Remove an imported package from the registry
   */
  function unimportPackage(nsURI: string): boolean {
    const info = importedPackages.value.get(nsURI)
    if (!info || info.isBuiltIn) {
      console.warn('[Metamodeler] Cannot remove built-in or non-existent package:', nsURI)
      return false
    }
    return importedPackages.value.delete(nsURI)
  }

  /**
   * Get all imported packages (for UI to show available supertypes)
   */
  const allImportedPackages = computed<ImportedPackageInfo[]>(() => {
    return Array.from(importedPackages.value.values())
  })

  /**
   * Get all available EClasses from imported packages (for supertype selection)
   */
  const availableSuperTypes = computed<Array<{ eClass: EClass; packageInfo: ImportedPackageInfo }>>(() => {
    const result: Array<{ eClass: EClass; packageInfo: ImportedPackageInfo }> = []

    for (const pkgInfo of importedPackages.value.values()) {
      const classifiers = pkgInfo.ePackage.getEClassifiers?.() || []
      for (const classifier of classifiers) {
        if ('isAbstract' in classifier && 'isInterface' in classifier) {
          // It's an EClass
          result.push({
            eClass: classifier as EClass,
            packageInfo: pkgInfo
          })
        }
      }
    }

    return result
  })

  /**
   * Convert imported packages to tree nodes for Model Browser
   * Shows Ecore.ecore + imported packages with their classes and datatypes
   */
  const modelTreeNodes = computed(() => {
    // Access icon version to trigger re-computation when icons change
    void _iconVersion.value
    const nodes: any[] = []

    for (const pkgInfo of importedPackages.value.values()) {
      const classChildren: any[] = []
      const dataTypeChildren: any[] = []

      // Get classifiers from package
      const classifiers = pkgInfo.ePackage.getEClassifiers?.() || []
      console.log('[Metamodeler] Package', pkgInfo.name, 'has', classifiers.length, 'classifiers')

      for (const classifier of classifiers) {
        const name = (classifier as any).getName?.() || 'Unknown'

        // Check if it's an EClass (has isAbstract/isInterface methods)
        if (typeof (classifier as any).isAbstract === 'function') {
          const eClass = classifier as EClass
          const isAbstract = eClass.isAbstract()
          const isInterface = eClass.isInterface()

          const customIcon = getIconForClassViaRegistry(eClass)
          classChildren.push({
            key: `cls:${pkgInfo.nsPrefix}:${name}`,
            label: name,
            icon: customIcon || (isInterface ? 'pi pi-circle' : (isAbstract ? 'pi pi-circle-off' : 'pi pi-file')),
            data: {
              qualifiedName: `${pkgInfo.nsPrefix}:${name}`,
              name: name,
              isAbstract,
              isInterface,
              eClass,
              packageInfo: pkgInfo
            },
            type: 'class',
            leaf: true,
            selectable: true,
            draggable: !isAbstract && !isInterface
          })
        } else if (typeof (classifier as any).getInstanceClassName === 'function') {
          // It's an EDataType (has getInstanceClassName method)
          const isEnum = typeof (classifier as any).getELiterals === 'function'
          dataTypeChildren.push({
            key: `dtype:${pkgInfo.nsPrefix}:${name}`,
            label: name,
            icon: isEnum ? 'pi pi-list' : 'pi pi-tag',
            data: {
              qualifiedName: `${pkgInfo.nsPrefix}:${name}`,
              name: name,
              isDataType: true,
              isEnum,
              classifier,
              packageInfo: pkgInfo
            },
            type: 'datatype',
            leaf: true,
            selectable: true,
            draggable: false
          })
        }
      }

      console.log('[Metamodeler] Package', pkgInfo.name, '- classes:', classChildren.length, 'datatypes:', dataTypeChildren.length)

      // Combine children: classes first, then datatypes
      const children = [...classChildren, ...dataTypeChildren]

      nodes.push({
        key: `pkg:${pkgInfo.nsURI}`,
        label: pkgInfo.name,
        icon: 'pi pi-box',
        data: pkgInfo,
        type: 'package',
        leaf: children.length === 0,
        selectable: true,
        children
      })
    }

    return nodes
  })

  /**
   * Trigger tree update
   */
  function triggerUpdate(): void {
    const newVersion = version.value + 1
    console.log('[Metamodeler] triggerUpdate called, version:', version.value, '->', newVersion)
    version.value = newVersion
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
        // Call unsetTarget to clean up recursive adapters
        contentAdapter.unsetTarget(oldRes as any)
      } catch (e) {
        console.warn('[Metamodeler] Failed to remove adapter from old resource:', e)
      }
    }

    // Add adapter to new resource
    if (res) {
      contentAdapter = new MetamodelerContentAdapter(resource, triggerUpdate)
      try {
        const adapters = (res as any).eAdapters?.()
        if (adapters) {
          adapters.push(contentAdapter)
          // IMPORTANT: Call setTarget to recursively add adapter to all contained objects
          // This is what makes EContentAdapter propagate to children (Package, Classes, etc.)
          contentAdapter.setTarget(res as any)
          console.log('[Metamodeler] Content adapter attached to resource and propagated to contents')
        } else {
          console.warn('[Metamodeler] Resource does not support eAdapters, falling back to manual updates')
        }
      } catch (e) {
        console.warn('[Metamodeler] Failed to add adapter to resource:', e)
      }
    }
  }

  // Computed: Get the root package from the resource
  const rootPackage = computed<EPackage | null>(() => {
    // Access version to create dependency
    const _ = version.value

    if (!resource.value) return null
    const contents = resource.value.getContents()
    if (contents.length === 0) return null

    // The first root object should be the EPackage
    const root = contents.get(0)
    if (root && 'getNsURI' in root && 'getEClassifiers' in root) {
      return root as EPackage
    }
    return null
  })

  // Computed tree nodes - follows Instance Tree pattern
  const treeNodes = computed<MetaTreeNode[]>(() => {
    // Access version to create dependency (triggers recompute on model changes)
    const currentVersion = version.value
    // Access icon version to trigger recompute on icon changes
    void _iconVersion.value
    console.log('[Metamodeler] treeNodes recomputing, version:', currentVersion)

    nodeCache.clear()

    if (!resource.value) return []

    // Use toRaw to bypass Vue's reactive proxy
    const rawResource = toRaw(resource.value)
    const contents = toRaw(rawResource.getContents())

    console.log('[Metamodeler] Building tree, contents:', contents.length)

    // Filter to only valid EObjects
    const validContents = Array.from(contents).filter(obj => {
      const rawObj = toRaw(obj)
      return rawObj && typeof rawObj.eClass === 'function'
    })

    return validContents.map(obj => buildTreeNode(obj as EObject))
  })

  /**
   * Build a tree node for an EObject (generic approach like Instance Tree)
   * Works with any Ecore element: EPackage, EClass, EAttribute, EReference, etc.
   */
  function buildTreeNode(obj: EObject, parent?: MetaTreeNode, containmentRef?: EReference): MetaTreeNode {
    const rawObj = toRaw(obj)
    const eClass = rawObj.eClass()
    const id = getObjectId(rawObj)

    // Determine type and icon based on EClass
    const typeName = eClass.getName() || 'EObject'
    const nodeType = getNodeType(typeName)
    const icon = getNodeIcon(rawObj, typeName)
    let label = getNodeLabel(rawObj, typeName)

    // Append direct supertypes for EClass nodes when toggle is active
    if (showSuperTypes.value && typeName === 'EClass') {
      try {
        const superTypes = typeof (rawObj as any).getESuperTypes === 'function'
          ? (rawObj as any).getESuperTypes() : []
        const names: string[] = []
        if (superTypes && (Array.isArray(superTypes) || superTypes[Symbol.iterator])) {
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

    const node: MetaTreeNode = {
      key: id,
      label,
      icon,
      type: nodeType,
      data: rawObj as ENamedElement,
      selectable: true
    }

    // Get containment references and build children
    const children: MetaTreeNode[] = []
    const containmentRefs = getContainmentReferences(eClass)

    for (const ref of containmentRefs) {
      const value = toRaw(rawObj.eGet(ref))
      if (value) {
        if (Array.isArray(value) || (value as any)[Symbol.iterator]) {
          // Multi-valued containment
          const items = Array.from(value as Iterable<any>)
          for (const child of items) {
            if (child && typeof child.eClass === 'function') {
              children.push(buildTreeNode(child, node, ref))
            }
          }
        } else if (typeof (value as any).eClass === 'function') {
          // Single-valued containment
          children.push(buildTreeNode(value as EObject, node, ref))
        }
      }
    }

    if (children.length > 0) {
      node.children = children
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
   * Map EClass name to tree node type
   */
  function getNodeType(className: string): 'package' | 'class' | 'attribute' | 'reference' | 'constraint' | 'datatype' | 'literal' | 'operation' {
    switch (className) {
      case 'EPackage': return 'package'
      case 'EClass': return 'class'
      case 'EAttribute': return 'attribute'
      case 'EReference': return 'reference'
      case 'EDataType': return 'datatype'
      case 'EEnum': return 'datatype'
      case 'EEnumLiteral': return 'literal'
      case 'EOperation': return 'operation'
      case 'EAnnotation': return 'constraint'
      default: return 'class'
    }
  }

  /**
   * Get icon for a tree node based on the EObject
   */
  function getNodeIcon(obj: EObject, className: string): string {
    switch (className) {
      case 'EPackage': return META_ICONS.package
      case 'EClass': return getIconForClassViaRegistry(obj as EClass) || getClassifierIcon(obj as EClass)
      case 'EAttribute': return META_ICONS.attribute
      case 'EReference':
        return (obj as EReference).isContainment() ? META_ICONS.containment : META_ICONS.reference
      case 'EDataType':
      case 'EEnum':
        return META_ICONS.datatype
      case 'EEnumLiteral':
        return META_ICONS.literal
      case 'EOperation':
        return META_ICONS.operation
      case 'EAnnotation':
        return META_ICONS.constraint
      default:
        return 'pi pi-file'
    }
  }

  /**
   * Get name from any EObject (handles DynamicEObject without getName())
   */
  function getEObjectName(obj: any): string | null {
    if (!obj) return null
    // Try direct getName()
    if (typeof obj.getName === 'function') {
      const n = obj.getName()
      if (n) return n
    }
    // Fallback: eGet with 'name' feature (for DynamicEObject)
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
   * Get display label for a tree node
   */
  function getNodeLabel(obj: EObject, className: string): string {
    const name = getEObjectName(obj)

    if (name) {
      // Add type information for features
      if (className === 'EAttribute' || className === 'EReference') {
        let type = '?'
        try {
          // Try specific getter first, then generic getEType(), then eGet
          let eType: any = null
          if (className === 'EAttribute') {
            eType = (obj as any).getEAttributeType?.()
          } else {
            eType = (obj as any).getEReferenceType?.()
          }
          if (!eType) {
            eType = (obj as any).getEType?.()
          }
          if (!eType) {
            // Last resort: eGet with eType feature
            const eTypeFeature = obj.eClass().getEStructuralFeature('eType')
            if (eTypeFeature) eType = obj.eGet(eTypeFeature)
          }
          type = getEObjectName(eType) || '?'
        } catch {
          // Type not set yet
        }
        return `${name}: ${type}`
      }
      if (className === 'EEnum') {
        return `${name} <<enum>>`
      }
      if (className === 'EEnumLiteral') {
        // Show literal value if available
        const eClass = obj.eClass()
        const valueFeature = eClass.getEStructuralFeature('value')
        if (valueFeature) {
          const val = obj.eGet(valueFeature)
          if (val !== undefined && val !== null) {
            return `${name} = ${val}`
          }
        }
        return name
      }
      return name
    }

    // Fallback to class name
    return `(${className})`
  }

  // Selected element info
  const selectedClass = computed<EClass | null>(() => {
    const el = selectedElement.value
    if (el && 'isAbstract' in el && 'isInterface' in el) {
      return el as EClass
    }
    return null
  })

  const selectedAttribute = computed<EAttribute | null>(() => {
    const el = selectedElement.value
    if (el && 'getEAttributeType' in el) {
      return el as EAttribute
    }
    return null
  })

  const selectedReference = computed<EReference | null>(() => {
    const el = selectedElement.value
    if (el && 'getEReferenceType' in el && 'isContainment' in el) {
      return el as EReference
    }
    return null
  })

  // ============ Resource Operations ============

  /**
   * Ensure a resource exists
   */
  function ensureResource(): Resource {
    if (!resource.value) {
      const rs = getResourceSet()
      const uri = URI.createURI('metamodel.ecore')
      const newResource = new XMIResource(uri)
      rs.getResources().push(newResource)
      newResource.setResourceSet(rs)
      resource.value = newResource
      setupAdapter(newResource, null)
    }
    return resource.value
  }

  // ============ Package Operations ============

  /**
   * Create a new empty package
   */
  function createNewPackage(name: string, nsURI: string, nsPrefix: string): EPackage {
    const oldResource = resource.value

    const pkg = new BasicEPackage(nsURI)
    pkg.setName(name)
    pkg.setNsPrefix(nsPrefix)

    // Create and set factory
    const factory = new BasicEFactory()
    factory.setEPackage(pkg)
    pkg.setEFactoryInstance(factory)

    // Create new resource and add package
    const rs = getResourceSet()
    const uri = URI.createURI('metamodel.ecore')
    const newResource = new XMIResource(uri)
    rs.getResources().push(newResource)
    newResource.setResourceSet(rs)

    // Add package to resource - use EList.add() for proper notifications
    const contents = newResource.getContents()
    if (typeof (contents as any).add === 'function') {
      (contents as any).add(pkg)
    } else {
      contents.push(pkg)
    }

    resource.value = newResource
    dirty.value = true

    // Setup content adapter for automatic change detection
    setupAdapter(newResource, oldResource)

    return pkg
  }

  /**
   * Load an existing package
   */
  function loadPackage(pkg: EPackage, path?: string): void {
    const oldResource = resource.value

    // Create resource for the package
    const rs = getResourceSet()
    const uri = URI.createURI(path || 'metamodel.ecore')
    const newResource = new XMIResource(uri)
    rs.getResources().push(newResource)
    newResource.setResourceSet(rs)

    // Add package to resource
    const contents = newResource.getContents()
    if (typeof (contents as any).add === 'function') {
      (contents as any).add(pkg)
    } else {
      contents.push(pkg)
    }

    resource.value = newResource
    filePath.value = path ?? null
    dirty.value = false
    selectedElement.value = null

    // Setup content adapter for automatic change detection
    setupAdapter(newResource, oldResource)
  }

  /**
   * Load a metamodel from an .ecore string for editing
   * This parses the XMI content and sets it as the root package
   * @param ecoreContent The XMI content to parse
   * @param sourceFile The source file path
   * @param handle Optional file handle for saving back to the same file
   */
  async function loadFromEcoreString(
    ecoreContent: string,
    sourceFile: string,
    handle?: FileSystemFileHandle
  ): Promise<{ name: string; nsURI: string } | null> {
    try {
      console.log('[Metamodeler] Loading .ecore for editing from:', sourceFile)
      const oldResource = resource.value

      const rs = getResourceSet()
      const uri = URI.createURI(sourceFile)

      // Check if resource already exists and remove it
      const existingRes = rs.getResource(uri, false)
      if (existingRes) {
        const resources = rs.getResources()
        const idx = resources.indexOf(existingRes)
        if (idx >= 0) {
          resources.splice(idx, 1)
        }
      }

      const newResource = new XMIResource(uri)
      rs.getResources().push(newResource)
      newResource.setResourceSet(rs)

      newResource.loadFromString(ecoreContent)

      const contents = newResource.getContents()
      if (contents.length === 0) {
        console.error('[Metamodeler] No contents in .ecore file')
        return null
      }

      const ePackage = contents.get(0) as EPackage
      if (!ePackage.getNsURI || !ePackage.getName) {
        console.error('[Metamodeler] Root element is not an EPackage')
        return null
      }

      const name = ePackage.getName() || 'unnamed'
      const nsURI = ePackage.getNsURI() || ''

      // Set as the current resource for editing
      resource.value = newResource
      filePath.value = sourceFile
      fileHandle.value = handle ?? null
      dirty.value = false
      selectedElement.value = null
      expandedKeys.value = {}

      // Setup content adapter for automatic change detection
      setupAdapter(newResource, oldResource)

      console.log('[Metamodeler] Metamodel loaded for editing:', name, nsURI)
      triggerUpdate()

      return { name, nsURI }
    } catch (error) {
      console.error('[Metamodeler] Failed to load .ecore file:', error)
      return null
    }
  }

  /**
   * Save the current metamodel to an .ecore XMI string
   */
  async function saveToEcoreString(options?: Map<string, any>): Promise<string | null> {
    if (!resource.value) {
      console.error('[Metamodeler] No resource to save')
      return null
    }

    try {
      const xmiResource = resource.value as XMIResource
      if (typeof xmiResource.saveToString === 'function') {
        const content = await xmiResource.saveToString(options)
        dirty.value = false
        console.log('[Metamodeler] Metamodel saved to string')
        return content
      } else {
        console.error('[Metamodeler] Resource does not support saveToString')
        return null
      }
    } catch (error) {
      console.error('[Metamodeler] Failed to save metamodel:', error)
      return null
    }
  }

  /**
   * Check if File System Access API is available
   */
  function isFileSystemAccessSupported(): boolean {
    return typeof (window as any).showSaveFilePicker === 'function'
  }

  /**
   * Prompt user to pick a save location
   */
  async function promptSaveFilePicker(suggestedName: string): Promise<FileSystemFileHandle | null> {
    if (!isFileSystemAccessSupported()) {
      console.error('[Metamodeler] File System Access API not supported')
      return null
    }

    const picker = (window as any).showSaveFilePicker
    return await picker({
      suggestedName: `${suggestedName}.ecore`,
      types: [{
        description: 'Ecore Files',
        accept: { 'application/xml': ['.ecore'] }
      }]
    })
  }

  /**
   * Save the current metamodel to a file
   * Uses the stored file handle if available, otherwise prompts for Save As
   */
  async function saveToFile(): Promise<boolean> {
    const content = await saveToEcoreString()
    if (!content) {
      return false
    }

    try {
      let handle = fileHandle.value

      // If no handle, prompt for Save As
      if (!handle) {
        const suggestedName = rootPackage.value?.getName() || 'metamodel'
        handle = await promptSaveFilePicker(suggestedName)
        if (!handle) {
          return false
        }
        fileHandle.value = handle
        filePath.value = handle.name
      }

      // Write to file
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()

      dirty.value = false
      console.log('[Metamodeler] Metamodel saved to file:', handle.name)
      return true
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // User cancelled Save As dialog
        return false
      }
      console.error('[Metamodeler] Failed to save to file:', error)
      return false
    }
  }

  /**
   * Save As - always prompts for a new file location
   */
  async function saveAsFile(): Promise<boolean> {
    const content = await saveToEcoreString()
    if (!content) {
      return false
    }

    try {
      const suggestedName = rootPackage.value?.getName() || 'metamodel'
      const handle = await promptSaveFilePicker(suggestedName)

      if (!handle) {
        return false
      }

      // Write to file
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()

      // Update state with new file
      fileHandle.value = handle
      filePath.value = handle.name
      dirty.value = false

      console.log('[Metamodeler] Metamodel saved as:', handle.name)
      return true
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // User cancelled
        return false
      }
      console.error('[Metamodeler] Failed to save as file:', error)
      return false
    }
  }

  /**
   * Add a root object to the current resource
   * Creates a new resource if none exists
   */
  function addRootObject(obj: EObject): void {
    console.log('[Metamodeler] addRootObject:', obj)

    // If no resource exists, create one
    if (!resource.value) {
      const rs = getResourceSet()
      const uri = URI.createURI('metamodel.ecore')
      const newResource = new XMIResource(uri)
      rs.getResources().push(newResource)
      newResource.setResourceSet(rs)
      resource.value = newResource
      setupAdapter(newResource, null)
    }

    // Add to resource contents
    const contents = resource.value.getContents()
    if (typeof (contents as any).add === 'function') {
      (contents as any).add(obj)
    } else {
      contents.push(obj)
    }

    dirty.value = true
    triggerUpdate()
    console.log('[Metamodeler] Root object added, contents now:', contents.length)
  }

  // ============ Generic Child Creation (Instance Tree Pattern) ============

  /**
   * Create a child object using the Ecore factory
   * This is the generic approach following Instance Tree pattern
   */
  function createChild(parent: EObject, containmentRef: EReference, eClass: EClass): EObject | null {
    const rawParent = toRaw(parent)
    const eClassName = eClass.getName() || ''

    console.log('[Metamodeler] createChild:', eClassName, 'in', containmentRef.getName())

    // Special case: EEnumLiteral - open dialog instead of creating directly
    if (eClassName === 'EEnumLiteral' && typeof (rawParent as any).getELiterals === 'function') {
      const eEnum = rawParent as unknown as EEnum
      requestAddLiteral(eEnum)
      return null
    }

    // Get factory from Ecore package
    const ecorePkg = getEcorePackage()
    const factory = ecorePkg.getEFactoryInstance()
    const newObj = factory.create(eClass)

    // Auto-set name for named elements
    try {
      const nameFeature = eClass.getEStructuralFeature('name')
      if (nameFeature && !newObj.eGet(nameFeature)) {
        const baseName = eClassName.replace(/^E/, '').toLowerCase()
        newObj.eSet(nameFeature, `new${eClassName}`)
      }
    } catch { /* ignore */ }

    console.log('[Metamodeler] Created new instance:', newObj)

    // Add to parent using EList
    const value = toRaw(rawParent.eGet(containmentRef))
    if (value && typeof (value as any).add === 'function') {
      (value as any).add(newObj)
      console.log('[Metamodeler] Added to EList')
    } else if (Array.isArray(value)) {
      value.push(newObj)
      console.log('[Metamodeler] Fallback to array.push()')
    } else {
      rawParent.eSet(containmentRef, newObj)
    }

    // Fallback: manually trigger if notifications don't fire
    triggerUpdate()
    dirty.value = true

    return newObj
  }

  /**
   * Add a subpackage to an existing package
   */
  function addSubpackage(parentPkg: EPackage, name: string, nsURI: string, nsPrefix: string): EPackage {
    const subPkg = new BasicEPackage(nsURI)
    subPkg.setName(name)
    subPkg.setNsPrefix(nsPrefix)

    // Create and set factory
    const factory = new BasicEFactory()
    factory.setEPackage(subPkg)
    subPkg.setEFactoryInstance(factory)

    // Add to parent package's eSubpackages
    const subPackages = parentPkg.getESubpackages()
    if (typeof (subPackages as any).add === 'function') {
      (subPackages as any).add(subPkg)
    } else {
      subPackages.push(subPkg)
    }

    console.log('[Metamodeler] addSubpackage:', name, 'to parent:', parentPkg.getName())

    dirty.value = true
    triggerUpdate()
    return subPkg
  }

  // ============ Class Operations ============

  /**
   * Add a new EClass to a package
   */
  function addClass(pkg: EPackage, name: string, options?: {
    isAbstract?: boolean
    isInterface?: boolean
  }): EClass {
    const eClass = new BasicEClass()
    eClass.setName(name)
    eClass.setAbstract(options?.isAbstract ?? false)
    eClass.setInterface(options?.isInterface ?? false)

    console.log('[Metamodeler] addClass:', name, 'to package:', pkg.getName())

    // Add to package
    const classifiers = pkg.getEClassifiers()
    console.log('[Metamodeler] classifiers before add:', classifiers.length)
    classifiers.add(eClass)
    console.log('[Metamodeler] classifiers after add:', classifiers.length)

    dirty.value = true

    // Pragmatic approach: manually trigger Vue reactivity after mutation
    // (like model-ui does, instead of relying on EMF notifications)
    triggerUpdate()

    return eClass
  }

  /**
   * Update EClass properties
   */
  function updateClass(eClass: EClass, updates: {
    name?: string
    isAbstract?: boolean
    isInterface?: boolean
  }): void {
    if (updates.name !== undefined) {
      eClass.setName(updates.name)
    }
    if (updates.isAbstract !== undefined) {
      eClass.setAbstract(updates.isAbstract)
    }
    if (updates.isInterface !== undefined) {
      eClass.setInterface(updates.isInterface)
    }
    dirty.value = true
    triggerUpdate()
  }

  /**
   * Add a super type to an EClass
   */
  function addSuperType(eClass: EClass, superType: EClass): void {
    if (eClass instanceof BasicEClass) {
      eClass.addSuperType(superType)
      dirty.value = true
    }
  }

  /**
   * Remove a super type from an EClass
   */
  function removeSuperType(eClass: EClass, superType: EClass): void {
    const superTypes = eClass.getESuperTypes()
    const idx = superTypes.indexOf(superType)
    if (idx >= 0) {
      superTypes.splice(idx, 1)
      dirty.value = true
    }
  }

  // ============ Attribute Operations ============

  /**
   * Add a new EAttribute to a class
   */
  function addAttribute(eClass: EClass, name: string, typeName: string, options?: {
    lowerBound?: number
    upperBound?: number
    isDerived?: boolean
  }): EAttribute {
    const attr = new BasicEAttribute()
    attr.setName(name)
    attr.setLowerBound(options?.lowerBound ?? 0)
    attr.setUpperBound(options?.upperBound ?? 1)
    attr.setDerived(options?.isDerived ?? false)

    // Add to class
    if (eClass instanceof BasicEClass) {
      eClass.addFeature(attr)
    }

    dirty.value = true
    triggerUpdate()
    return attr
  }

  /**
   * Update EAttribute properties
   */
  function updateAttribute(attr: EAttribute, updates: {
    name?: string
    lowerBound?: number
    upperBound?: number
  }): void {
    if (updates.name !== undefined) {
      attr.setName(updates.name)
    }
    if (updates.lowerBound !== undefined) {
      attr.setLowerBound(updates.lowerBound)
    }
    if (updates.upperBound !== undefined) {
      attr.setUpperBound(updates.upperBound)
    }
    dirty.value = true
    triggerUpdate()
  }

  // ============ Reference Operations ============

  /**
   * Add a new EReference to a class
   */
  function addReference(eClass: EClass, name: string, options?: {
    lowerBound?: number
    upperBound?: number
    isContainment?: boolean
  }): EReference {
    const ref = new BasicEReference()
    ref.setName(name)
    ref.setLowerBound(options?.lowerBound ?? 0)
    ref.setUpperBound(options?.upperBound ?? 1)
    ref.setContainment(options?.isContainment ?? false)

    // Add to class
    if (eClass instanceof BasicEClass) {
      eClass.addFeature(ref)
    }

    dirty.value = true
    triggerUpdate()
    return ref
  }

  /**
   * Update EReference properties
   */
  function updateReference(ref: EReference, updates: {
    name?: string
    lowerBound?: number
    upperBound?: number
    isContainment?: boolean
  }): void {
    if (updates.name !== undefined) {
      ref.setName(updates.name)
    }
    if (updates.lowerBound !== undefined) {
      ref.setLowerBound(updates.lowerBound)
    }
    if (updates.upperBound !== undefined) {
      ref.setUpperBound(updates.upperBound)
    }
    if (updates.isContainment !== undefined) {
      ref.setContainment(updates.isContainment)
    }
    dirty.value = true
    triggerUpdate()
  }

  // ============ Enum Literal Operations ============

  /**
   * Pending literal dialog state - set by requestAddLiteral, watched by MetamodelerTree
   */
  const pendingLiteralDialog = shallowRef<{ eEnum: EEnum } | null>(null)

  /**
   * Request to open the "New Enum Literal" dialog for a given EEnum.
   * Used by both the context menu and the Properties Panel "Add" button.
   */
  function requestAddLiteral(eEnum: EEnum): void {
    pendingLiteralDialog.value = { eEnum }
  }

  /**
   * Clear the pending literal dialog state (called after dialog closes)
   */
  function clearPendingLiteralDialog(): void {
    pendingLiteralDialog.value = null
  }

  /**
   * Add an EEnumLiteral to an EEnum
   */
  function addEnumLiteral(eEnum: EEnum, name: string, value: number): BasicEEnumLiteral {
    const rawEnum = toRaw(eEnum)
    const literal = new BasicEEnumLiteral()
    literal.setName(name)
    literal.setValue(value)
    literal.setLiteral(name)

    if (rawEnum instanceof BasicEEnum) {
      rawEnum.addLiteral(literal)
    } else if (typeof (rawEnum as any).getELiterals === 'function') {
      // Native EEnum interface
      const literals = (rawEnum as any).getELiterals()
      if (typeof literals.add === 'function') {
        literals.add(literal)
      } else {
        literals.push(literal)
      }
    } else {
      // DynamicEObject fallback: use eGet with eLiterals feature
      const eClass = (rawEnum as any).eClass()
      const eLiteralsFeature = eClass.getEStructuralFeature('eLiterals')
      if (eLiteralsFeature) {
        const literals = (rawEnum as any).eGet(eLiteralsFeature)
        if (literals && typeof literals.add === 'function') {
          literals.add(literal)
        } else if (Array.isArray(literals)) {
          literals.push(literal)
        }
      }
    }

    console.log('[Metamodeler] addEnumLiteral:', name, '=', value, 'to enum:', (rawEnum as any).getName?.())

    dirty.value = true
    triggerUpdate()
    return literal
  }

  // ============ OCL Constraint Operations ============

  /**
   * Add an OCL constraint to a class
   */
  function addOclConstraint(eClass: EClass, name: string, expression: string): EAnnotation | null {
    let annotation = eClass.getEAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL)

    if (!annotation) {
      // Create a simple EAnnotation object that implements the interface
      annotation = createSimpleAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL)
      // Add to the class's annotations
      eClass.getEAnnotations().push(annotation)
    }

    const details = annotation.getDetails()
    details.set(name, expression)

    dirty.value = true
    triggerUpdate()
    return annotation
  }

  /**
   * Create a minimal EAnnotation implementation with proper EMF-compatible details
   */
  function createSimpleAnnotation(source: string): EAnnotation {
    const details = new Map<string, string>()
    const detailEntries: any[] = [] // EStringToStringMapEntry-like EObjects
    let modelElement: any = null

    const mapEntryClass = getEcorePackage().getEClassifier('EStringToStringMapEntry') as EClass
    const annotationClass = getEcorePackage().getEClassifier('EAnnotation') as EClass

    // Create an EStringToStringMapEntry-like EObject for the tree
    function createMapEntry(key: string, value: string): any {
      // eSettings Map for DynamicEObject compatibility (PropertiesPanel reads this directly)
      const eSettings = new Map<string, any>([['key', key], ['value', value]])

      const entry: any = {
        eSettings,
        _key: key,
        _value: value,
        eClass: () => mapEntryClass,
        eGet: (feature: any) => {
          const fname = typeof feature?.getName === 'function' ? feature.getName() : ''
          if (fname === 'key') return eSettings.get('key')
          if (fname === 'value') return eSettings.get('value')
          return null
        },
        eSet: (feature: any, val: any) => {
          const fname = typeof feature?.getName === 'function' ? feature.getName() : ''
          if (fname === 'key') {
            const oldKey = eSettings.get('key')
            eSettings.set('key', val)
            entry._key = val
            // Update the parent details Map: remove old key, set new key
            const currentValue = eSettings.get('value')
            if (oldKey !== val) {
              origDelete(oldKey)
              origSet(val, currentValue)
            }
          }
          if (fname === 'value') {
            eSettings.set('value', val)
            entry._value = val
            origSet(eSettings.get('key'), val)
          }
        },
        eIsSet: (feature: any) => {
          const fname = typeof feature?.getName === 'function' ? feature.getName() : ''
          return eSettings.has(fname)
        },
        eUnset: () => {},
        eContainer: () => annotation,
        eContainingFeature: () => null,
        eResource: () => null,
        eAllContents: () => [],
        eContents: () => [],
        eCrossReferences: () => [],
        eIsProxy: () => false,
        getName: () => eSettings.get('key'),
      }
      return entry
    }

    // Wrap the details Map to sync with detailEntries
    const origSet = details.set.bind(details)
    const origDelete = details.delete.bind(details)
    details.set = (key: string, value: string) => {
      origSet(key, value)
      // Sync entries array
      const existing = detailEntries.find(e => e._key === key)
      if (existing) {
        existing._value = value
      } else {
        detailEntries.push(createMapEntry(key, value))
      }
      return details
    }
    details.delete = (key: string) => {
      const result = origDelete(key)
      const idx = detailEntries.findIndex(e => e._key === key)
      if (idx >= 0) detailEntries.splice(idx, 1)
      return result
    }

    const annotation: any = {
      getSource: () => source,
      setSource: () => {},
      getDetails: () => details,
      getEModelElement: () => modelElement,
      setEModelElement: (v: any) => { modelElement = v },
      getContents: () => [],
      getReferences: () => [],
      // EModelElement
      getEAnnotations: () => [],
      getEAnnotation: () => null,
      // EObject basics
      eClass: () => annotationClass,
      eGet: (feature: any) => {
        const fname = typeof feature?.getName === 'function' ? feature.getName() : ''
        if (fname === 'source') return source
        if (fname === 'details') return detailEntries
        if (fname === 'eAnnotations') return []
        return null
      },
      eSet: () => {},
      eIsSet: () => false,
      eUnset: () => {},
      eContainer: () => null,
      eContainingFeature: () => null,
      eResource: () => null,
      eAllContents: () => detailEntries,
      eContents: () => detailEntries,
      eCrossReferences: () => [],
      eIsProxy: () => false,
      // For tree label
      getName: () => source,
    }
    return annotation as EAnnotation
  }

  /**
   * Update an OCL constraint
   */
  function updateOclConstraint(eClass: EClass, oldName: string, newName: string, expression: string): void {
    const annotation = eClass.getEAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL)
    if (!annotation) return

    const details = annotation.getDetails()

    if (oldName !== newName) {
      details.delete(oldName)
    }
    details.set(newName, expression)

    dirty.value = true
    triggerUpdate()
  }

  /**
   * Remove an OCL constraint
   */
  function removeOclConstraint(eClass: EClass, name: string): void {
    const annotation = eClass.getEAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL)
    if (!annotation) return

    const details = annotation.getDetails()
    details.delete(name)

    dirty.value = true
    triggerUpdate()
  }

  /**
   * Get all OCL constraints for a class
   */
  function getOclConstraints(eClass: EClass): OclConstraintInfo[] {
    const constraints: OclConstraintInfo[] = []
    const annotation = eClass.getEAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL)

    if (annotation) {
      const details = annotation.getDetails()
      for (const [name, expression] of details) {
        if (!['body', 'derivation', 'documentation', '_body'].includes(name)) {
          constraints.push({
            name,
            expression,
            contextClassName: eClass.getName() || '',
            annotation
          })
        }
      }
    }

    return constraints
  }

  // ============ Delete Operations ============

  /**
   * Delete an element (class, attribute, reference, constraint)
   */
  function deleteElement(element: ENamedElement): void {
    // Handle class deletion
    if ('isAbstract' in element && 'isInterface' in element) {
      const eClass = element as EClass
      const pkg = eClass.getEPackage()
      if (pkg) {
        const classifiers = pkg.getEClassifiers()
        // Use EList.remove()
        if (typeof (classifiers as any).remove === 'function') {
          (classifiers as any).remove(eClass)
        } else if (typeof (classifiers as any).removeAt === 'function') {
          const idx = classifiers.indexOf(eClass)
          if (idx >= 0) {
            (classifiers as any).removeAt(idx)
          }
        }
      }
    }
    // Handle attribute/reference deletion
    else if ('getEContainingClass' in element) {
      const feature = element as EAttribute | EReference
      const containingClass = feature.getEContainingClass()
      if (containingClass) {
        const features = containingClass.getEStructuralFeatures()
        // Use EList.remove()
        if (typeof (features as any).remove === 'function') {
          (features as any).remove(feature)
        } else if (typeof (features as any).removeAt === 'function') {
          const idx = features.indexOf(feature)
          if (idx >= 0) {
            (features as any).removeAt(idx)
          }
        }
      }
    }
    // Handle enum literal deletion
    else if ('getEEnum' in element && typeof (element as any).getEEnum === 'function') {
      const rawLiteral = toRaw(element) as any
      const eEnum = rawLiteral.getEEnum?.()
      if (eEnum) {
        const literals = typeof eEnum.getELiterals === 'function'
          ? eEnum.getELiterals()
          : null
        if (literals) {
          const idx = literals.findIndex((l: any) => toRaw(l) === rawLiteral)
          if (idx >= 0) {
            literals.splice(idx, 1)
          }
        }
      }
    }
    // Handle annotation deletion
    else if ('getSource' in element && typeof (element as any).getSource === 'function') {
      const annotation = element as EAnnotation
      // Find the parent class that contains this annotation by iterating resource contents
      if (resource.value) {
        const contents = toRaw(resource.value).getContents()
        for (const obj of contents) {
          const rawObj = toRaw(obj)
          // Check if it's a package with classifiers
          if (rawObj && typeof (rawObj as any).getEClassifiers === 'function') {
            const classifiers = (rawObj as any).getEClassifiers()
            const size = typeof classifiers.size === 'function' ? classifiers.size() : classifiers.length
            for (let i = 0; i < size; i++) {
              const classifier = typeof classifiers.get === 'function' ? classifiers.get(i) : classifiers[i]
              if (classifier && typeof classifier.getEAnnotations === 'function') {
                const annotations = classifier.getEAnnotations() as any[]
                const rawAnnotation = toRaw(annotation)
                const idx = annotations.findIndex(a => toRaw(a) === rawAnnotation)
                if (idx >= 0) {
                  annotations.splice(idx, 1)
                  break
                }
              }
            }
          }
        }
      }
    }

    if (selectedElement.value === element) {
      selectedElement.value = null
    }

    dirty.value = true
    triggerUpdate()
  }

  // ============ Selection ============

  function selectElement(element: ENamedElement | null): void {
    selectedElement.value = element
  }

  /**
   * Get available containment references for the selected element
   */
  function getAvailableContainmentRefs(): EReference[] {
    if (!selectedElement.value) return []
    const obj = selectedElement.value as unknown as EObject
    if (typeof obj.eClass !== 'function') return []
    return getContainmentReferences(obj.eClass())
  }

  /**
   * Get valid child classes for a containment reference
   */
  function getValidChildClasses(ref: EReference): EClass[] {
    const refType = ref.getEType() as EClass
    if (!refType) return []

    const ecorePkg = getEcorePackage()
    const result: EClass[] = []

    // For Ecore elements, return concrete subclasses
    const typeName = refType.getName()

    // EClassifier can be EClass, EDataType, EEnum
    if (typeName === 'EClassifier') {
      result.push(ecorePkg.getEClassClass())
      result.push(ecorePkg.getEDataTypeClass())
      result.push(ecorePkg.getEEnumClass())
    }
    // EStructuralFeature can be EAttribute or EReference
    else if (typeName === 'EStructuralFeature') {
      result.push(ecorePkg.getEAttributeClass())
      result.push(ecorePkg.getEReferenceClass())
    }
    // For concrete types, return the type itself
    else if (!refType.isAbstract() && !refType.isInterface()) {
      result.push(refType)
    }

    return result
  }

  // ============ State Management ============

  function markClean(): void {
    dirty.value = false
  }

  function reset(): void {
    resource.value = null
    selectedElement.value = null
    dirty.value = false
    filePath.value = null
    fileHandle.value = null
    expandedKeys.value = {}
    nodeCache.clear()
  }

  return {
    // State
    resource,
    rootPackage,
    selectedElement,
    dirty,
    filePath,
    fileHandle,
    expandedKeys,
    showSuperTypes,

    // Computed
    treeNodes,
    selectedClass,
    selectedAttribute,
    selectedReference,

    // Imported Packages Registry (for supertypes from other .ecore files)
    importedPackages,
    allImportedPackages,
    availableSuperTypes,
    modelTreeNodes, // Tree nodes for Model Browser showing imported packages
    importPackage,
    unimportPackage,

    // Package operations
    createNewPackage,
    addSubpackage,
    loadPackage,
    loadFromEcoreString,
    saveToEcoreString,
    saveToFile,
    saveAsFile,
    addRootObject,

    // Generic child creation (Instance Tree pattern)
    createChild,
    getAvailableContainmentRefs,
    getValidChildClasses,

    // Class operations
    addClass,
    updateClass,
    addSuperType,
    removeSuperType,

    // Attribute operations
    addAttribute,
    updateAttribute,

    // Reference operations
    addReference,
    updateReference,

    // Enum literal operations
    addEnumLiteral,
    pendingLiteralDialog,
    requestAddLiteral,
    clearPendingLiteralDialog,

    // OCL operations
    addOclConstraint,
    updateOclConstraint,
    removeOclConstraint,
    getOclConstraints,

    // Delete
    deleteElement,

    // Selection
    selectElement,

    // State management
    markClean,
    reset,

    // Reactivity
    triggerUpdate
  }
}

// Shared singleton instance using window global (like Instance Tree)
interface SharedState {
  instance: ReturnType<typeof useMetamodeler>
}

// Module-level singleton
let _sharedState: SharedState | null = null

function getOrCreateSharedState(): SharedState {
  if (_sharedState) {
    return _sharedState
  }

  console.log('[Metamodeler] Creating new shared state')
  _sharedState = {
    instance: useMetamodeler()
  }

  return _sharedState
}

/**
 * Get the shared metamodeler instance
 */
export function useSharedMetamodeler(): ReturnType<typeof useMetamodeler> {
  const state = getOrCreateSharedState()
  return state.instance
}
