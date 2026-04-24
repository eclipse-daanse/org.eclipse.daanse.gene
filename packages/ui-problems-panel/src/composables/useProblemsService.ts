/**
 * Problems Service Composable
 *
 * Singleton service for validation and error management.
 * Handles OCL constraint validation, XMI parser errors, and general issues.
 * Manages validator setup, constraint loading, and reactive validation results.
 * Supports validation via ocl-engine + ocl-langium.
 */

import { ref, computed, shallowRef, type Ref, type ComputedRef } from 'tsm:vue'
import type { EObject, EPackage, Resource, EClass, Notifier } from '@emfts/core'
import type {
  OclValidationIssue,
  OclServiceState,
  OclValidationStats,
  OclServiceOptions,
  IssueSeverity,
  IssueSource
} from '../types'
import { isOclAnnotationSource } from './oclUtils'

// Lazy-loaded OCL modules (ocl-engine + ocl-langium)
let oclEngine: any = null  // OclEngine instance
let oclLangium: any = null // ocl-langium module (for parsing)
let oclEvaluator: any = null // OclEvaluator instance (from ocl-langium)
let oclBridge: any = null  // OclEmfBridge (for name resolution)
let oclLoadError: Error | null = null
let oclLoadPromise: Promise<boolean> | null = null

async function loadOclModules(): Promise<boolean> {
  if (oclEngine) return true
  if (oclLoadError) return false

  if (!oclLoadPromise) {
    oclLoadPromise = (async () => {
      try {
        const [engineMod, langiumMod] = await Promise.all([
          import('@emfts/ocl.engine'),
          import('@emfts/ocl.langium')
        ])
        oclEngine = new engineMod.OclEngine({ maxDepth: 500, timeoutMs: 10000 })
        oclLangium = langiumMod
        oclEvaluator = new langiumMod.OclEvaluator()
        oclBridge = new langiumMod.OclEmfBridge()

        // Enable expression cache for parsed OCL expressions
        if (langiumMod.enableExpressionCache) {
          langiumMod.enableExpressionCache(2048)
          console.log('[OclService] Expression cache enabled (2048 entries)')
        }

        console.log('[OclService] ocl-engine + ocl-langium loaded successfully')
        return true
      } catch (err) {
        oclLoadError = err as Error
        console.warn('[OclService] Failed to load OCL modules:', err)
        return false
      }
    })()
  }

  return oclLoadPromise
}

// Parsed OCL documents (from strings via ocl-langium parser)
const parsedDocuments: Map<string, any> = new Map() // key → OclDocument
const allConstraintDocs: any[] = [] // all parsed OclDocument instances

// Derived attribute expressions: "ClassName.attrName" → OCL expression string
const derivedExpressions = new Map<string, string>()

function registerDerivedExpression(eClass: EClass, attrName: string, expression: string): void {
  const key = `${eClass.getName()}.${attrName}`
  derivedExpressions.set(key, expression)
}

async function parseOclExpression(expression: string): Promise<any | null> {
  if (!await loadOclModules()) return null
  try {
    const result = await oclLangium.parseOcl(expression)
    if (result && result.document && !result.hasErrors) {
      return result.document
    }
    if (result && result.hasErrors) {
      console.warn('[OclService] OCL parse errors:', result.errors)
    }
    // Return document even with errors if it exists (partial parse)
    return result?.document ?? null
  } catch (e) {
    console.warn('[OclService] Failed to parse OCL:', expression, e)
    return null
  }
}

function isSubtypeOf(eClass: EClass, targetClassName: string): boolean {
  if (eClass.getName() === targetClassName) return true
  const supers = (eClass as any).getEAllSuperTypes?.() || []
  return Array.from(supers).some((s: any) => s.getName?.() === targetClassName)
}

// Singleton state
const issues: Ref<OclValidationIssue[]> = ref([])
const isValidating = ref(false)
const lastValidation: Ref<Date | null> = ref(null)
const constraintCount = ref(0)
const packageCount = ref(0)
const registeredPackages: EPackage[] = []

// Track attached targets for live validation
const attachedTargets: Set<Notifier | Resource> = new Set()

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Module-level event bus reference (set via setEventBus or lazily from TSM)
let _eventBus: any = null

/**
 * Set the event bus instance (called from activate or externally).
 */
export function setEventBus(bus: any): void {
  _eventBus = bus
}

/**
 * Emit show-problems event when issues transition from 0 to >0
 */
function getOrCreateEventBus() {
  if (_eventBus) return _eventBus
  // Lazy fallback: create a local event bus
  const listeners = new Map<string, Set<Function>>()
  _eventBus = {
    on(event: string, callback: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(callback)
    },
    off(event: string, callback: Function) {
      listeners.get(event)?.delete(callback)
    },
    emit(event: string, ...args: any[]) {
      for (const cb of listeners.get(event) || []) cb(...args)
    }
  }
  return _eventBus
}

function emitShowProblemsIfNeeded(oldCount: number, newCount: number): void {
  if (newCount > oldCount) {
    const eventBus = getOrCreateEventBus()
    eventBus.emit('show-problems')
  }
}
const defaultDebounceMs = 300

// Issue ID counter
let issueIdCounter = 0

/**
 * Generate a unique issue ID
 */
function generateIssueId(): string {
  return `ocl-issue-${++issueIdCounter}`
}

/**
 * Get a label for an EObject
 */
function getObjectLabel(obj: EObject): string {
  try {
    // Try common name attributes
    const eClass = obj.eClass()
    for (const featureName of ['name', 'id', 'label', 'title']) {
      const feature = eClass.getEStructuralFeature(featureName)
      if (feature) {
        const value = obj.eGet(feature)
        if (value && typeof value === 'string') {
          return value
        }
      }
    }
    // Fallback to class name
    return eClass.getName() || 'Unknown'
  } catch {
    return 'Unknown'
  }
}

