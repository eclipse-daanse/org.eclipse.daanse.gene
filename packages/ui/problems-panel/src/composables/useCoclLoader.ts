/**
 * C-OCL Loader Composable
 *
 * Loads and parses Custom OCL (.c-ocl) files using emfts XMIResource.
 * C-OCL files contain project-specific OCL constraints that can
 * extend or override Ecore-embedded OCL.
 */

import {
  XMIResource,
  URI,
  BasicResourceSet,
  EPackageRegistry,
  getEcorePackage,
  type EObject,
  type EPackage,
  type ResourceSet
} from '@emfts/core'

/**
 * Severity levels for OCL constraints
 */
export type CoclSeverity = 'TRACE' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'

/**
 * Role/purpose of an OCL expression
 */
export type CoclRole = 'VALIDATION' | 'DERIVED' | 'REFERENCE_FILTER'

/**
 * Parsed OCL Constraint
 */
export interface CoclConstraint {
  /** Unique name of the constraint */
  name: string
  /** Human-readable description */
  description?: string
  /** The OCL expression */
  expression: string
  /** Severity level when constraint fails */
  severity: CoclSeverity
  /** Role/purpose of this OCL expression */
  role: CoclRole
  /** Fully qualified class name (e.g., "package.ClassName") */
  contextClass: string
  /** Optional feature name for DERIVED and REFERENCE_FILTER */
  featureName?: string
  /** Whether this constraint is active */
  active: boolean
  /** Whether this overrides a same-named constraint from lower priority source */
  overrides: boolean
  /** Optional URIs of specific target objects */
  targetURIs: string[]
  /** Source file path */
  sourceFile?: string
}

/**
 * Parsed OCL Constraint Set (represents a .c-ocl file)
 */
export interface CoclConstraintSet {
  /** Name of the constraint set */
  name: string
  /** Version string */
  version: string
  /** Optional description */
  description?: string
  /** List of constraints */
  constraints: CoclConstraint[]
  /** Target model namespace URIs */
  targetModelNsURIs: string[]
  /** Source file path */
  sourceFile?: string
}

// C-OCL metamodel namespace URI
const COCL_NS_URI = 'http://www.gme.org/cocl/1.0'

// Embedded C-OCL Ecore metamodel
const COCL_ECORE_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="cocl" nsURI="http://www.gme.org/cocl/1.0" nsPrefix="cocl">

  <eClassifiers xsi:type="ecore:EEnum" name="Severity">
    <eLiterals name="TRACE" value="0"/>
    <eLiterals name="INFO" value="1"/>
    <eLiterals name="WARN" value="2"/>
    <eLiterals name="ERROR" value="3"/>
    <eLiterals name="FATAL" value="4"/>
  </eClassifiers>

  <eClassifiers xsi:type="ecore:EEnum" name="OclRole">
    <eLiterals name="VALIDATION" value="0"/>
    <eLiterals name="DERIVED" value="1"/>
    <eLiterals name="REFERENCE_FILTER" value="2"/>
  </eClassifiers>

  <eClassifiers xsi:type="ecore:EClass" name="OclConstraint">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="description"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="expression" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="severity" lowerBound="1"
        eType="#//Severity" defaultValueLiteral="ERROR"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="role" lowerBound="1"
        eType="#//OclRole" defaultValueLiteral="VALIDATION"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="contextClass" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="featureName"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="active" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean"
        defaultValueLiteral="true"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="overrides"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean"
        defaultValueLiteral="false"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="targetURIs" upperBound="-1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>

  <eClassifiers xsi:type="ecore:EClass" name="OclConstraintSet">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="version"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"
        defaultValueLiteral="1.0"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="description"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="constraints" upperBound="-1"
        eType="#//OclConstraint" containment="true"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="targetModelNsURIs" upperBound="-1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>

