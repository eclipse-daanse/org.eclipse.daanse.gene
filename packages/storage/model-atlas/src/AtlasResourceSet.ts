/**
 * AtlasResourceSet - EMFTs-based XMI parser for Model Atlas API responses
 *
 * Initializes a ResourceSet with the three Atlas EPackages
 * (Management, WorkflowApi, Rest) and provides helper methods
 * to parse XMI response strings into typed EObject instances.
 */

import { BasicResourceSet, XMIResource, URI, EPackageRegistry } from '@emfts/core'
import type { EObject } from '@emfts/core'
import { ManagementPackage, ManagementFactory } from './generated/management'
import { WorkflowApiPackage, WorkflowApiFactory } from './generated/workflowapi'
import { RestPackage, RestFactory } from './generated/rest'
import type { ObjectMetadata, ObjectMetadataContainer } from './generated/management'
import type { Scope, ScopeListResponse } from './generated/workflowapi'

let resourceSet: BasicResourceSet | null = null
let resourceCounter = 0

/**
 * Get or create the singleton ResourceSet with Atlas packages registered
 */
function getResourceSet(): BasicResourceSet {
  if (!resourceSet) {
    resourceSet = new BasicResourceSet()
    const registry = resourceSet.getPackageRegistry()

    // Register all Atlas packages
    registry.set(ManagementPackage.eNS_URI, ManagementPackage.eINSTANCE)
    registry.set(WorkflowApiPackage.eNS_URI, WorkflowApiPackage.eINSTANCE)
    registry.set(RestPackage.eNS_URI, RestPackage.eINSTANCE)

    // Also register globally as fallback
    EPackageRegistry.INSTANCE.set(ManagementPackage.eNS_URI, ManagementPackage.eINSTANCE)
    EPackageRegistry.INSTANCE.set(WorkflowApiPackage.eNS_URI, WorkflowApiPackage.eINSTANCE)
    EPackageRegistry.INSTANCE.set(RestPackage.eNS_URI, RestPackage.eINSTANCE)
  }
  return resourceSet
}

/**
 * Parse an XMI string into EObject instances using the Atlas EPackages
 */
export function parseXMI(xmiString: string): EObject[] {
  if (!xmiString || xmiString.trim() === '') return []

  const rs = getResourceSet()
  const uri = URI.createURI(`atlas://response/${++resourceCounter}.xmi`)
  const resource = new XMIResource(uri)
  rs.getResources().push(resource)
  resource.setResourceSet(rs)

  resource.loadFromString(xmiString)

  const contents = resource.getContents()
  const result = typeof (contents as any).toArray === 'function'
    ? (contents as any).toArray()
    : Array.from(contents)

  // Remove resource from ResourceSet to avoid memory accumulation
  const idx = rs.getResources().indexOf(resource)
  if (idx >= 0) rs.getResources().splice(idx, 1)

  return result
}

/**
 * Parse a Scope XMI response (single scope from GET /scopes/{name})
 */
export function parseScopeXmi(xmiString: string): Scope | null {
  const objects = parseXMI(xmiString)
  if (objects.length === 0) return null

  const first = objects[0]

  // Check if it's a ScopeListResponse wrapper
  if ('scopes' in first) {
    const response = first as ScopeListResponse
    return response.scopes.length > 0 ? response.scopes[0] : null
  }

  return first as Scope
}

/**
 * Parse a ScopeListResponse XMI (from GET /scopes)
 */
export function parseScopeListXmi(xmiString: string): Scope[] {
  const objects = parseXMI(xmiString)
  if (objects.length === 0) return []

  const first = objects[0]
  if ('scopes' in first) {
    return (first as ScopeListResponse).scopes
  }

  // Could be direct Scope objects
  return objects as Scope[]
}

/**
 * Parse an ObjectMetadataContainer or list of ObjectMetadata from XMI
 */
export function parseMetadataListXmi(xmiString: string): ObjectMetadata[] {
  const objects = parseXMI(xmiString)
  if (objects.length === 0) return []

  const first = objects[0]
  if ('metadata' in first) {
    return (first as ObjectMetadataContainer).metadata
  }

  // Could be direct ObjectMetadata objects
  return objects as ObjectMetadata[]
}

/**
 * Parse a single ObjectMetadata from XMI
 */
export function parseMetadataXmi(xmiString: string): ObjectMetadata | null {
  const objects = parseXMI(xmiString)
  if (objects.length === 0) return null
  return objects[0] as ObjectMetadata
}

/**
 * Serialize a StageTransitionRequest as XMI for sending to the server
 */
export function serializeTransitionXmi(objectId: string, targetStage: string): string {
  const factory = RestFactory.eINSTANCE
  const request = factory.createStageTransitionRequest()
  request.objectId = objectId
  request.targetStage = targetStage

  const rs = getResourceSet()
  const uri = URI.createURI(`atlas://request/${++resourceCounter}.xmi`)
  const resource = new XMIResource(uri)
  rs.getResources().push(resource)
  resource.setResourceSet(rs)
  resource.getContents().push(request)

  const xmi = resource.saveToString()

  // Cleanup
  const idx = rs.getResources().indexOf(resource)
  if (idx >= 0) rs.getResources().splice(idx, 1)

  return xmi
}