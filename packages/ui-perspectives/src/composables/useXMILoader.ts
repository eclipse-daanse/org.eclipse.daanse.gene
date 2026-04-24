/**
 * XMI Loader Composable
 *
 * Handles loading and parsing of XMI files using EMFTs.
 */

import {
  BasicResourceSet,
  XMIResource,
  URI,
  EPackageRegistry,
  type Resource,
  type EObject
} from '@emfts/core'
import { StoragePackage } from 'storage-model'

// Singleton ResourceSet
let resourceSet: BasicResourceSet | null = null

/**
 * Initialize the ResourceSet with required packages
 */
function getResourceSet(): BasicResourceSet {
  if (!resourceSet) {
    resourceSet = new BasicResourceSet()

    // Register StoragePackage
    const registry = resourceSet.getPackageRegistry()
    registry.set(StoragePackage.eNS_URI, StoragePackage.eINSTANCE)

    // Also register in global registry as fallback
    EPackageRegistry.INSTANCE.set(StoragePackage.eNS_URI, StoragePackage.eINSTANCE)

    console.log('ResourceSet initialized with StoragePackage:', StoragePackage.eNS_URI)
  }
  return resourceSet
}

/**
 * Load XMI content from a string
 */
export async function loadXMI(xmiContent: string, filePath: string): Promise<Resource> {
  const rs = getResourceSet()

  // Create URI from file path
  const uri = URI.createURI(filePath)

  // Create or get resource
  let resource = rs.getResource(uri, false)
  if (!resource) {
    resource = new XMIResource(uri)
    rs.getResources().push(resource)
    resource.setResourceSet(rs)
  }

  // Load XMI content
  await resource.loadFromString(xmiContent)

  console.log('Loaded XMI resource:', filePath)
  console.log('Contents:', resource.getContents().length, 'root objects')

  return resource
}

/**
 * Get the root objects from a resource
 */
export function getRootObjects(resource: Resource): EObject[] {
  const contents = resource.getContents()
  return typeof (contents as any).toArray === 'function'
    ? (contents as any).toArray()
    : Array.from(contents)
}

/**
 * Create a new empty resource
 */
export function createResource(filePath: string): Resource {
  const rs = getResourceSet()
  const uri = URI.createURI(filePath)
  const resource = new XMIResource(uri)
  rs.getResources().push(resource)
  resource.setResourceSet(rs)
  return resource
}

/**
 * Save a resource to XMI string
 */
export async function saveToXMI(resource: Resource): Promise<string> {
  return resource.saveToString()
}

/**
 * Composable for XMI operations
 */
export function useXMILoader() {
  return {
    loadXMI,
    getRootObjects,
    createResource,
    saveToXMI,
    getResourceSet
  }
}
