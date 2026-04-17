/**
 * Instance Generator Engine
 *
 * Generates EMF instances from a DataGenConfig using FakerJS.
 * Supports recursive containment-based generation and nested XMI output.
 */

import { faker } from '@faker-js/faker'
import type {
  DataGenConfig,
  ClassGenConfig,
  AttributeGenConfig,
  ReferenceGenConfig,
  GenerationResult,
  ReferenceStrategy
} from '../types'
import { useGeneratorRegistry } from './useGeneratorRegistry'
import { setFakerLocale, setFakerSeed } from './useFakerProviders'

/** Escape XML special characters */
function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Generated instance with attributes, cross-references, and containment children */
interface GeneratedInstance {
  classConfig: ClassGenConfig
  eClass: any
  index: number
  attributes: Record<string, any>
  crossReferences: Record<string, number[]>
  children: Record<string, GeneratedInstance[]>
  xmiId: string
}

/** Counter for generating unique XMI IDs */
let idCounter = 0

function nextXmiId(className: string): string {
  return `_${className.replace(/\./g, '_')}_${idCounter++}`
}

/**
 * Find an EClass by qualified context class name (e.g. "pkg.ClassName")
 */
function findEClassByName(contextClass: string, modelRegistry: any): any | null {
  const allPkgs = modelRegistry.allPackages?.value || []
  const lastDot = contextClass.lastIndexOf('.')
  const className = lastDot >= 0 ? contextClass.substring(lastDot + 1) : contextClass

  for (const pkgInfo of allPkgs) {
    const found = searchClassInPackage(pkgInfo.ePackage, '', contextClass, className)
    if (found) return found
  }
  return null
}

function searchClassInPackage(pkg: any, prefix: string, target: string, className: string): any | null {
  const pkgName = pkg.getName?.() || ''
  const fullPrefix = prefix ? `${prefix}.${pkgName}` : pkgName

  const classifiers = pkg.getEClassifiers?.() || []
  for (const cls of Array.from(classifiers) as any[]) {
    const n = (cls as any).getName?.()
    if (n === className && `${fullPrefix}.${n}` === target) return cls
  }

  const subs = pkg.getESubpackages?.() || []
  for (const sub of Array.from(subs)) {
    const found = searchClassInPackage(sub, fullPrefix, target, className)
    if (found) return found
  }
  return null
}

/**
 * Guess a good default generator key based on attribute name and type
 */
function guessGenerator(name: string, typeName: string): string {
  const n = name.toLowerCase()

  if (typeName === 'EString') {
    if (n.includes('firstname') || n === 'vorname') return 'faker.person.firstName'
    if (n.includes('lastname') || n === 'nachname') return 'faker.person.lastName'
    if (n.includes('name') && !n.includes('first') && !n.includes('last')) return 'faker.person.fullName'
    if (n.includes('email') || n.includes('mail')) return 'faker.internet.email'
    if (n.includes('phone') || n.includes('tel')) return 'faker.phone.number'
    if (n.includes('city') || n === 'ort' || n === 'stadt') return 'faker.location.city'
    if (n.includes('country') || n === 'land') return 'faker.location.country'
    if (n.includes('street') || n === 'strasse') return 'faker.location.street'
    if (n.includes('zip') || n === 'plz') return 'faker.location.zipCode'
    if (n.includes('url') || n.includes('website')) return 'faker.internet.url'
    if (n.includes('company') || n === 'firma') return 'faker.company.name'
    if (n.includes('title') || n === 'titel') return 'faker.person.jobTitle'
    if (n.includes('desc') || n.includes('beschreibung')) return 'faker.lorem.sentence'
    if (n.includes('uuid') || n === 'id') return 'faker.string.uuid'
    if (n.includes('user')) return 'faker.internet.username'
    if (n.includes('gender') || n === 'geschlecht') return 'faker.person.gender'
    return 'faker.lorem.word'
  }

  if (typeName === 'EInt' || typeName === 'ELong' || typeName === 'EShort') return 'faker.number.int'
  if (typeName === 'EFloat' || typeName === 'EDouble') return 'faker.number.float'
  if (typeName === 'EBoolean') return 'faker.datatype.boolean'
  if (typeName === 'EDate') return 'faker.date.past'

  return 'faker.lorem.word'
}

/**
 * Run the generation algorithm and return XMI output
 */
