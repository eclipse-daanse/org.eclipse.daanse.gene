/**
 * useDmnEditor - State Management with EMFTs Resource
 *
 * Manages the DMN model state using EMFTs XMIResource + EContentAdapter,
 * following the same pattern as useMetamodeler.ts.
 */

import { ref, computed, shallowRef, triggerRef, toRaw, type Ref } from 'tsm:vue'
import type { EObject, Resource } from '@emfts/core'
import {
  EContentAdapter, XMIResource, URI, BasicResourceSet,
  type Notification
} from '@emfts/core'
import {
  getDmnPackage, getDmnFactory,
  getDefinitionsClass, getDecisionClass, getInputDataClass,
  getDecisionTableClass, getInputClauseClass, getOutputClauseClass,
  getDecisionRuleClass, getUnaryTestsClass, getLiteralExpressionClass
} from './useDmnPackage'
import type { HitPolicy, DmnTreeNode } from '../types'
import { DMN_ICONS } from '../types'

// Module-level DMN data service reference (set via setDmnDataService)
let _dmnDataService: any = null
let _fileSystem: any = null

/**
 * Set the DMN data service reference (called from activate or externally).
 */
export function setDmnDataService(service: any): void {
  _dmnDataService = service
}

/**
 * Set the file system reference (called from activate).
 */
export function setFileSystem(fs: any): void {
  _fileSystem = fs
}

let resourceSet: BasicResourceSet | null = null

function getResourceSet(): BasicResourceSet {
  if (!resourceSet) {
    resourceSet = new BasicResourceSet()
    // Register DMN package so the resource set can resolve DMN types
    const pkg = getDmnPackage()
    const registry = resourceSet.getPackageRegistry()
    if (registry) {
      registry.set(pkg.getNsURI() || '', pkg)
    }
  }
  return resourceSet
}

/**
 * Content adapter that triggers Vue reactivity on DMN model changes
 */
class DmnContentAdapter extends EContentAdapter {
  private resourceRef: Ref<Resource | null>
  private onChanged: () => void

  constructor(resourceRef: Ref<Resource | null>, onChanged: () => void) {
    super()
    this.resourceRef = resourceRef
    this.onChanged = onChanged
  }

  notifyChanged(notification: Notification): void {
    super.notifyChanged(notification)
    this.onChanged()
  }
}

// Object ID generation
let objectIdCounter = 0
const objectIdMap = new WeakMap<EObject, string>()

function getObjectId(obj: EObject): string {
  const rawObj = toRaw(obj)
  let id = objectIdMap.get(rawObj)
  if (!id) {
    id = `dmn_${++objectIdCounter}`
    objectIdMap.set(rawObj, id)
  }
  return id
}

/**
 * Create the DMN editor composable
 */
