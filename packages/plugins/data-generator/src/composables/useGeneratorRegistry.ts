/**
 * Generator Registry
 *
 * Extensible registry of data generators. Each generator has a key,
 * label, category, compatible EDataTypes, and a generate function.
 */

import { ref, computed } from 'tsm:vue'
import type { GeneratorInfo } from '../types'

const registry = ref<Map<string, GeneratorInfo>>(new Map())

/**
 * Composable for the generator registry (singleton)
 */
export function useGeneratorRegistry() {
  /**
   * Register a generator
   */
  function register(info: GeneratorInfo) {
    registry.value.set(info.key, info)
  }

  /**
   * Register multiple generators at once
   */
  function registerAll(infos: GeneratorInfo[]) {
    for (const info of infos) {
      registry.value.set(info.key, info)
    }
  }

  /**
   * Get a generator by key
   */
  function get(key: string): GeneratorInfo | undefined {
    return registry.value.get(key)
  }

  /**
   * Get all generators compatible with a given EDataType name
   */
  function getForType(eTypeName: string): GeneratorInfo[] {
    const results: GeneratorInfo[] = []
    for (const info of registry.value.values()) {
      if (info.compatibleTypes.includes(eTypeName) || info.compatibleTypes.includes('*')) {
        results.push(info)
      }
    }
    return results.sort((a, b) => a.label.localeCompare(b.label))
  }

  /**
   * Full-text search across keys and labels
   */
  function search(query: string): GeneratorInfo[] {
    if (!query) return allGenerators.value
    const q = query.toLowerCase()
    return allGenerators.value.filter(info =>
      info.key.toLowerCase().includes(q) ||
      info.label.toLowerCase().includes(q) ||
      info.category.toLowerCase().includes(q)
    )
  }

  /**
   * All registered generators
   */
  const allGenerators = computed((): GeneratorInfo[] => {
    return Array.from(registry.value.values()).sort((a, b) => {
      const catCmp = a.category.localeCompare(b.category)
      return catCmp !== 0 ? catCmp : a.label.localeCompare(b.label)
    })
  })

  /**
   * All categories
   */
  const categories = computed((): string[] => {
    const cats = new Set<string>()
    for (const info of registry.value.values()) {
      cats.add(info.category)
    }
    return Array.from(cats).sort()
  })

  /**
   * Generators grouped by category
   */
  const byCategory = computed((): Record<string, GeneratorInfo[]> => {
    const groups: Record<string, GeneratorInfo[]> = {}
    for (const info of allGenerators.value) {
      if (!groups[info.category]) groups[info.category] = []
      groups[info.category].push(info)
    }
    return groups
  })

  return {
    register,
    registerAll,
    get,
    getForType,
    search,
    allGenerators,
    categories,
    byCategory
  }
}