export function generateInstances(
  genConfig: DataGenConfig,
  modelRegistry: any,
  onProgress?: (msg: string, pct: number) => void
): GenerationResult {
  const log: string[] = []
  const errors: string[] = []
  const registry = useGeneratorRegistry()

  // Reset ID counter
  idCounter = 0

  // Configure faker
  setFakerLocale(genConfig.locale || 'de')
  setFakerSeed(genConfig.seed || 0)

  log.push(`Locale: ${genConfig.locale}, Seed: ${genConfig.seed || 'random'}`)

  // Filter enabled configs
  const activeConfigs = genConfig.classConfigs.filter(c => c.enabled)
  if (activeConfigs.length === 0) {
    return { success: false, instanceCount: 0, xmiContent: '', errors: ['No enabled class configs'], log }
  }

  // Register custom generators from config
  for (const custom of genConfig.customGenerators) {
    try {
      const fn = new Function('faker', 'index', `return ${custom.expression}`)
      registry.register({
        key: custom.key,
        label: custom.label,
        category: custom.category || 'Custom',
        compatibleTypes: ['*'],
        generate: (args, index) => fn(faker, index)
      })
      log.push(`Registered custom generator: ${custom.key}`)
    } catch (e: any) {
      errors.push(`Failed to register custom generator ${custom.key}: ${e.message}`)
    }
  }

  // Phase 1: Recursive instance generation (depth-first)
  const rootInstances: Map<string, GeneratedInstance[]> = new Map()
  const allInstances: GeneratedInstance[] = [] // flat list for cross-ref resolution
  let totalInstances = 0

  for (const cc of activeConfigs) {
    onProgress?.(`Generating ${cc.contextClass}...`, (totalInstances / getTotalCount(activeConfigs)) * 70)

    const eClass = findEClassByName(cc.contextClass, modelRegistry)
    if (!eClass) {
      log.push(`Warning: Could not find EClass for ${cc.contextClass}`)
    }

    const instances: GeneratedInstance[] = []

    for (let i = 0; i < cc.instanceCount; i++) {
      const className = cc.contextClass.split('.').pop() || cc.contextClass
      const inst = generateSingleInstance(cc, eClass, i, className, registry, modelRegistry, errors, log, 0)
      instances.push(inst)
      collectAllInstances(inst, allInstances)
    }

    rootInstances.set(cc.contextClass, instances)
    totalInstances += allInstances.length
    log.push(`Generated ${instances.length} root instances of ${cc.contextClass}`)
  }

  // Phase 2: Resolve cross-references
  onProgress?.('Resolving cross-references...', 85)

  // Build a flat pool grouped by class name for cross-ref resolution
  const pool: Map<string, GeneratedInstance[]> = new Map()
  for (const inst of allInstances) {
    const key = inst.classConfig.contextClass
    if (!pool.has(key)) pool.set(key, [])
    pool.get(key)!.push(inst)
  }

  for (const cc of activeConfigs) {
    const instances = rootInstances.get(cc.contextClass) || []
    for (const rg of cc.referenceGens) {
      if (rg.isContainment) continue // containment already handled in Phase 1

      const targetClass = rg.targetClassFilter || guessTargetClass(rg.featureName, activeConfigs)
      const targetPool = targetClass ? pool.get(targetClass) : null

      if (!targetPool || targetPool.length === 0) {
        log.push(`No targets for ${cc.contextClass}.${rg.featureName} (target: ${targetClass || 'unknown'})`)
        continue
      }

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i]
        const refs = resolveReferences(rg, targetPool, i, instances.length)
        if (refs.length > 0) {
          inst.crossReferences[rg.featureName] = refs
        }
      }
    }
  }

  // Phase 3: Serialize to nested XMI
  onProgress?.('Serializing to XMI...', 95)

  const nsURIs = genConfig.targetModelNsURIs
  const xmiContent = serializeToXmi(rootInstances, pool, nsURIs, activeConfigs)

  log.push(`XMI serialization complete. Total instances: ${allInstances.length}`)
  onProgress?.('Done', 100)

  return {
    success: errors.length === 0,
    instanceCount: allInstances.length,
    xmiContent,
    errors,
    log
  }
}

/**
 * Generate a single instance with attributes and recursively generate containment children
 */