// ConstraintResult type (used internally)
interface ConstraintResult {
  constraintName?: string
  message?: string
  valid: boolean
}

/**
 * Convert constraint result to validation issue
 */
function constraintToIssue(
  result: ConstraintResult,
  object: EObject,
  severity: IssueSeverity = 'error'
): OclValidationIssue {
  const eClass = object.eClass()
  return {
    id: generateIssueId(),
    severity,
    message: result.message || `Constraint '${result.constraintName || 'unnamed'}' failed`,
    constraintName: result.constraintName,
    object,
    objectLabel: getObjectLabel(object),
    eClassName: eClass.getName() || 'Unknown',
    timestamp: new Date()
  }
}

/**
 * Process validation result and add issues
 */
function processValidationResult(result: any): OclValidationIssue[] {
  const newIssues: OclValidationIssue[] = []

  for (const failure of result.failures) {
    newIssues.push(constraintToIssue(failure, result.object, 'error'))
  }

  return newIssues
}

/**
 * Problems Service composable
 */
export function useProblemsService(options: OclServiceOptions = {}) {
  const { debounceMs = defaultDebounceMs, recursive = true, stopOnFirstFailure = false } = options

  /**
   * Ensure OCL modules are loaded and ready
   */
  async function ensureOclReady(): Promise<boolean> {
    return loadOclModules()
  }

  // No more getValidator() or getDerivedHandler() - validation goes through
  // oclEvaluator (ocl-langium) directly, derived attributes use derivedExpressions map

  /**
   * Register an EPackage for validation
   */
  async function registerPackage(pkg: EPackage): Promise<void> {
    if (registeredPackages.includes(pkg)) {
      return
    }

    if (!await loadOclModules()) {
      console.warn('[OclService] Cannot register package - OCL not available')
      return
    }

    // Register with bridge for name resolution
    oclBridge.registerPackage(pkg)

    // Extract OCL constraints, derived attributes, and operation bodies from eAnnotations
    // Supports both new class-level format (derive_<name>, body_<name>) and legacy feature-level
    await extractAndRegisterConstraints(pkg)

    registeredPackages.push(pkg)
    packageCount.value = registeredPackages.length
    constraintCount.value = allConstraintDocs.length

    console.log(`[OclService] Registered package: ${pkg.getName()}, total constraints: ${allConstraintDocs.length}`)
  }

  /**
   * Extract OCL constraints from EAnnotations and parse them via ocl-langium
   */
  async function extractAndRegisterConstraints(pkg: EPackage): Promise<void> {
    const classifiers = pkg.getEClassifiers?.() || []

    for (const classifier of Array.from(classifiers)) {
      if (!('getEAttributes' in classifier)) continue
      const eClass = classifier as EClass
      const className = eClass.getName() || ''

      // 1. Class-level OCL annotations (supports both new and legacy format)
      const classAnnotations = getAnnotationsFromElement(eClass as any)
      for (const annotation of classAnnotations) {
        const source = getAnnotationSourceValue(annotation)
        if (isOclAnnotationSource(source)) {
          const details = getAnnotationDetailsMap(annotation)
          for (const [key, expr] of details) {
            if (key === 'documentation') continue

            // derive_<featureName> → derived attribute/reference
            if (key.startsWith('derive_')) {
              const featureName = key.substring(7)
              registerDerivedExpression(eClass, featureName, expr)
              console.log(`[OclService] Registered derived: ${className}.${featureName}`)
              continue
            }

            // body_<operationName> → operation body
            if (key.startsWith('body_')) {
              const opName = key.substring(5)
              registerDerivedExpression(eClass, `__op_${opName}`, expr)
              console.log(`[OclService] Registered operation body: ${className}.${opName}`)
              continue
            }

            // Legacy keys on class-level
            if (['body', 'derivation', '_body'].includes(key)) continue

            // Everything else is an invariant constraint
            try {
              const fullExpr = `context ${className} inv ${key}: ${expr}`
              const doc = await parseOclExpression(fullExpr)
              if (doc) {
                allConstraintDocs.push({ document: doc, contextClassName: className, name: key })
              }
            } catch (e) {
              console.warn(`[OclService] Failed to parse constraint ${key}: ${expr}`, e)
            }
          }
        }
      }

      // 2. Feature-level OCL annotations (legacy: derivation on EAttribute/EReference)
      for (const attr of Array.from(eClass.getEAttributes?.() || [])) {
        const attrAny = attr as any
        const isDerived = typeof attrAny.isDerived === 'function' ? attrAny.isDerived() : attrAny.derived
        if (!isDerived) continue
        for (const ann of getAnnotationsFromElement(attrAny)) {
          if (isOclAnnotationSource(getAnnotationSourceValue(ann))) {
            const derivation = getAnnotationDetailsMap(ann).get('derivation')
            if (derivation) {
              const name = typeof attrAny.getName === 'function' ? attrAny.getName() : attrAny.name
              registerDerivedExpression(eClass, name, derivation)
              console.log(`[OclService] Registered derived (legacy attr): ${className}.${name}`)
            }
          }
        }
      }

      for (const ref of Array.from(eClass.getEReferences?.() || [])) {
        const refAny = ref as any
        const isDerived = typeof refAny.isDerived === 'function' ? refAny.isDerived() : refAny.derived
        if (!isDerived) continue
        for (const ann of getAnnotationsFromElement(refAny)) {
          if (isOclAnnotationSource(getAnnotationSourceValue(ann))) {
            const derivation = getAnnotationDetailsMap(ann).get('derivation')
            if (derivation) {
              const name = typeof refAny.getName === 'function' ? refAny.getName() : refAny.name
              registerDerivedExpression(eClass, name, derivation)
              console.log(`[OclService] Registered derived (legacy ref): ${className}.${name}`)
            }
          }
        }
      }

      // 3. Operation bodies (legacy: body on EOperation)
      const operations = (eClass as any).getEOperations?.() || (eClass as any).getEAllOperations?.() || []
      for (const op of Array.from(operations)) {
        const opAny = op as any
        const opName = typeof opAny.getName === 'function' ? opAny.getName() : opAny.name
        if (!opName) continue
        for (const ann of getAnnotationsFromElement(opAny)) {
          if (isOclAnnotationSource(getAnnotationSourceValue(ann))) {
            const body = getAnnotationDetailsMap(ann).get('body')
            if (body) {
              registerDerivedExpression(eClass, `__op_${opName}`, body)
              console.log(`[OclService] Registered operation (legacy): ${className}.${opName}`)
            }
          }
        }
      }
    }

    const subPackages = pkg.getESubpackages?.() || []
    for (const sub of Array.from(subPackages)) {
      await extractAndRegisterConstraints(sub)
    }
  }

  /**
   * Manually register derived attributes from a package (fallback for DynamicEObjects)
   */
  function registerDerivedAttributesManually(pkg: EPackage, handler: { register: (eClass: EClass, name: string, expr: string) => void }): void {
    const classifiers = pkg.getEClassifiers?.() || []

    for (const classifier of Array.from(classifiers)) {
      // Check if it's an EClass
      if (!('getEAttributes' in classifier)) continue

      const eClass = classifier as EClass
      const attributes = eClass.getEAttributes?.() || []

      for (const attr of Array.from(attributes)) {
        // Check if attribute is derived (handle DynamicEObjects)
        const attrAny = attr as any
        const isDerived = typeof attrAny.isDerived === 'function' ? attrAny.isDerived() : attrAny.derived
        if (!isDerived) continue

        // Get annotations
        const annotations = getAnnotationsFromElement(attrAny)

        for (const annotation of annotations) {
          const source = getAnnotationSourceValue(annotation)

          if (isOclAnnotationSource(source)) {
            const details = getAnnotationDetailsMap(annotation)
            const derivation = details.get('derivation')

            if (derivation) {
              const attrName = typeof attrAny.getName === 'function' ? attrAny.getName() : attrAny.name
              console.log(`[OclService] Manually registering derived attribute: ${eClass.getName()}.${attrName}`)

              try {
                handler.register(eClass, attrName, derivation)
              } catch (regErr) {
                console.warn(`[OclService] Failed to register derived attribute ${attrName}:`, regErr)
              }
            }
          }
        }
      }

      // Also handle derived references
      const references = eClass.getEReferences?.() || []

      for (const ref of Array.from(references)) {
        // Handle DynamicEObjects
        const refAny = ref as any
        const isDerived = typeof refAny.isDerived === 'function' ? refAny.isDerived() : refAny.derived
        if (!isDerived) continue

        const annotations = getAnnotationsFromElement(refAny)

        for (const annotation of annotations) {
          const source = getAnnotationSourceValue(annotation)

          if (isOclAnnotationSource(source)) {
            const details = getAnnotationDetailsMap(annotation)
            const derivation = details.get('derivation')

            if (derivation) {
              const refName = typeof refAny.getName === 'function' ? refAny.getName() : refAny.name
              console.log(`[OclService] Manually registering derived reference: ${eClass.getName()}.${refName}`)

              try {
                handler.register(eClass, refName, derivation)
              } catch (regErr) {
                console.warn(`[OclService] Failed to register derived reference ${refName}:`, regErr)
              }
            }
          }
        }
      }
    }

    // Process subpackages recursively
    const subPackages = pkg.getESubpackages?.() || []
    for (const subPkg of Array.from(subPackages)) {
      registerDerivedAttributesManually(subPkg, handler)
    }
  }

  /**
   * Get annotations from an element (handles DynamicEObjects)
   */
  function getAnnotationsFromElement(element: any): any[] {
    if ('getEAnnotations' in element && typeof element.getEAnnotations === 'function') {
      return element.getEAnnotations() || []
    }
    if ('eGet' in element && typeof element.eGet === 'function') {
      const eClass = element.eClass?.()
      if (eClass) {
        const annotationsFeature = eClass.getEStructuralFeature('eAnnotations')
        if (annotationsFeature) {
          const result = element.eGet(annotationsFeature)
          if (Array.isArray(result)) return result
          if (result && typeof result[Symbol.iterator] === 'function') {
            return [...result]
          }
        }
      }
    }
    return []
  }

  /**
   * Get annotation source (handles DynamicEObjects)
   */
  function getAnnotationSourceValue(annotation: any): string | null {
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
   * Get annotation details map (handles DynamicEObjects)
   */
  function getAnnotationDetailsMap(annotation: any): Map<string, string> {
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
              const key = getMapEntryKeyValue(entry)
              const value = getMapEntryValueValue(entry)
              if (key !== null) {
                result.set(key, value ?? '')
              }
            }
          } else if (detailsList && typeof detailsList === 'object') {
            const list = detailsList as any
            if (typeof list.size === 'function') {
              for (let i = 0; i < list.size(); i++) {
                const entry = list.get(i)
                const key = getMapEntryKeyValue(entry)
                const value = getMapEntryValueValue(entry)
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

  function getMapEntryKeyValue(entry: any): string | null {
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

  function getMapEntryValueValue(entry: any): string | null {
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
   * Register multiple packages
   */
  async function registerPackages(packages: EPackage[]): Promise<void> {
    for (const pkg of packages) {
      await registerPackage(pkg)
    }
  }

  /**
   * Add a custom constraint
   */
  async function addConstraint(expression: string, name?: string): Promise<void> {
    if (!await loadOclModules()) return
    try {
      const doc = await parseOclExpression(expression)
      if (doc) {
        allConstraintDocs.push({ document: doc, name })
        constraintCount.value = allConstraintDocs.length
      }
    } catch (e) {
      console.warn('[OclService] Failed to add constraint:', expression, e)
    }
  }

  /**
   * Validate a single EObject
   */
  async function validateObject(obj: EObject): Promise<OclValidationIssue[]> {
    if (!await loadOclModules() || allConstraintDocs.length === 0) return []

    const className = obj.eClass().getName()
    const newIssues: OclValidationIssue[] = []

    for (const entry of allConstraintDocs) {
      // Filter by context class if available
      if (entry.contextClassName && entry.contextClassName !== className) {
        if (!isSubtypeOf(obj.eClass(), entry.contextClassName)) continue
      }

      try {
        const evalResult = oclEvaluator.evaluate(entry.document, wrapEObjectForOcl(obj), {
          maxDepth: 500,
          timeoutMs: 10000,
          nullHandling: 'strict'
        })
        if (!evalResult.valid) {
          for (const r of evalResult.results) {
            if (!r.satisfied) {
              newIssues.push(constraintToIssue({
                constraintName: r.name || entry.name,
                message: r.error || `Constraint '${r.name || entry.name || 'unnamed'}' failed`,
                valid: false
              }, obj))
            }
          }
        }
      } catch (e) {
        console.warn(`[OclService] Constraint evaluation failed for ${className}:`, e)
      }
    }

    return newIssues
  }

  /**
   * Validate multiple EObjects
   */
  async function validateObjects(objects: EObject[]): Promise<OclValidationIssue[]> {
    if (!await loadOclModules()) return []
    const allIssues: OclValidationIssue[] = []

    for (const obj of objects) {
      const objIssues = await validateObject(obj)
      allIssues.push(...objIssues)
    }

    return allIssues
  }

  /**
   * Validate all contents of a resource
   */
  async function validateResource(resource: Resource): Promise<void> {
    isValidating.value = true

    try {
      const objects: EObject[] = []

      for (const root of resource.getContents()) {
        objects.push(root)
        // Get all nested contents
        for (const content of root.eAllContents()) {
          objects.push(content)
        }
      }

      const newIssues = await validateObjects(objects)
      const oldCount = issues.value.length
      issues.value = newIssues
      emitShowProblemsIfNeeded(oldCount, newIssues.length)
      lastValidation.value = new Date()

      console.log(`[OclService] Validated ${objects.length} objects, found ${newIssues.length} issues`)
    } finally {
      isValidating.value = false
    }
  }

  /**
   * Validate with debouncing (for on-change validation)
   */
  function validateDebounced(resource: Resource): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(async () => {
      await validateResource(resource)
      debounceTimer = null
    }, debounceMs)
  }

  /**
   * Clear all issues
   */
  function clearIssues(): void {
    issues.value = []
  }

  /**
   * Remove issues for a specific object
   */
  function clearIssuesForObject(obj: EObject): void {
    issues.value = issues.value.filter(issue => issue.object !== obj)
  }

  /**
   * Add an external issue (e.g., XMI parser error)
   */
  function addIssue(issue: Omit<OclValidationIssue, 'id' | 'timestamp'>): void {
    const oldCount = issues.value.length
    issues.value = [...issues.value, {
      ...issue,
      id: generateIssueId(),
      timestamp: new Date()
    }]
    emitShowProblemsIfNeeded(oldCount, issues.value.length)
  }

  /**
   * Add multiple external issues at once
   */
  function addIssues(newIssues: Omit<OclValidationIssue, 'id' | 'timestamp'>[]): void {
    const oldCount = issues.value.length
    const timestampedIssues = newIssues.map(issue => ({
      ...issue,
      id: generateIssueId(),
      timestamp: new Date()
    }))
    issues.value = [...issues.value, ...timestampedIssues]
    emitShowProblemsIfNeeded(oldCount, issues.value.length)
  }

  /**
   * Clear issues by source type
   */
  function clearIssuesBySource(source: IssueSource): void {
    issues.value = issues.value.filter(issue => issue.source !== source)
  }

  /**
   * Clear issues for a specific file path
   */
  function clearIssuesForFile(filePath: string): void {
    issues.value = issues.value.filter(issue => issue.filePath !== filePath)
  }

  /**
   * Find derived expression by walking the class hierarchy (own class + all supertypes)
   */
  function findDerivedExpression(eClass: EClass, attributeName: string): string | undefined {
    // Check own class first
    const ownKey = `${eClass.getName()}.${attributeName}`
    const own = derivedExpressions.get(ownKey)
    if (own) return own

    // Walk supertypes
    const supers = eClass.getEAllSuperTypes?.() ?? []
    for (const sup of supers) {
      const key = `${sup.getName()}.${attributeName}`
      const expr = derivedExpressions.get(key)
      if (expr) return expr
    }
    return undefined
  }

  /**
   * Evaluate a derived attribute
   */
  async function evaluateDerived(obj: EObject, attributeName: string): Promise<unknown> {
    const expression = findDerivedExpression(obj.eClass(), attributeName)
    if (!expression) return undefined
    return query(obj, expression)
  }

  /**
   * Check if an attribute is derived with OCL expression
   */
  async function hasDerivedExpression(eClass: EClass, attributeName: string): Promise<boolean> {
    return findDerivedExpression(eClass, attributeName) !== undefined
  }

  /**
   * Execute an OCL query
   */
  async function query(obj: EObject, expression: string): Promise<unknown> {
    if (!await loadOclModules()) return undefined
    try {
      // Parse just the expression (not a full constraint context)
      const exprResult = await oclLangium.parseOclExpression(expression)
      if (exprResult?.expression) {
        // Wrap EObject so that property access works via dot notation
        // The OclEvaluator uses eGet(featureName:string) but emfts eGet expects EStructuralFeature
        const wrapped = wrapEObjectForOcl(obj)
        return oclEvaluator.evaluateExpression(exprResult.expression, wrapped, {
          maxDepth: 500,
          timeoutMs: 10000,
          nullHandling: 'lenient'
        })
      }
      return undefined
    } catch (e) {
      console.warn('[OclService] Query evaluation failed:', expression, e)
      return undefined
    }
  }

  /**
   * Wrap an EObject with a Proxy so that property access by name works.
   * The OCL evaluator accesses properties via obj.featureName or obj.eGet(featureName).
   * emfts EObjects require eGet(EStructuralFeature), so we intercept and resolve.
   */
  function wrapEObjectForOcl(obj: EObject): any {
    if (!obj || typeof obj !== 'object') return obj
    const eClass = obj.eClass?.()
    if (!eClass) return obj

    return new Proxy(obj, {
      get(target: any, prop: string | symbol) {
        if (typeof prop === 'symbol') return target[prop]

        // Passthrough for standard EObject methods
        if (['eClass', 'eContainer', 'eContainingFeature', 'eContainmentFeature',
             'eResource', 'eIsProxy', 'eAllContents', 'eContents', 'eCrossReferences',
             'eGet', 'eSet', 'eUnset', 'eIsSet', 'eInvoke', 'eAdapters', 'eDeliver',
             'eNotify', 'eProxyURI', 'toString'].includes(prop)) {
          const val = target[prop]
          if (prop === 'eGet') {
            // Override eGet to accept string feature names
            return (featureOrName: any) => {
              if (typeof featureOrName === 'string') {
                const feature = eClass.getEStructuralFeature(featureOrName)
                if (feature) {
                  const value = target.eGet(feature)
                  // Recursively wrap contained EObjects
                  if (value && typeof value === 'object' && typeof value.eClass === 'function') {
                    return wrapEObjectForOcl(value)
                  }
                  // Wrap collections
                  if (Array.isArray(value)) {
                    return value.map((v: any) =>
                      v && typeof v === 'object' && typeof v.eClass === 'function' ? wrapEObjectForOcl(v) : v
                    )
                  }
                  if (value && typeof value[Symbol.iterator] === 'function' && typeof value !== 'string') {
                    return Array.from(value as Iterable<any>).map((v: any) =>
                      v && typeof v === 'object' && typeof v.eClass === 'function' ? wrapEObjectForOcl(v) : v
                    )
                  }
                  return value
                }
                return undefined
              }
              return target.eGet(featureOrName)
            }
          }
          return typeof val === 'function' ? val.bind(target) : val
        }

        // Property access by name → resolve via eGet
        const feature = eClass.getEStructuralFeature(prop)
        if (feature) {
          const value = target.eGet(feature)
          if (value && typeof value === 'object' && typeof value.eClass === 'function') {
            return wrapEObjectForOcl(value)
          }
          if (Array.isArray(value)) {
            return value.map((v: any) =>
              v && typeof v === 'object' && typeof v.eClass === 'function' ? wrapEObjectForOcl(v) : v
            )
          }
          if (value && typeof value[Symbol.iterator] === 'function' && typeof value !== 'string') {
            return Array.from(value as Iterable<any>).map((v: any) =>
              v && typeof v === 'object' && typeof v.eClass === 'function' ? wrapEObjectForOcl(v) : v
            )
          }
          return value
        }

        // Fallback to direct property
        const directVal = target[prop]
        return typeof directVal === 'function' ? directVal.bind(target) : directVal
      }
    })
  }

  /**
   * Execute an operation with OCL body
   */
  // Helper to get element name (handles DynamicEObjects)
  function _getElementName(element: any): string {
    let name = element.getName?.()
    if (name) return name
    const ec = element.eClass?.()
    if (ec) {
      const nf = ec.getEStructuralFeature?.('name')
      if (nf) { name = element.eGet?.(nf); if (name) return name }
    }
    if (element.eSettings instanceof Map) {
      name = element.eSettings.get('name')
      if (name) return name
    }
    return ''
  }

  // Helper to get annotations from an element (handles DynamicEObjects)
  function _getAnnotations(element: any): any[] {
    let anns = element.getEAnnotations?.()
    if (anns && (Array.isArray(anns) || anns.data)) return anns.data ?? anns
    const ec = element.eClass?.()
    if (ec) {
      const af = ec.getEStructuralFeature?.('eAnnotations')
      if (af) { anns = element.eGet?.(af); if (anns) return anns.data ?? anns ?? [] }
    }
    return []
  }

  // Helper to get annotation source (handles DynamicEObjects)
  function _getAnnotationSource(annotation: any): string | undefined {
    const ac = annotation.eClass?.()
    if (ac) {
      const sf = ac.getEStructuralFeature?.('source')
      if (sf) { const s = annotation.eGet?.(sf); if (s) return String(s) }
    }
    if (annotation.eSettings instanceof Map) {
      const s = annotation.eSettings.get('source')
      if (s) return String(s)
    }
    return annotation.getSource?.() ?? (annotation as any).source
  }

  // Helper to get detail value from annotation by key (handles DynamicEObjects)
  // Delegates to the proven getAnnotationDetailsMap helper
  function _getDetailValue(annotation: any, targetKey: string): string | undefined {
    const detailsMap = getAnnotationDetailsMap(annotation)
    const val = detailsMap.get(targetKey)
    return val !== undefined && val !== null ? val : undefined
  }

  // Helper to get all operations from an EClass (handles DynamicEObjects)
  function _getAllOperations(eClass: any): any[] {
    if (typeof eClass.getEAllOperations === 'function') {
      const ops = eClass.getEAllOperations()
      if (ops) return Array.isArray(ops) ? ops : (ops.data ?? [])
    }
    const mc = eClass.eClass?.()
    if (mc) {
      const of = mc.getEStructuralFeature?.('eOperations')
      if (of) {
        const ops = eClass.eGet?.(of)
        if (ops) return Array.isArray(ops) ? ops : (ops.data ?? [])
      }
    }
    return []
  }

  async function executeOperation(
    obj: EObject,
    operationName: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    if (!await loadOclModules()) return undefined

    const eClass = obj.eClass()
    const className = eClass.getName() || ''

    // 1. Try new format: __op_<name> in derivedExpressions (walks class hierarchy)
    let oclBody: string | null = findDerivedExpression(eClass, `__op_${operationName}`) ?? null

    // 2. Fallback: legacy annotation on EOperation
    if (!oclBody) {
      const operations = _getAllOperations(eClass)
      const operation = operations.find((op: any) => _getElementName(op) === operationName)

      if (!operation) {
        throw new Error(`Operation '${operationName}' not found on class '${className}'`)
      }

      const annotations = _getAnnotations(operation)
      for (const annotation of annotations) {
        const source = _getAnnotationSource(annotation)
        if (isOclAnnotationSource(source)) {
          const body = _getDetailValue(annotation, 'body')
          if (body) { oclBody = body; break }
        }
      }
    }

    if (!oclBody) {
      throw new Error(`No OCL body found for operation '${operationName}'`)
    }

    // If there are parameters, we need to substitute them in the expression
    if (params && Object.keys(params).length > 0) {
      // Simple parameter substitution for now
      // More sophisticated handling would require proper OCL parsing
      let expression = oclBody
      for (const [paramName, paramValue] of Object.entries(params)) {
        // Convert value to OCL literal
        let oclValue: string
        if (typeof paramValue === 'string') {
          oclValue = `'${paramValue}'`
        } else if (typeof paramValue === 'number') {
          oclValue = String(paramValue)
        } else if (typeof paramValue === 'boolean') {
          oclValue = paramValue ? 'true' : 'false'
        } else if (paramValue === null || paramValue === undefined) {
          oclValue = 'null'
        } else if (typeof paramValue === 'object' && (paramValue as any).name) {
          // Enum literal
          oclValue = (paramValue as any).name
        } else {
          // For objects, we can't easily substitute - would need extension
          oclValue = 'null'
        }

        // Replace parameter references in the expression
        expression = expression.replace(new RegExp(`\\b${paramName}\\b`, 'g'), oclValue)
      }
      oclBody = expression
    }

    // Execute the OCL expression
    return query(obj, oclBody)
  }

  /**
   * Check if an operation has an OCL expression
   */
  async function hasOperationExpression(eClass: EClass, operationName: string): Promise<boolean> {
    try {
      const className = eClass.getName() || ''
      // Check new format first (walks class hierarchy)
      if (findDerivedExpression(eClass, `__op_${operationName}`)) return true

      // Fallback: legacy annotation
      const operations = _getAllOperations(eClass)
      const operation = operations.find((op: any) => _getElementName(op) === operationName)
      if (!operation) return false

      const annotations = _getAnnotations(operation)
      for (const annotation of annotations) {
        const source = _getAnnotationSource(annotation)
        if (isOclAnnotationSource(source)) {
          const body = _getDetailValue(annotation, 'body')
          if (body) return true
        }
      }
      return false
    } catch {
      return false
    }
  }

  /** Options for attachTo */
  interface AttachOptions {
    /** Run initial validation immediately after attaching (default: false) */
    validateImmediately?: boolean
    /** Revert invalid changes automatically (default: true) */
    revertOnFailure?: boolean
  }

  /**
   * Attach live validation to a target (EObject or Resource).
   * After attaching, any model changes will automatically trigger OCL validation
   * and update the issues list.
   *
   * @param target - The EObject or Resource to monitor for changes
   * @param options - Attach options (validateImmediately, revertOnFailure)
   * @returns true if attached successfully, false otherwise
   *
   * @example
   * ```typescript
   * // Enable live validation on loaded instances with immediate validation
   * const resource = await loadResource(...)
   * await problemsService.attachTo(resource, { validateImmediately: true })
   *
   * // Now any changes will be validated automatically
   * student.eSet(kurseRef, invalidCourse) // Adds issue to problems panel
   * ```
   */
  async function attachTo(target: EObject | Resource | Notifier, options?: AttachOptions): Promise<boolean> {
    const { validateImmediately = false } = options || {}

    if (attachedTargets.has(target as any)) {
      if (validateImmediately && 'getContents' in target) {
        await validateResource(target as Resource)
      }
      return true
    }

    attachedTargets.add(target as any)
    console.log('[OclService] Target registered for validation (manual trigger)')

    if (validateImmediately) {
      if ('getContents' in target) {
        await validateResource(target as Resource)
      } else if ('eClass' in target) {
        const newIssues = await validateObject(target as EObject)
        issues.value = [...issues.value, ...newIssues]
      }
    }

    return true
  }

  /**
   * Detach live validation from a target.
   *
   * @param target - The target to detach from
   * @returns true if detached, false if was not attached
   */
  async function detachFrom(target: EObject | Resource | Notifier): Promise<boolean> {
    if (!attachedTargets.has(target as any)) {
      return false
    }

    attachedTargets.delete(target as any)
    issues.value = issues.value.filter(i => i.source !== 'ocl-live' || i.object !== target)
    return true
  }

  /**
   * Check if live validation is attached to a target
   */
  function isAttachedTo(target: EObject | Resource | Notifier): boolean {
    return attachedTargets.has(target as any)
  }

  /**
   * Check for unresolved proxy references in a resource and add them as issues
   */
  async function checkUnresolvedProxies(resource: Resource): Promise<number> {
    const proxyIssues: Omit<OclValidationIssue, 'id' | 'timestamp'>[] = []

    for (const root of resource.getContents()) {
      checkObjectForProxies(root, proxyIssues)
      for (const content of root.eAllContents()) {
        checkObjectForProxies(content, proxyIssues)
      }
    }

    if (proxyIssues.length > 0) {
      // Clear old proxy issues first
      clearIssuesBySource('unresolved-proxy')
      addIssues(proxyIssues)
      console.log(`[OclService] Found ${proxyIssues.length} unresolved proxy references`)
    }

    return proxyIssues.length
  }

  /**
   * Check a single object for unresolved proxy references
   */
  function checkObjectForProxies(
    obj: EObject,
    issues: Omit<OclValidationIssue, 'id' | 'timestamp'>[]
  ): void {
    const eClass = obj.eClass()

    // Check all non-containment references only
    for (const ref of eClass.getEAllReferences()) {
      // Skip containment references - they don't have proxies
      if (ref.isContainment()) continue

      try {
        const value = obj.eGet(ref)
        if (!value) continue

        if (ref.isMany()) {
          // Multi-valued reference
          const list = value as Iterable<EObject>
          let index = 0
          for (const item of list) {
            if (isUnresolvedExternalProxy(item, obj)) {
              issues.push(createProxyIssue(obj, ref.getName(), item, index))
            }
            index++
          }
        } else {
          // Single-valued reference
          const target = value as EObject
          if (isUnresolvedExternalProxy(target, obj)) {
            issues.push(createProxyIssue(obj, ref.getName(), target))
          }
        }
      } catch {
        // Ignore errors during proxy check
      }
    }
  }

  /**
   * Check if an object is an unresolved external proxy
   * Returns false for:
   * - Non-proxy objects
   * - Internal references (same resource)
   * - Proxies that can be resolved
   */
  function isUnresolvedExternalProxy(target: EObject | null, owner: EObject): boolean {
    if (!target) return false
    if (!target.eIsProxy?.()) return false

    try {
      // Get proxy URI
      const proxyURI = (target as any).eProxyURI?.()
      if (!proxyURI) return false

      const proxyURIStr = String(proxyURI)

      // Skip internal references (same resource, fragment-only URIs)
      // These look like: "temp-instance.xmi#/0" or "#/0"
      if (proxyURIStr.startsWith('#') || proxyURIStr.includes('.xmi#/')) {
        // This is likely an internal reference that will resolve
        return false
      }

      // Check if it's a type reference (to metamodel) - these might be valid
      if (proxyURIStr.includes('#//')) {
        // This is a reference to a metamodel element (e.g., http://example.org#//ClassName)
        // Only report if the metamodel isn't loaded
        // For now, report these as they indicate missing metamodels
        return true
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Create an issue for an unresolved proxy
   */
  function createProxyIssue(
    owner: EObject,
    featureName: string,
    proxy: EObject,
    index?: number
  ): Omit<OclValidationIssue, 'id' | 'timestamp'> {
    const proxyURI = (proxy as any).eProxyURI?.() || 'unknown'
    const indexSuffix = index !== undefined ? `[${index}]` : ''

    return {
      severity: 'error',
      message: `Unresolved reference in '${featureName}${indexSuffix}': ${proxyURI}`,
      object: owner,
      objectLabel: getObjectLabel(owner),
      eClassName: owner.eClass().getName() || 'Unknown',
      source: 'unresolved-proxy' as IssueSource
    }
  }

  /**
   * Reset the service (clear all state)
   */
  function reset(): void {
    attachedTargets.clear()
    oclEngine = null
    oclLangium = null
    oclEvaluator = null
    oclBridge = null
    oclLoadPromise = null
    parsedDocuments.clear()
    allConstraintDocs.length = 0
    derivedExpressions.clear()
    issues.value = []
    isValidating.value = false
    lastValidation.value = null
    constraintCount.value = 0
    packageCount.value = 0
    registeredPackages.length = 0
    issueIdCounter = 0

    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    // Clear C-OCL
    coclLoader.clearAllConstraintSets?.()
  }

  // =========================================================================
  // C-OCL Support
  // =========================================================================

  // Import C-OCL loader (lazy to avoid circular deps)
  const coclLoader = {
    loadCoclFromString: null as any,
    unloadCocl: null as any,
    getConstraintsForClass: null as any,
    getReferenceFilterConstraint: null as any,
    getDerivedConstraint: null as any,
    clearAllConstraintSets: null as any,
    _loaded: false
  }

  async function ensureCoclLoader(): Promise<boolean> {
    if (coclLoader._loaded) return true
    try {
      console.log('[ProblemsService] Loading C-OCL loader module...')
      const mod = await import('./useCoclLoader')
      console.log('[ProblemsService] C-OCL loader module loaded:', mod)
      coclLoader.loadCoclFromString = mod.loadCoclFromString
      coclLoader.unloadCocl = mod.unloadCocl
      coclLoader.getConstraintsForClass = mod.getConstraintsForClass
      coclLoader.getReferenceFilterConstraint = mod.getReferenceFilterConstraint
      coclLoader.getDerivedConstraint = mod.getDerivedConstraint
      coclLoader.clearAllConstraintSets = mod.clearAllConstraintSets
      coclLoader._loaded = true
      console.log('[ProblemsService] C-OCL loader initialized')
      return true
    } catch (e) {
      console.error('[ProblemsService] Failed to load C-OCL loader:', e)
      return false
    }
  }

  /**
   * Load a Complete OCL document (.ocl file) and register its constraints and definitions.
   * Supports: inv, def, derive, init, body, and C-OCL extensions (VALIDATION, DERIVED, REFERENCE_FILTER).
   */
  async function loadOclDocument(oclText: string, filePath?: string): Promise<boolean> {
    if (!await loadOclModules()) return false

    try {
      const result = await oclLangium.parseOcl(oclText)
      if (!result || !result.document) {
        console.warn('[OclService] Failed to parse OCL document:', filePath)
        return false
      }

      if (result.hasErrors) {
        console.warn('[OclService] OCL document has parse errors:', result.errors)
        for (const err of result.errors) {
          addIssue({
            severity: 'warning',
            message: `OCL parse error (line ${err.line}): ${err.message}`,
            source: 'ocl-document' as any,
            filePath
          })
        }
      }

      // Register the document for constraint validation
      allConstraintDocs.push({ document: result.document, name: filePath })
      constraintCount.value = allConstraintDocs.length

      console.log(`[OclService] Loaded OCL document: ${filePath || '(inline)'}, contexts: ${result.document.contexts.length}`)
      return true
    } catch (e) {
      console.error('[OclService] Failed to load OCL document:', e)
      return false
    }
  }

  /**
   * Load a C-OCL file and register its constraints
   */
  async function loadCoclFile(xmiContent: string, filePath: string): Promise<boolean> {
    console.log('[ProblemsService] loadCoclFile called:', filePath)
    console.log('[ProblemsService] Content length:', xmiContent?.length)

    const loaderReady = await ensureCoclLoader()
    console.log('[ProblemsService] C-OCL loader ready:', loaderReady)
    if (!loaderReady) return false

    console.log('[ProblemsService] Calling loadCoclFromString...')
    const constraintSet = await coclLoader.loadCoclFromString(xmiContent, filePath)
    console.log('[ProblemsService] loadCoclFromString result:', constraintSet)
    if (!constraintSet) return false

    // Register validation constraints via ocl-langium parsing
    if (await loadOclModules()) {
      for (const constraint of constraintSet.constraints) {
        if (constraint.role === 'VALIDATION' && constraint.active) {
          try {
            const fullExpr = `context ${constraint.contextClass} inv ${constraint.name}: ${constraint.expression}`
            const doc = await parseOclExpression(fullExpr)
            if (doc) {
              allConstraintDocs.push({ document: doc, contextClassName: constraint.contextClass, name: constraint.name })
            }
            console.log(`[ProblemsService] Registered C-OCL validation constraint: ${constraint.name}`)
          } catch (e) {
            console.warn(`[ProblemsService] Failed to register constraint ${constraint.name}:`, e)
            // Add issue for failed constraint registration
            addIssue({
              severity: 'warning',
              message: `Failed to register C-OCL constraint "${constraint.name}": ${(e as Error).message}`,
              source: 'cocl-loader',
              filePath
            })
          }
        }
      }
      constraintCount.value = allConstraintDocs.length
    }

    console.log(`[ProblemsService] Loaded C-OCL file: ${filePath} with ${constraintSet.constraints.length} constraints`)
    return true
  }

  /**
   * Unload a C-OCL file
   */
  async function unloadCoclFile(filePath: string): Promise<boolean> {
    if (!await ensureCoclLoader()) return false
    return coclLoader.unloadCocl(filePath)
  }

  /**
   * Get C-OCL reference filter expression for a class and feature
   */
  async function getCoclReferenceFilter(
    className: string,
    featureName: string
  ): Promise<string | undefined> {
    if (!await ensureCoclLoader()) return undefined

    const constraint = coclLoader.getReferenceFilterConstraint(className, featureName)
    return constraint?.expression
  }

  /**
   * Get C-OCL derived expression for a class and feature
   */
  async function getCoclDerivedExpression(
    className: string,
    featureName: string
  ): Promise<string | undefined> {
    if (!await ensureCoclLoader()) return undefined

    const constraint = coclLoader.getDerivedConstraint(className, featureName)
    return constraint?.expression
  }

  /**
   * Get all C-OCL validation constraints for a class
   */
  async function getCoclValidationConstraints(
    className: string
  ): Promise<Array<{ name: string; expression: string; severity: string }>> {
    if (!await ensureCoclLoader()) return []

    const constraints = coclLoader.getConstraintsForClass(className, 'VALIDATION')
    return constraints.map((c: any) => ({
      name: c.name,
      expression: c.expression,
      severity: c.severity
    }))
  }

  // Computed statistics
  const stats: ComputedRef<OclValidationStats> = computed(() => {
    const errorCount = issues.value.filter(i => i.severity === 'error').length
    const warningCount = issues.value.filter(i => i.severity === 'warning').length
    const infoCount = issues.value.filter(i => i.severity === 'info').length

    return {
      errorCount,
      warningCount,
      infoCount,
      totalCount: issues.value.length
    }
  })

  // Convenience computed values
  const errorCount = computed(() => stats.value.errorCount)
  const warningCount = computed(() => stats.value.warningCount)
  const hasErrors = computed(() => stats.value.errorCount > 0)
  const hasIssues = computed(() => stats.value.totalCount > 0)

  return {
    // State
    issues,
    isValidating,
    lastValidation,
    constraintCount,
    packageCount,
    stats,
    errorCount,
    warningCount,
    hasErrors,
    hasIssues,

    // Actions
    registerPackage,
    registerPackages,
    addConstraint,
    validateObject,
    validateObjects,
    validateResource,
    validateDebounced,
    clearIssues,
    clearIssuesForObject,
    addIssue,
    addIssues,
    clearIssuesBySource,
    clearIssuesForFile,
    evaluateDerived,
    hasDerivedExpression,
    query,
    executeOperation,
    hasOperationExpression,
    reset,

    // Live validation
    attachTo,
    detachFrom,
    isAttachedTo,

    // Proxy validation
    checkUnresolvedProxies,

    // C-OCL support
    loadOclDocument,
    loadCoclFile,
    unloadCoclFile,
    getCoclReferenceFilter,
    getCoclDerivedExpression,
    getCoclValidationConstraints,

    // Internal access (for advanced use)
    ensureOclReady
  }
}

/**
 * Shared singleton instance
 */
let sharedInstance: ReturnType<typeof useProblemsService> | null = null

/**
 * Get the shared Problems service instance
 */
export function useSharedProblemsService(options?: OclServiceOptions): ReturnType<typeof useProblemsService> {
  if (!sharedInstance) {
    sharedInstance = useProblemsService(options)
  }
  return sharedInstance
}
