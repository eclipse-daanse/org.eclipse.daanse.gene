/**
 * Data Generator Plugin - TypeScript Types
 *
 * Mirrors the datagen.ecore metamodel.
 */

/** Strategy for assigning reference targets */
export type ReferenceStrategy = 'RANDOM' | 'ROUND_ROBIN' | 'FIRST' | 'NONE'

/** Root container for a data generation configuration (.datagen file) */
export interface DataGenConfig {
  name: string
  version: string
  description: string
  seed: number
  locale: string
  targetModelNsURIs: string[]
  classConfigs: ClassGenConfig[]
  customGenerators: CustomGeneratorDef[]
}

/** Configuration for generating instances of a specific EClass */
export interface ClassGenConfig {
  contextClass: string
  instanceCount: number
  enabled: boolean
  attributeGens: AttributeGenConfig[]
  referenceGens: ReferenceGenConfig[]
}

/** Configuration for generating a single attribute value */
export interface AttributeGenConfig {
  featureName: string
  generatorKey: string
  generatorArgs: string
  unique: boolean
  staticValue: string
  template: string
}

/** Configuration for generating reference assignments */
export interface ReferenceGenConfig {
  featureName: string
  strategy: ReferenceStrategy
  targetClassFilter: string
  minCount: number
  maxCount: number
  isContainment: boolean
  childCount: number
  maxDepth: number
}

/** User-defined generator definition */
export interface CustomGeneratorDef {
  key: string
  label: string
  expression: string
  category: string
}

/** Result wrapper from remote DataGen (matches DataGenResult in datagen.ecore) */
export interface DataGenResult {
  results: any[] // EObject instances
}

/** Generator registry entry */
export interface GeneratorInfo {
  key: string
  label: string
  category: string
  compatibleTypes: string[]
  argsSchema?: Record<string, any>
  generate: (args?: any, index?: number) => any
}

/** Generation result */
export interface GenerationResult {
  success: boolean
  instanceCount: number
  xmiContent: string
  errors: string[]
  log: string[]
}

/** Create a default DataGenConfig */
export function createDefaultConfig(name: string): DataGenConfig {
  return {
    name,
    version: '1.0',
    description: '',
    seed: 0,
    locale: 'de',
    targetModelNsURIs: [],
    classConfigs: [],
    customGenerators: []
  }
}

/** Create a default ClassGenConfig */
export function createDefaultClassConfig(contextClass: string): ClassGenConfig {
  return {
    contextClass,
    instanceCount: 10,
    enabled: true,
    attributeGens: [],
    referenceGens: []
  }
}

/** Create a default AttributeGenConfig */
export function createDefaultAttributeGen(featureName: string, generatorKey: string = ''): AttributeGenConfig {
  return {
    featureName,
    generatorKey,
    generatorArgs: '',
    unique: false,
    staticValue: '',
    template: ''
  }
}

/** Create a default ReferenceGenConfig */
export function createDefaultReferenceGen(featureName: string, isContainment: boolean = false): ReferenceGenConfig {
  return {
    featureName,
    strategy: isContainment ? 'NONE' : 'RANDOM',
    targetClassFilter: '',
    minCount: isContainment ? 0 : 0,
    maxCount: isContainment ? 0 : 1,
    isContainment,
    childCount: isContainment ? 2 : 0,
    maxDepth: isContainment ? 3 : 0
  }
}
