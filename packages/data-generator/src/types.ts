/**
 * Data Generator Plugin - Types
 *
 * Re-exports generated EMF types from datagen.ecore
 * and adds runtime-only types not in the metamodel.
 */

// Re-export generated EMF types
export type {
  DataGenConfig,
  ClassGenConfig,
  AttributeGenConfig,
  ReferenceGenConfig,
  CustomGeneratorDef,
  DataGenResult
} from './generated/datagen'

export {
  ReferenceStrategy,
  DatagenFactory,
  DatagenPackage
} from './generated/datagen'

/** Generator registry entry (runtime only, not in ecore) */
export interface GeneratorInfo {
  key: string
  label: string
  category: string
  compatibleTypes: string[]
  argsSchema?: Record<string, any>
  generate: (args?: any, index?: number) => any
}

/** Generation result (runtime only, not in ecore) */
export interface GenerationResult {
  success: boolean
  instanceCount: number
  xmiContent: string
  errors: string[]
  log: string[]
}

/** Create a default DataGenConfig (plain object, not EMF instance) */
export function createDefaultConfig(name: string) {
  return {
    name,
    version: '1.0',
    description: '',
    seed: 0,
    locale: 'de',
    targetModelNsURIs: [] as string[],
    classConfigs: [] as any[],
    customGenerators: [] as any[]
  }
}

/** Create a default ClassGenConfig */
export function createDefaultClassConfig(contextClass: string) {
  return {
    contextClass,
    instanceCount: 10,
    enabled: true,
    attributeGens: [] as any[],
    referenceGens: [] as any[]
  }
}

/** Create a default AttributeGenConfig */
export function createDefaultAttributeGen(featureName: string, generatorKey: string = '') {
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
export function createDefaultReferenceGen(featureName: string) {
  return {
    featureName,
    strategy: 'RANDOM' as const,
    targetClassFilter: '',
    minCount: 0,
    maxCount: 1
  }
}