</ecore:EPackage>`

// Cache of loaded constraint sets
const loadedConstraintSets: Map<string, CoclConstraintSet> = new Map()

// Singleton ResourceSet for C-OCL loading
let coclResourceSet: ResourceSet | null = null
let coclPackage: EPackage | null = null
let initPromise: Promise<boolean> | null = null

/**
 * Initialize the C-OCL metamodel
 */
async function initializeCoclMetamodel(): Promise<boolean> {
  if (coclPackage) {
    return true
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    try {
      console.log('[CoclLoader] Initializing C-OCL metamodel...')

      // Create ResourceSet with Ecore package
      coclResourceSet = new BasicResourceSet()
      const ecorePkg = getEcorePackage()
      coclResourceSet.getPackageRegistry().set(ecorePkg.getNsURI(), ecorePkg)

      // Load C-OCL metamodel
      const ecoreUri = URI.createURI('cocl.ecore')
      const ecoreResource = new XMIResource(ecoreUri)
      coclResourceSet.getResources().push(ecoreResource)
      ecoreResource.setResourceSet(coclResourceSet)

      await ecoreResource.loadFromString(COCL_ECORE_CONTENT)

      const contents = ecoreResource.getContents()
      if (contents.length === 0) {
        console.error('[CoclLoader] Failed to load C-OCL metamodel - no contents')
        return false
      }

      coclPackage = contents[0] as EPackage
      const nsURI = coclPackage.getNsURI()
      console.log('[CoclLoader] Loaded C-OCL package:', nsURI)

      // Register in ResourceSet and global registry
      coclResourceSet.getPackageRegistry().set(nsURI, coclPackage)
      EPackageRegistry.INSTANCE.set(nsURI, coclPackage)

      console.log('[CoclLoader] C-OCL metamodel initialized successfully')
      return true
    } catch (e) {
      console.error('[CoclLoader] Failed to initialize C-OCL metamodel:', e)
      return false
    }
  })()

  return initPromise
}

/**
 * Get string attribute from EObject
 */
function getStringAttr(obj: EObject, name: string): string | undefined {
  try {
    const eClass = obj.eClass()
    const feature = eClass.getEStructuralFeature(name)
    if (feature) {
      const value = obj.eGet(feature)
      return typeof value === 'string' ? value : undefined
    }
  } catch (e) {
    console.warn(`[CoclLoader] Failed to get attribute ${name}:`, e)
  }
  return undefined
}

/**
 * Get boolean attribute from EObject
 */
function getBooleanAttr(obj: EObject, name: string, defaultValue: boolean): boolean {
  try {
    const eClass = obj.eClass()
    const feature = eClass.getEStructuralFeature(name)
    if (feature) {
      const value = obj.eGet(feature)
      return typeof value === 'boolean' ? value : defaultValue
    }
  } catch (e) {
    console.warn(`[CoclLoader] Failed to get attribute ${name}:`, e)
  }
  return defaultValue
}

/**
 * Get enum attribute as string from EObject
 */
function getEnumAttr(obj: EObject, name: string, defaultValue: string): string {
  try {
    const eClass = obj.eClass()
    const feature = eClass.getEStructuralFeature(name)
    if (feature) {
      const value = obj.eGet(feature)
      // Enum values come as objects with name property or as strings
      if (value && typeof value === 'object' && 'name' in value) {
        return (value as any).name
      }
      if (typeof value === 'string') {
        return value
      }
      // Could be numeric enum value - convert based on known enums
      if (typeof value === 'number') {
        if (name === 'severity') {
          const severities = ['TRACE', 'INFO', 'WARN', 'ERROR', 'FATAL']
          return severities[value] || defaultValue
        }
        if (name === 'role') {
          const roles = ['VALIDATION', 'DERIVED', 'REFERENCE_FILTER']
          return roles[value] || defaultValue
        }
      }
    }
  } catch (e) {
    console.warn(`[CoclLoader] Failed to get enum attribute ${name}:`, e)
  }
  return defaultValue
}

/**
 * Get string list attribute from EObject
 */
function getStringListAttr(obj: EObject, name: string): string[] {
  try {
    const eClass = obj.eClass()
    const feature = eClass.getEStructuralFeature(name)
    if (feature) {
      const value = obj.eGet(feature)
      if (Array.isArray(value)) {
        return value.filter(v => typeof v === 'string') as string[]
      }
      // Could be an EList
      if (value && typeof (value as any).toArray === 'function') {
        return (value as any).toArray().filter((v: any) => typeof v === 'string')
      }
    }
  } catch (e) {
    console.warn(`[CoclLoader] Failed to get list attribute ${name}:`, e)
  }
  return []
}

/**
 * Parse a C-OCL file from XMI content using emfts
 */
export async function loadCoclFromString(
  xmiContent: string,
  filePath: string
): Promise<CoclConstraintSet | null> {
  console.log('[CoclLoader] Loading C-OCL from:', filePath)
  console.log('[CoclLoader] Content length:', xmiContent?.length)

  // Ensure metamodel is initialized
  const initialized = await initializeCoclMetamodel()
  if (!initialized || !coclResourceSet) {
    console.error('[CoclLoader] C-OCL metamodel not initialized')
    return null
  }

  try {
    // Create resource for the C-OCL file
    const uri = URI.createURI(filePath)
    const resource = new XMIResource(uri)
    coclResourceSet.getResources().push(resource)
    resource.setResourceSet(coclResourceSet)

    // Load from string
    await resource.loadFromString(xmiContent)

    const contents = resource.getContents()
    console.log('[CoclLoader] Resource contents count:', contents.length)

    if (contents.length === 0) {
      console.error('[CoclLoader] No contents in C-OCL file')
      return null
    }

    const rootObj = contents[0]
    const rootClass = rootObj.eClass()
    console.log('[CoclLoader] Root object class:', rootClass?.getName())

    // Extract constraint set data
    const name = getStringAttr(rootObj, 'name')
    if (!name) {
      console.error('[CoclLoader] Missing name attribute on constraint set')
      return null
    }

    const version = getStringAttr(rootObj, 'version') || '1.0'
    const description = getStringAttr(rootObj, 'description')
    const targetModelNsURIs = getStringListAttr(rootObj, 'targetModelNsURIs')

    console.log('[CoclLoader] Constraint set:', name, 'version:', version)
    console.log('[CoclLoader] Target NS URIs:', targetModelNsURIs)

    // Get constraints reference
    const constraintsFeature = rootClass.getEStructuralFeature('constraints')
    const constraintsValue = constraintsFeature ? rootObj.eGet(constraintsFeature) : null

    const constraints: CoclConstraint[] = []

    if (constraintsValue) {
      // Could be array or EList
      const constraintsList = Array.isArray(constraintsValue)
        ? constraintsValue
        : (constraintsValue as any).toArray?.() || []

      console.log('[CoclLoader] Found', constraintsList.length, 'constraints')

      for (const constraintObj of constraintsList) {
        const constraintName = getStringAttr(constraintObj, 'name')
        const expression = getStringAttr(constraintObj, 'expression')
        const contextClass = getStringAttr(constraintObj, 'contextClass')

        if (!constraintName || !expression || !contextClass) {
          console.warn('[CoclLoader] Skipping constraint - missing required attributes')
          continue
        }

        const constraint: CoclConstraint = {
          name: constraintName,
          description: getStringAttr(constraintObj, 'description'),
          expression,
          severity: getEnumAttr(constraintObj, 'severity', 'ERROR') as CoclSeverity,
          role: getEnumAttr(constraintObj, 'role', 'VALIDATION') as CoclRole,
          contextClass,
          featureName: getStringAttr(constraintObj, 'featureName'),
          active: getBooleanAttr(constraintObj, 'active', true),
          overrides: getBooleanAttr(constraintObj, 'overrides', false),
          targetURIs: getStringListAttr(constraintObj, 'targetURIs'),
          sourceFile: filePath
        }

        console.log('[CoclLoader] Parsed constraint:', constraint.name, '- role:', constraint.role)
        constraints.push(constraint)
      }
    }

    const constraintSet: CoclConstraintSet = {
      name,
      version,
      description,
      constraints,
      targetModelNsURIs,
      sourceFile: filePath
    }

    // Cache it
    loadedConstraintSets.set(filePath, constraintSet)
    console.log(`[CoclLoader] Loaded constraint set "${name}" with ${constraints.length} constraints`)

    return constraintSet
  } catch (e) {
    console.error('[CoclLoader] Error loading C-OCL file:', e)
    return null
  }
}

/**
 * Unload a C-OCL file
 */
export function unloadCocl(filePath: string): boolean {
  const removed = loadedConstraintSets.delete(filePath)
  if (removed) {
    console.log('[CoclLoader] Unloaded C-OCL file:', filePath)
  }
  return removed
}

/**
 * Get all loaded constraint sets
 */
export function getLoadedConstraintSets(): CoclConstraintSet[] {
  return Array.from(loadedConstraintSets.values())
}

/**
 * Get constraints by role
 */
export function getConstraintsByRole(role: CoclRole): CoclConstraint[] {
  const result: CoclConstraint[] = []
  for (const set of loadedConstraintSets.values()) {
    for (const constraint of set.constraints) {
      if (constraint.role === role && constraint.active) {
        result.push(constraint)
      }
    }
  }
  return result
}

/**
 * Get constraints for a specific context class
 */
export function getConstraintsForClass(
  className: string,
  role?: CoclRole
): CoclConstraint[] {
  const result: CoclConstraint[] = []
  for (const set of loadedConstraintSets.values()) {
    for (const constraint of set.constraints) {
      if (!constraint.active) continue
      if (role && constraint.role !== role) continue
      if (constraint.contextClass === className ||
          constraint.contextClass.endsWith(`.${className}`)) {
        result.push(constraint)
      }
    }
  }
  return result
}

/**
 * Get reference filter constraints for a specific class and feature
 */
export function getReferenceFilterConstraint(
  className: string,
  featureName: string
): CoclConstraint | undefined {
  for (const set of loadedConstraintSets.values()) {
    for (const constraint of set.constraints) {
      if (!constraint.active) continue
      if (constraint.role !== 'REFERENCE_FILTER') continue
      if (constraint.featureName !== featureName) continue
      if (constraint.contextClass === className ||
          constraint.contextClass.endsWith(`.${className}`)) {
        return constraint
      }
    }
  }
  return undefined
}

/**
 * Get derived attribute constraint for a specific class and feature
 */
export function getDerivedConstraint(
  className: string,
  featureName: string
): CoclConstraint | undefined {
  for (const set of loadedConstraintSets.values()) {
    for (const constraint of set.constraints) {
      if (!constraint.active) continue
      if (constraint.role !== 'DERIVED') continue
      if (constraint.featureName !== featureName) continue
      if (constraint.contextClass === className ||
          constraint.contextClass.endsWith(`.${className}`)) {
        return constraint
      }
    }
  }
  return undefined
}

/**
 * Check if a constraint set applies to a given model (by namespace URI)
 */
export function constraintSetAppliesTo(
  constraintSet: CoclConstraintSet,
  modelNsURI: string
): boolean {
  // If no target URIs specified, applies to all
  if (constraintSet.targetModelNsURIs.length === 0) {
    return true
  }
  return constraintSet.targetModelNsURIs.includes(modelNsURI)
}

/**
 * Clear all loaded constraint sets
 */
export function clearAllConstraintSets(): void {
  loadedConstraintSets.clear()
  console.log('[CoclLoader] Cleared all constraint sets')
}

/**
 * Composable for C-OCL loading
 */
export function useCoclLoader() {
  return {
    loadCoclFromString,
    unloadCocl,
    getLoadedConstraintSets,
    getConstraintsByRole,
    getConstraintsForClass,
    getReferenceFilterConstraint,
    getDerivedConstraint,
    constraintSetAppliesTo,
    clearAllConstraintSets
  }
}
