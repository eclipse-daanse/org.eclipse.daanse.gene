/**
 * ActionApiResourceSet — XMI parser/serializer for action-api.ecore model
 *
 * Same pattern as AtlasResourceSet: singleton ResourceSet with the
 * ActionApiPackage registered, plus helper methods for parse/serialize.
 */

import { BasicResourceSet, XMIResource, URI, EPackageRegistry } from '@emfts/core'
import type { EObject } from '@emfts/core'
import { ActionApiPackage } from './generated/actionapi/ActionApiPackage'
import { ActionApiFactory } from './generated/actionapi/ActionApiFactory'
import type { ServiceCapabilitiesImpl } from './generated/actionapi/ServiceCapabilitiesImpl'
import type { JobStatusImpl } from './generated/actionapi/JobStatusImpl'

let resourceSet: BasicResourceSet | null = null
let resourceCounter = 0

function getResourceSet(): BasicResourceSet {
  if (!resourceSet) {
    resourceSet = new BasicResourceSet()
    const pkg = ActionApiPackage.eINSTANCE
    // Wire factory to package (deferred to avoid circular init)
    if (!pkg.getEFactoryInstance()) {
      pkg.setEFactoryInstance(ActionApiFactory.eINSTANCE)
    }
    const registry = resourceSet.getPackageRegistry()
    registry.set(ActionApiPackage.eNS_URI, pkg)
    EPackageRegistry.INSTANCE.set(ActionApiPackage.eNS_URI, pkg)
  }
  return resourceSet
}

/**
 * Parse an XMI string into EObject instances using the ActionApi EPackage
 */
export function parseActionApiXmi(xmiString: string): EObject[] {
  if (!xmiString || xmiString.trim() === '') return []

  const rs = getResourceSet()
  const uri = URI.createURI(`actionapi://response/${++resourceCounter}.xmi`)
  const resource = new XMIResource(uri)
  rs.getResources().push(resource)
  resource.setResourceSet(rs)

  resource.loadFromString(xmiString)

  const contents = resource.getContents()
  const result = typeof (contents as any).toArray === 'function'
    ? (contents as any).toArray()
    : Array.from(contents)

  // Cleanup to prevent memory accumulation
  const idx = rs.getResources().indexOf(resource)
  if (idx >= 0) rs.getResources().splice(idx, 1)

  return result
}

/**
 * Parse a ServiceCapabilities XMI response
 */
export function parseCapabilitiesXmi(xmiString: string): ServiceCapabilitiesImpl | null {
  const objects = parseActionApiXmi(xmiString)
  if (objects.length === 0) return null
  return objects[0] as ServiceCapabilitiesImpl
}

/**
 * Parse a JobStatus XMI response
 */
export function parseJobStatusXmi(xmiString: string): JobStatusImpl | null {
  const objects = parseActionApiXmi(xmiString)
  if (objects.length === 0) return null
  return objects[0] as JobStatusImpl
}

/**
 * Initialize the ActionApi package (call during module activation)
 */
export function initActionApiPackage(): void {
  getResourceSet()
}