function generateSingleInstance(
  classConfig: ClassGenConfig,
  eClass: any,
  index: number,
  className: string,
  registry: ReturnType<typeof useGeneratorRegistry>,
  modelRegistry: any,
  errors: string[],
  log: string[],
  currentDepth: number
): GeneratedInstance {
  const attrs: Record<string, any> = {}

  // Generate attributes from config
  for (const ag of classConfig.attributeGens) {
    try {
      attrs[ag.featureName] = generateAttributeValue(ag, registry, index)
    } catch (e: any) {
      errors.push(`Error generating ${classConfig.contextClass}.${ag.featureName} [${index}]: ${e.message}`)
    }
  }

  const inst: GeneratedInstance = {
    classConfig,
    eClass,
    index,
    attributes: attrs,
    crossReferences: {},
    children: {},
    xmiId: nextXmiId(className)
  }

  // Recursively generate containment children
  for (const rg of classConfig.referenceGens) {
    if (!rg.isContainment) continue
    if (rg.childCount <= 0) continue
    if (currentDepth >= rg.maxDepth) continue

    // Find the EReference on the EClass to get the target type
    const targetEClass = findContainmentTargetEClass(eClass, rg.featureName)
    if (!targetEClass) {
      log.push(`Could not resolve containment target for ${classConfig.contextClass}.${rg.featureName}`)
      continue
    }

    const targetClassName = targetEClass.getName?.() || rg.featureName
    const childInstances: GeneratedInstance[] = []

    // Build a temporary ClassGenConfig for the child type
    const childClassConfig = buildChildClassConfig(targetEClass, rg, classConfig.contextClass)

    for (let ci = 0; ci < rg.childCount; ci++) {
      const child = generateSingleInstance(
        childClassConfig,
        targetEClass,
        ci,
        targetClassName,
        registry,
        modelRegistry,
        errors,
        log,
        currentDepth + 1
      )
      childInstances.push(child)
    }

    inst.children[rg.featureName] = childInstances
  }

  return inst
}

/**
 * Find the target EClass for a containment reference by feature name
 */
function findContainmentTargetEClass(eClass: any, featureName: string): any | null {
  if (!eClass) return null

  const refs = eClass.getEAllReferences?.() || eClass.getEReferences?.() || []
  for (const ref of Array.from(refs) as any[]) {
    const name = ref.getName?.()
    if (name === featureName) {
      return ref.getEReferenceType?.() || ref.getEType?.() || null
    }
  }
  return null
}

/**
 * Build a ClassGenConfig for a child EClass based on its attributes
 */
function buildChildClassConfig(targetEClass: any, parentRefConfig: ReferenceGenConfig, parentContextClass: string): ClassGenConfig {
  const targetName = targetEClass.getName?.() || 'Child'
  const attributeGens: AttributeGenConfig[] = []
  const referenceGens: ReferenceGenConfig[] = []

  // Auto-detect attributes from the target EClass
  const attrs = targetEClass.getEAllAttributes?.() || targetEClass.getEAttributes?.() || []
  for (const attr of Array.from(attrs) as any[]) {
    const name = attr.getName?.()
    if (!name) continue

    const typeName = attr.getEType?.()?.getName?.() || 'EString'
    const generatorKey = guessGenerator(name, typeName)

    attributeGens.push({
      featureName: name,
      generatorKey,
      generatorArgs: '',
      unique: false,
      staticValue: '',
      template: ''
    })
  }

  // Auto-detect containment references for recursive generation
  const refs = targetEClass.getEAllReferences?.() || targetEClass.getEReferences?.() || []
  for (const ref of Array.from(refs) as any[]) {
    const name = ref.getName?.()
    if (!name) continue
    if (!ref.isContainment?.()) continue

    referenceGens.push({
      featureName: name,
      strategy: 'NONE',
      targetClassFilter: '',
      minCount: 0,
      maxCount: 0,
      isContainment: true,
      childCount: parentRefConfig.childCount,
      maxDepth: parentRefConfig.maxDepth
    })
  }

  return {
    contextClass: `${parentContextClass.split('.')[0]}.${targetName}`,
    instanceCount: 0, // not used for children
    enabled: true,
    attributeGens,
    referenceGens
  }
}

/**
 * Collect all instances (root + nested children) into a flat list
 */
function collectAllInstances(inst: GeneratedInstance, list: GeneratedInstance[]): void {
  list.push(inst)
  for (const children of Object.values(inst.children)) {
    for (const child of children) {
      collectAllInstances(child, list)
    }
  }
}

/**
 * Generate a single attribute value
 */
function generateAttributeValue(ag: AttributeGenConfig, registry: ReturnType<typeof useGeneratorRegistry>, index: number): any {
  if (ag.staticValue) {
    return ag.staticValue
  }

  if (ag.template) {
    return ag.template.replace(/#\{([^}]+)\}/g, (_match, key) => {
      const gen = registry.get(key.trim())
      if (gen) {
        return String(gen.generate(undefined, index))
      }
      return key
    })
  }

  const gen = registry.get(ag.generatorKey)
  if (!gen) {
    return `[Unknown: ${ag.generatorKey}]`
  }

  let args: any = undefined
  if (ag.generatorArgs) {
    try {
      args = JSON.parse(ag.generatorArgs)
    } catch {
      // Ignore parse errors
    }
  }

  return gen.generate(args, index)
}

