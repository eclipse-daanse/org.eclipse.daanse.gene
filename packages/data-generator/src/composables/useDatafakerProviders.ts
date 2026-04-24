/**
 * Datafaker-compatible providers for categories not available in Faker.js.
 * Data sourced from Datafaker's YAML definitions, converted to JSON.
 * Loaded asynchronously to avoid blocking startup.
 */

import { faker } from '@faker-js/faker'
import type { GeneratorInfo } from '../types'
import { useGeneratorRegistry } from './useGeneratorRegistry'

const STRING = 'EString'
const INT = 'EInt'
const DOUBLE = 'EDouble'

function pick(arr: string[]): string {
  return faker.helpers.arrayElement(arr)
}

function buildGenerators(category: string, data: Record<string, any>, prefix = ''): GeneratorInfo[] {
  const generators: GeneratorInfo[] = []
  const catLabel = category.charAt(0).toUpperCase() + category.slice(1)

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (Array.isArray(value) && value.length > 0) {
      const label = fullKey.replace(/_/g, ' ').replace(/\./g, ' > ').replace(/\b\w/g, c => c.toUpperCase())
      generators.push({
        key: `faker.${category}.${fullKey}`,
        label,
        category: catLabel,
        compatibleTypes: [STRING],
        generate: () => pick(value)
      })
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recurse into nested objects
      generators.push(...buildGenerators(category, value, fullKey))
    }
  }

  return generators
}

let loaded = false

/**
 * Load and register Datafaker-sourced providers asynchronously.
 * Safe to call multiple times — only loads once.
 */
export async function registerDatafakerProviders(): Promise<void> {
  if (loaded) return
  loaded = true

  const registry = useGeneratorRegistry()

  try {
    const [weather, computer, educator, demographic, medical] = await Promise.all([
      import('../data/weather.json').then(m => m.default || m),
      import('../data/computer.json').then(m => m.default || m),
      import('../data/educator.json').then(m => m.default || m),
      import('../data/demographic.json').then(m => m.default || m),
      import('../data/medical.json').then(m => m.default || m),
    ])

    const categories = [
      { name: 'weather', data: weather.weather },
      { name: 'computer', data: computer.computer },
      { name: 'educator', data: educator.educator },
      { name: 'demographic', data: demographic.demographic },
      { name: 'medical', data: medical.medical },
    ]

    let total = 0
    for (const { name, data } of categories) {
      if (!data) continue
      const gens = buildGenerators(name, data)
      registry.registerAll(gens)
      total += gens.length
    }

    console.log(`[DatafakerProviders] Registered ${total} generators from Datafaker data`)
  } catch (e) {
    console.warn('[DatafakerProviders] Failed to load Datafaker data:', e)
  }
}