export function useDmnEditor() {
  const resource = shallowRef<Resource | null>(null)
  const selectedDecision = shallowRef<EObject | null>(null)
  const dirty = ref(false)
  const filePath = ref<string | null>(null)
  const fileHandle = shallowRef<FileSystemFileHandle | null>(null)
  const version = ref(0)
  const expandedKeys = ref<Record<string, boolean>>({})

  let contentAdapter: DmnContentAdapter | null = null

  function triggerUpdate(): void {
    version.value = version.value + 1
    triggerRef(resource)
  }

  function setupAdapter(res: Resource | null, oldRes: Resource | null): void {
    if (oldRes && contentAdapter) {
      try {
        const adapters = (oldRes as any).eAdapters?.()
        if (adapters) {
          const idx = adapters.indexOf(contentAdapter)
          if (idx >= 0) adapters.splice(idx, 1)
        }
        contentAdapter.unsetTarget(oldRes as any)
      } catch (e) {
        console.warn('[DmnEditor] Failed to remove adapter:', e)
      }
    }

    if (res) {
      contentAdapter = new DmnContentAdapter(resource, triggerUpdate)
      try {
        const adapters = (res as any).eAdapters?.()
        if (adapters) {
          adapters.push(contentAdapter)
          contentAdapter.setTarget(res as any)
        }
      } catch (e) {
        console.warn('[DmnEditor] Failed to add adapter:', e)
      }
    }
  }

  // ============ Computed ============

  const rootDefinitions = computed<EObject | null>(() => {
    const _ = version.value
    if (!resource.value) return null
    const contents = resource.value.getContents()
    if (contents.length === 0) return null
    return contents.get(0) as EObject
  })

  const treeNodes = computed<DmnTreeNode[]>(() => {
    const _ = version.value
    if (!resource.value) return []
    const rawResource = toRaw(resource.value)
    const contents = toRaw(rawResource.getContents())
    const validContents = Array.from(contents).filter(obj => {
      const rawObj = toRaw(obj)
      return rawObj && typeof rawObj.eClass === 'function'
    })
    return validContents.map(obj => buildTreeNode(obj as EObject))
  })

  function buildTreeNode(obj: EObject): DmnTreeNode {
    const rawObj = toRaw(obj)
    const eClass = rawObj.eClass()
    const typeName = eClass.getName() || 'EObject'
    const id = getObjectId(rawObj)
    const label = getNodeLabel(rawObj, typeName)
    const icon = getNodeIcon(typeName)

    const node: DmnTreeNode = {
      key: id,
      label,
      icon,
      type: getNodeType(typeName),
      data: rawObj,
      selectable: true
    }

    // Build children from containment references
    const children: DmnTreeNode[] = []
    const features = eClass.getEAllStructuralFeatures()
    for (const f of features) {
      if ('isContainment' in f && (f as any).isContainment()) {
        const value = toRaw(rawObj.eGet(f))
        if (value) {
          if (Array.isArray(value) || (value as any)[Symbol.iterator]) {
            for (const child of Array.from(value as Iterable<any>)) {
              if (child && typeof child.eClass === 'function') {
                children.push(buildTreeNode(child))
              }
            }
          } else if (typeof (value as any).eClass === 'function') {
            children.push(buildTreeNode(value as EObject))
          }
        }
      }
    }

    if (children.length > 0) {
      node.children = children
    }

    return node
  }

  function getNodeLabel(obj: EObject, typeName: string): string {
    const nameFeature = obj.eClass().getEStructuralFeature('name')
    if (nameFeature) {
      const name = obj.eGet(nameFeature)
      if (name) return String(name)
    }
    const labelFeature = obj.eClass().getEStructuralFeature('label')
    if (labelFeature) {
      const label = obj.eGet(labelFeature)
      if (label) return String(label)
    }
    return `(${typeName})`
  }

  function getNodeIcon(typeName: string): string {
    switch (typeName) {
      case 'Definitions': return DMN_ICONS.definitions
      case 'Decision': return DMN_ICONS.decision
      case 'InputData': return DMN_ICONS.inputData
      case 'BusinessKnowledgeModel': return DMN_ICONS.bkm
      case 'KnowledgeSource': return DMN_ICONS.knowledgeSource
      case 'DecisionTable': return DMN_ICONS.decisionTable
      case 'InputClause': return DMN_ICONS.inputClause
      case 'OutputClause': return DMN_ICONS.outputClause
      case 'DecisionRule': return DMN_ICONS.rule
      default: return 'pi pi-file'
    }
  }

  function getNodeType(typeName: string): DmnTreeNode['type'] {
    switch (typeName) {
      case 'Definitions': return 'definitions'
      case 'Decision': return 'decision'
      case 'InputData': return 'input-data'
      case 'BusinessKnowledgeModel': return 'bkm'
      case 'KnowledgeSource': return 'knowledge-source'
      case 'DecisionTable': return 'decision-table'
      default: return 'definitions'
    }
  }

  // ============ Helper: get feature value ============

  function eGet(obj: EObject, featureName: string): any {
    const rawObj = toRaw(obj)
    const feature = rawObj.eClass().getEStructuralFeature(featureName)
    if (!feature) return undefined
    return toRaw(rawObj.eGet(feature))
  }

  function eSet(obj: EObject, featureName: string, value: any): void {
    const rawObj = toRaw(obj)
    const feature = rawObj.eClass().getEStructuralFeature(featureName)
    if (!feature) return
    rawObj.eSet(feature, value)
    dirty.value = true
    triggerUpdate()
  }

  function eListAdd(obj: EObject, featureName: string, child: EObject): void {
    const rawObj = toRaw(obj)
    const feature = rawObj.eClass().getEStructuralFeature(featureName)
    if (!feature) return
    const list = toRaw(rawObj.eGet(feature))
    if (list && typeof (list as any).add === 'function') {
      (list as any).add(child)
    } else if (Array.isArray(list)) {
      list.push(child)
    }
    dirty.value = true
    triggerUpdate()
  }

  function eListRemove(obj: EObject, featureName: string, child: EObject): void {
    const rawObj = toRaw(obj)
    const feature = rawObj.eClass().getEStructuralFeature(featureName)
    if (!feature) return
    const list = toRaw(rawObj.eGet(feature))
    if (list && typeof (list as any).remove === 'function') {
      (list as any).remove(child)
    } else if (Array.isArray(list)) {
      const idx = list.indexOf(toRaw(child))
      if (idx >= 0) list.splice(idx, 1)
    }
    dirty.value = true
    triggerUpdate()
  }

  // ============ Resource Operations ============

  /**
   * Create new empty DMN Definitions
   */
  function createNewDefinitions(name?: string): EObject {
    const oldResource = resource.value
    const factory = getDmnFactory()
    const defs = factory.create(getDefinitionsClass())

    const nameFeature = defs.eClass().getEStructuralFeature('name')
    if (nameFeature) defs.eSet(nameFeature, name || 'NewDefinitions')

    const nsFeature = defs.eClass().getEStructuralFeature('namespace')
    if (nsFeature) defs.eSet(nsFeature, 'http://example.com/dmn')

    const rs = getResourceSet()
    const uri = URI.createURI('model.dmn')
    const newResource = new XMIResource(uri)
    rs.getResources().push(newResource)
    newResource.setResourceSet(rs)

    const contents = newResource.getContents()
    if (typeof (contents as any).add === 'function') {
      (contents as any).add(defs)
    } else {
      contents.push(defs)
    }

    resource.value = newResource
    dirty.value = true
    filePath.value = null
    fileHandle.value = null
    selectedDecision.value = null
    setupAdapter(newResource, oldResource)
    triggerUpdate()

    return defs
  }

  /**
   * Load DMN from XMI string
   */
  async function loadFromString(content: string, sourcePath: string, handle?: FileSystemFileHandle): Promise<boolean> {
    try {
      const oldResource = resource.value
      const rs = getResourceSet()
      const uri = URI.createURI(sourcePath)

      // Remove existing resource if any
      const existingRes = rs.getResource(uri, false)
      if (existingRes) {
        const resources = rs.getResources()
        const idx = resources.indexOf(existingRes)
        if (idx >= 0) resources.splice(idx, 1)
      }

      const newResource = rs.createResource(uri) as XMIResource
      if (!newResource) return false

      await newResource.loadFromString(content)

      resource.value = newResource
      filePath.value = sourcePath
      fileHandle.value = handle ?? null
      dirty.value = false
      selectedDecision.value = null
      expandedKeys.value = {}
      setupAdapter(newResource, oldResource)
      triggerUpdate()

      console.log('[DmnEditor] Loaded from:', sourcePath)
      return true
    } catch (error) {
      console.error('[DmnEditor] Failed to load:', error)
      return false
    }
  }

  /**
   * Save DMN to XMI string
   */
  async function saveToString(): Promise<string | null> {
    if (!resource.value) return null
    try {
      const xmiResource = resource.value as XMIResource
      if (typeof xmiResource.saveToString === 'function') {
        const content = await xmiResource.saveToString()
        dirty.value = false
        return content
      }
      return null
    } catch (error) {
      console.error('[DmnEditor] Failed to save:', error)
      return null
    }
  }

  /**
   * Save to file (using File System Access API)
   */
  async function saveToFile(): Promise<boolean> {
    const content = await saveToString()
    if (!content) return false

    try {
      const geneFS = _fileSystem
      if (geneFS && filePath.value) {
        const sourceId = _dmnDataService?.sourceId
        if (sourceId) {
          const fileEntry = geneFS.getFileByPath(sourceId, filePath.value)
          if (fileEntry) {
            await geneFS.writeTextFile(fileEntry, content)
            dirty.value = false
            return true
          }
        }
      }

      // Fallback: File System Access API
      let handle = fileHandle.value
      if (!handle) {
        handle = await (window as any).showSaveFilePicker({
          suggestedName: 'model.dmn',
          types: [{
            description: 'DMN Files',
            accept: { 'application/xml': ['.dmn'] }
          }]
        })
        if (!handle) return false
        fileHandle.value = handle
        filePath.value = handle.name
      }

      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      dirty.value = false
      return true
    } catch (error: any) {
      if (error.name === 'AbortError') return false
      console.error('[DmnEditor] Failed to save to file:', error)
      return false
    }
  }

  /**
   * Save As (always prompts for new location)
   */
  async function saveAsFile(): Promise<boolean> {
    const content = await saveToString()
    if (!content) return false

    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: eGet(rootDefinitions.value!, 'name') || 'model',
        types: [{
          description: 'DMN Files',
          accept: { 'application/xml': ['.dmn'] }
        }]
      })
      if (!handle) return false

      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()

      fileHandle.value = handle
      filePath.value = handle.name
      dirty.value = false
      return true
    } catch (error: any) {
      if (error.name === 'AbortError') return false
      console.error('[DmnEditor] Failed to save as:', error)
      return false
    }
  }

  // ============ Decision Operations ============

  function addDecision(name?: string): EObject | null {
    const defs = toRaw(rootDefinitions.value)
    if (!defs) return null

    const factory = getDmnFactory()
    const decision = factory.create(getDecisionClass())

    // Set name
    const nameFeature = decision.eClass().getEStructuralFeature('name')
    if (nameFeature) decision.eSet(nameFeature, name || 'NewDecision')

    // Create a default DecisionTable
    const dt = factory.create(getDecisionTableClass())
    const hitPolicyFeature = dt.eClass().getEStructuralFeature('hitPolicy')
    if (hitPolicyFeature) dt.eSet(hitPolicyFeature, 'UNIQUE')

    // Add one default input clause
    const ic = factory.create(getInputClauseClass())
    const icLabelFeature = ic.eClass().getEStructuralFeature('label')
    if (icLabelFeature) ic.eSet(icLabelFeature, 'Input')
    // Create input expression with typeRef
    const inputExpr = factory.create(getLiteralExpressionClass())
    const inputExprTypeRef = inputExpr.eClass().getEStructuralFeature('typeRef')
    if (inputExprTypeRef) inputExpr.eSet(inputExprTypeRef, 'string')
    const inputExprText = inputExpr.eClass().getEStructuralFeature('text')
    if (inputExprText) inputExpr.eSet(inputExprText, 'input')
    const icExprFeature = ic.eClass().getEStructuralFeature('inputExpression')
    if (icExprFeature) ic.eSet(icExprFeature, inputExpr)
    eListAdd(dt, 'input', ic)

    // Add one default output clause
    const oc = factory.create(getOutputClauseClass())
    const ocLabelFeature = oc.eClass().getEStructuralFeature('label')
    if (ocLabelFeature) oc.eSet(ocLabelFeature, 'Output')
    const ocNameFeature = oc.eClass().getEStructuralFeature('name')
    if (ocNameFeature) oc.eSet(ocNameFeature, 'output')
    const ocTypeRefFeature = oc.eClass().getEStructuralFeature('typeRef')
    if (ocTypeRefFeature) oc.eSet(ocTypeRefFeature, 'string')
    eListAdd(dt, 'output', oc)

    // Set decision logic
    const logicFeature = decision.eClass().getEStructuralFeature('decisionLogic')
    if (logicFeature) decision.eSet(logicFeature, dt)

    // Add decision to definitions
    eListAdd(defs, 'decision', decision)

    selectedDecision.value = decision
    return decision
  }

  function removeDecision(decision: EObject): void {
    const defs = toRaw(rootDefinitions.value)
    if (!defs) return
    eListRemove(defs, 'decision', decision)
    if (selectedDecision.value === decision) {
      selectedDecision.value = null
    }
  }

  // ============ InputData Operations ============

  function addInputData(name?: string): EObject | null {
    const defs = toRaw(rootDefinitions.value)
    if (!defs) return null

    const factory = getDmnFactory()
    const inputData = factory.create(getInputDataClass())
    const nameFeature = inputData.eClass().getEStructuralFeature('name')
    if (nameFeature) inputData.eSet(nameFeature, name || 'NewInputData')

    eListAdd(defs, 'inputData', inputData)
    return inputData
  }

  // ============ Decision Table Operations ============

  function getDecisionTable(decision: EObject): EObject | null {
    const rawDec = toRaw(decision)
    const logicFeature = rawDec.eClass().getEStructuralFeature('decisionLogic')
    if (!logicFeature) return null
    return toRaw(rawDec.eGet(logicFeature)) as EObject | null
  }

  function addInputClause(dt: EObject, label?: string, typeRef?: string): EObject {
    const factory = getDmnFactory()
    const ic = factory.create(getInputClauseClass())
    const labelFeature = ic.eClass().getEStructuralFeature('label')
    if (labelFeature) ic.eSet(labelFeature, label || 'Input')

    // Create input expression
    const inputExpr = factory.create(getLiteralExpressionClass())
    const inputExprTypeRef = inputExpr.eClass().getEStructuralFeature('typeRef')
    if (inputExprTypeRef) inputExpr.eSet(inputExprTypeRef, typeRef || 'string')
    const icExprFeature = ic.eClass().getEStructuralFeature('inputExpression')
    if (icExprFeature) ic.eSet(icExprFeature, inputExpr)

    eListAdd(dt, 'input', ic)

    // Add empty inputEntry to each existing rule
    const rules = getList(dt, 'rule')
    for (const rule of rules) {
      const ut = factory.create(getUnaryTestsClass())
      const textFeature = ut.eClass().getEStructuralFeature('text')
      if (textFeature) ut.eSet(textFeature, '-')
      eListAdd(rule, 'inputEntry', ut)
    }

    return ic
  }

  function addOutputClause(dt: EObject, label?: string, name?: string, typeRef?: string): EObject {
    const factory = getDmnFactory()
    const oc = factory.create(getOutputClauseClass())
    const labelFeature = oc.eClass().getEStructuralFeature('label')
    if (labelFeature) oc.eSet(labelFeature, label || 'Output')
    const nameFeature = oc.eClass().getEStructuralFeature('name')
    if (nameFeature) oc.eSet(nameFeature, name || 'output')
    const typeRefFeature = oc.eClass().getEStructuralFeature('typeRef')
    if (typeRefFeature) oc.eSet(typeRefFeature, typeRef || 'string')

    eListAdd(dt, 'output', oc)

    // Add empty outputEntry to each existing rule
    const rules = getList(dt, 'rule')
    for (const rule of rules) {
      const le = factory.create(getLiteralExpressionClass())
      const textFeature = le.eClass().getEStructuralFeature('text')
      if (textFeature) le.eSet(textFeature, '')
      eListAdd(rule, 'outputEntry', le)
    }

    return oc
  }

  function removeInputClause(dt: EObject, clause: EObject, index: number): void {
    eListRemove(dt, 'input', clause)

    // Remove corresponding inputEntry from all rules
    const rules = getList(dt, 'rule')
    for (const rule of rules) {
      const entries = getList(rule, 'inputEntry')
      if (index < entries.length) {
        eListRemove(rule, 'inputEntry', entries[index])
      }
    }
  }

  function removeOutputClause(dt: EObject, clause: EObject, index: number): void {
    eListRemove(dt, 'output', clause)

    // Remove corresponding outputEntry from all rules
    const rules = getList(dt, 'rule')
    for (const rule of rules) {
      const entries = getList(rule, 'outputEntry')
      if (index < entries.length) {
        eListRemove(rule, 'outputEntry', entries[index])
      }
    }
  }

  function addRule(dt: EObject): EObject {
    const factory = getDmnFactory()
    const rule = factory.create(getDecisionRuleClass())

    // Create inputEntry for each input clause
    const inputs = getList(dt, 'input')
    for (let i = 0; i < inputs.length; i++) {
      const ut = factory.create(getUnaryTestsClass())
      const textFeature = ut.eClass().getEStructuralFeature('text')
      if (textFeature) ut.eSet(textFeature, '-')
      eListAdd(rule, 'inputEntry', ut)
    }

    // Create outputEntry for each output clause
    const outputs = getList(dt, 'output')
    for (let i = 0; i < outputs.length; i++) {
      const le = factory.create(getLiteralExpressionClass())
      const textFeature = le.eClass().getEStructuralFeature('text')
      if (textFeature) le.eSet(textFeature, '')
      eListAdd(rule, 'outputEntry', le)
    }

    eListAdd(dt, 'rule', rule)
    return rule
  }

  function removeRule(dt: EObject, rule: EObject): void {
    eListRemove(dt, 'rule', rule)
  }

  function duplicateRule(dt: EObject, sourceRule: EObject): EObject {
    const factory = getDmnFactory()
    const newRule = factory.create(getDecisionRuleClass())

    // Copy input entries
    const sourceInputs = getList(sourceRule, 'inputEntry')
    for (const entry of sourceInputs) {
      const ut = factory.create(getUnaryTestsClass())
      const textFeature = ut.eClass().getEStructuralFeature('text')
      if (textFeature) ut.eSet(textFeature, eGet(entry, 'text') || '-')
      eListAdd(newRule, 'inputEntry', ut)
    }

    // Copy output entries
    const sourceOutputs = getList(sourceRule, 'outputEntry')
    for (const entry of sourceOutputs) {
      const le = factory.create(getLiteralExpressionClass())
      const textFeature = le.eClass().getEStructuralFeature('text')
      if (textFeature) le.eSet(textFeature, eGet(entry, 'text') || '')
      eListAdd(newRule, 'outputEntry', le)
    }

    eListAdd(dt, 'rule', newRule)
    return newRule
  }

  function insertRuleAt(dt: EObject, ruleData: { inputEntries: string[], outputEntries: string[] }, afterIndex: number): EObject {
    const factory = getDmnFactory()
    const newRule = factory.create(getDecisionRuleClass())

    for (const text of ruleData.inputEntries) {
      const ut = factory.create(getUnaryTestsClass())
      const textFeature = ut.eClass().getEStructuralFeature('text')
      if (textFeature) ut.eSet(textFeature, text)
      eListAdd(newRule, 'inputEntry', ut)
    }

    for (const text of ruleData.outputEntries) {
      const le = factory.create(getLiteralExpressionClass())
      const textFeature = le.eClass().getEStructuralFeature('text')
      if (textFeature) le.eSet(textFeature, text)
      eListAdd(newRule, 'outputEntry', le)
    }

    // Add to list (appends at end for now, since EList doesn't have insert at index easily)
    eListAdd(dt, 'rule', newRule)

    // Move to correct position if needed
    const rules = getList(dt, 'rule')
    const currentIdx = rules.length - 1
    const targetIdx = Math.min(afterIndex + 1, rules.length - 1)
    if (currentIdx !== targetIdx) {
      moveRule(dt, currentIdx, targetIdx)
    }

    return newRule
  }

  function moveRule(dt: EObject, fromIdx: number, toIdx: number): void {
    if (fromIdx === toIdx) return
    const rawDt = toRaw(dt)
    const feature = rawDt.eClass().getEStructuralFeature('rule')
    if (!feature) return
    const list = toRaw(rawDt.eGet(feature))
    if (!list) return

    // Use EList.move if available, otherwise manual splice
    if (typeof (list as any).move === 'function') {
      (list as any).move(toIdx, fromIdx)
    } else if (Array.isArray(list) || (list as any)[Symbol.iterator]) {
      const arr = Array.isArray(list) ? list : Array.from(list as Iterable<any>)
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
    }
    dirty.value = true
    triggerUpdate()
  }

  // ============ Helpers ============

  function getList(obj: EObject, featureName: string): EObject[] {
    const rawObj = toRaw(obj)
    const feature = rawObj.eClass().getEStructuralFeature(featureName)
    if (!feature) return []
    const value = toRaw(rawObj.eGet(feature))
    if (!value) return []
    if (Array.isArray(value)) return value.map(v => toRaw(v))
    if ((value as any)[Symbol.iterator]) return Array.from(value as Iterable<any>).map(v => toRaw(v))
    return []
  }

  function selectDecision(decision: EObject | null): void {
    selectedDecision.value = decision ? toRaw(decision) : null
  }

  function reset(): void {
    resource.value = null
    selectedDecision.value = null
    dirty.value = false
    filePath.value = null
    fileHandle.value = null
    expandedKeys.value = {}
  }

  return {
    // State
    resource,
    selectedDecision,
    dirty,
    filePath,
    fileHandle,
    version,
    expandedKeys,

    // Computed
    rootDefinitions,
    treeNodes,

    // Resource operations
    createNewDefinitions,
    loadFromString,
    saveToString,
    saveToFile,
    saveAsFile,

    // Decision operations
    addDecision,
    removeDecision,
    addInputData,

    // Decision table operations
    getDecisionTable,
    addInputClause,
    addOutputClause,
    removeInputClause,
    removeOutputClause,
    addRule,
    removeRule,
    duplicateRule,
    insertRuleAt,
    moveRule,

    // Helpers
    eGet,
    eSet,
    getList,
    selectDecision,
    reset,
    triggerUpdate
  }
}

// ============ Shared Singleton ============

interface SharedState {
  instance: ReturnType<typeof useDmnEditor>
}

// Module-level singleton
let _sharedState: SharedState | null = null

function getOrCreateSharedState(): SharedState {
  if (_sharedState) return _sharedState

  _sharedState = {
    instance: useDmnEditor()
  }

  return _sharedState
}

export function useSharedDmnEditor(): ReturnType<typeof useDmnEditor> {
  const state = getOrCreateSharedState()
  return state.instance
}