/**
 * Resolve references using the chosen strategy
 */
function resolveReferences(
  rg: ReferenceGenConfig,
  targetPool: GeneratedInstance[],
  instanceIndex: number,
  _totalInstances: number
): number[] {
  if (rg.strategy === 'NONE') return []

  const count = rg.minCount + Math.floor(Math.random() * (rg.maxCount - rg.minCount + 1))
  if (count <= 0) return []

  const refs: number[] = []
  const poolSize = targetPool.length

  switch (rg.strategy as ReferenceStrategy) {
    case 'RANDOM':
      for (let i = 0; i < count && i < poolSize; i++) {
        let idx: number
        do {
          idx = Math.floor(Math.random() * poolSize)
        } while (refs.includes(idx) && refs.length < poolSize)
        if (!refs.includes(idx)) refs.push(idx)
      }
      break

    case 'ROUND_ROBIN':
      for (let i = 0; i < count && i < poolSize; i++) {
        refs.push((instanceIndex + i) % poolSize)
      }
      break

    case 'FIRST':
      refs.push(0)
      break

    case 'NONE':
      break
  }

  return refs
}

/**
 * Guess the target class from a reference name
 */
function guessTargetClass(refName: string, configs: ClassGenConfig[]): string | null {
  const lower = refName.toLowerCase()
  for (const cc of configs) {
    const className = cc.contextClass.split('.').pop()?.toLowerCase() || ''
    if (lower.includes(className) || className.includes(lower)) {
      return cc.contextClass
    }
  }
  return configs.length > 0 ? configs[0].contextClass : null
}

/**
 * Get total instance count across all configs
 */
function getTotalCount(configs: ClassGenConfig[]): number {
  return configs.reduce((sum, c) => sum + c.instanceCount, 0)
}

/**
 * Resolve the nsPrefix and nsURI from an EClass's EPackage
 */
function resolveNsInfo(eClass: any): { nsPrefix: string, nsURI: string } | null {
  if (!eClass) return null
  const pkg = eClass.getEPackage?.()
  if (!pkg) return null
  const nsPrefix = pkg.getNsPrefix?.() || pkg.getName?.() || ''
  const nsURI = pkg.getNsURI?.() || ''
  if (nsPrefix && nsURI) return { nsPrefix, nsURI }
  return null
}

/**
 * Serialize generated instances to nested XMI
 */
function serializeToXmi(
  rootInstances: Map<string, GeneratedInstance[]>,
  pool: Map<string, GeneratedInstance[]>,
  nsURIs: string[],
  configs: ClassGenConfig[]
): string {
  const lines: string[] = []

  lines.push('<?xml version="1.0" encoding="UTF-8"?>')

  // Resolve namespace info from the first root instance's EClass
  let nsPrefix = 'data'
  let nsURI = nsURIs[0] || ''

  // Try to get real nsPrefix/nsURI from EPackage
  for (const cc of configs) {
    const instances = rootInstances.get(cc.contextClass) || []
    if (instances.length > 0 && instances[0].eClass) {
      const info = resolveNsInfo(instances[0].eClass)
      if (info) {
        nsPrefix = info.nsPrefix
        if (!nsURI) nsURI = info.nsURI
        break
      }
    }
  }

  if (!nsURI) nsURI = `http://generated/${nsPrefix}`

  lines.push(`<xmi:XMI xmi:version="2.0"`)
  lines.push(`    xmlns:xmi="http://www.omg.org/XMI"`)
  lines.push(`    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`)
  lines.push(`    xmlns:${nsPrefix}="${escapeXml(nsURI)}">`)

  // Emit root instances
  for (const cc of configs) {
    const instances = rootInstances.get(cc.contextClass) || []
    const className = cc.contextClass.split('.').pop() || cc.contextClass

    for (const inst of instances) {
      serializeInstance(inst, `${nsPrefix}:${className}`, nsPrefix, pool, lines, '  ')
    }
  }

  lines.push('</xmi:XMI>')
  return lines.join('\n')
}

/**
 * Serialize a single instance (and its containment children) to XMI lines
 */
function serializeInstance(
  inst: GeneratedInstance,
  tagName: string,
  nsPrefix: string,
  pool: Map<string, GeneratedInstance[]>,
  lines: string[],
  indent: string
): void {
  const attrStr = Object.entries(inst.attributes)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(' ')

  const hasChildren = Object.keys(inst.children).length > 0
  const hasCrossRefs = Object.keys(inst.crossReferences).length > 0

  if (!hasChildren && !hasCrossRefs) {
    // Self-closing element
    const attrs = attrStr ? ` ${attrStr}` : ''
    lines.push(`${indent}<${tagName} xmi:id="${inst.xmiId}"${attrs}/>`)
  } else {
    const attrs = attrStr ? ` ${attrStr}` : ''
    lines.push(`${indent}<${tagName} xmi:id="${inst.xmiId}"${attrs}>`)

    // Emit containment children as nested elements with xsi:type
    for (const [refName, children] of Object.entries(inst.children)) {
      for (const child of children) {
        // Get the child's EClass name for xsi:type
        const childClassName = child.eClass?.getName?.() || child.classConfig.contextClass.split('.').pop() || 'Unknown'
        // Resolve child nsPrefix from its own EPackage (may differ from parent)
        const childNsInfo = child.eClass ? resolveNsInfo(child.eClass) : null
        const childNsPrefix = childNsInfo?.nsPrefix || nsPrefix
        const typeAttr = `xsi:type="${childNsPrefix}:${childClassName}"`
        serializeInstanceWithType(child, refName, typeAttr, childNsPrefix, pool, lines, indent + '  ')
      }
    }

    // Emit cross-references as href elements
    for (const [refName, refIndices] of Object.entries(inst.crossReferences)) {
      for (const refIdx of refIndices) {
        const targetClass = inst.classConfig.referenceGens.find(r => r.featureName === refName)?.targetClassFilter
        const targetPoolKey = targetClass || guessTargetClassFromPool(refName, pool)
        const targetPool = targetPoolKey ? pool.get(targetPoolKey) : null

        if (targetPool && refIdx < targetPool.length) {
          lines.push(`${indent}  <${refName} href="#${targetPool[refIdx].xmiId}"/>`)
        }
      }
    }

    lines.push(`${indent}</${tagName}>`)
  }
}

/**
 * Serialize a containment child instance with xsi:type attribute
 */
function serializeInstanceWithType(
  inst: GeneratedInstance,
  tagName: string,
  typeAttr: string,
  nsPrefix: string,
  pool: Map<string, GeneratedInstance[]>,
  lines: string[],
  indent: string
): void {
  const attrStr = Object.entries(inst.attributes)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(' ')

  const hasChildren = Object.keys(inst.children).length > 0
  const hasCrossRefs = Object.keys(inst.crossReferences).length > 0

  if (!hasChildren && !hasCrossRefs) {
    const attrs = attrStr ? ` ${attrStr}` : ''
    lines.push(`${indent}<${tagName} ${typeAttr} xmi:id="${inst.xmiId}"${attrs}/>`)
  } else {
    const attrs = attrStr ? ` ${attrStr}` : ''
    lines.push(`${indent}<${tagName} ${typeAttr} xmi:id="${inst.xmiId}"${attrs}>`)

    // Emit containment children as nested elements with xsi:type
    for (const [refName, children] of Object.entries(inst.children)) {
      for (const child of children) {
        const childClassName = child.eClass?.getName?.() || child.classConfig.contextClass.split('.').pop() || 'Unknown'
        const childNsInfo = child.eClass ? resolveNsInfo(child.eClass) : null
        const childNsPrefix = childNsInfo?.nsPrefix || nsPrefix
        const childTypeAttr = `xsi:type="${childNsPrefix}:${childClassName}"`
        serializeInstanceWithType(child, refName, childTypeAttr, childNsPrefix, pool, lines, indent + '  ')
      }
    }

    // Emit cross-references
    for (const [refName, refIndices] of Object.entries(inst.crossReferences)) {
      for (const refIdx of refIndices) {
        const targetClass = inst.classConfig.referenceGens.find(r => r.featureName === refName)?.targetClassFilter
        const targetPoolKey = targetClass || guessTargetClassFromPool(refName, pool)
        const targetPool = targetPoolKey ? pool.get(targetPoolKey) : null

        if (targetPool && refIdx < targetPool.length) {
          lines.push(`${indent}  <${refName} href="#${targetPool[refIdx].xmiId}"/>`)
        }
      }
    }

    lines.push(`${indent}</${tagName}>`)
  }
}

/**
 * Guess target class from available pool keys
 */
function guessTargetClassFromPool(refName: string, pool: Map<string, GeneratedInstance[]>): string | null {
  const lower = refName.toLowerCase()
  for (const key of pool.keys()) {
    const className = key.split('.').pop()?.toLowerCase() || ''
    if (lower.includes(className) || className.includes(lower)) {
      return key
    }
  }
  return null
}
