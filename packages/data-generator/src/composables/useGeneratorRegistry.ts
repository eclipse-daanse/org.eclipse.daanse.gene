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

  // Alias map: Java Datafaker keys → Faker.js keys
  const KEY_ALIASES: Record<string, string> = {
    'faker.address.street': 'faker.location.street', 'faker.address.streetName': 'faker.location.street',
    'faker.address.city': 'faker.location.city', 'faker.address.cityName': 'faker.location.city',
    'faker.address.zipCode': 'faker.location.zipCode', 'faker.address.postcode': 'faker.location.zipCode',
    'faker.address.country': 'faker.location.country', 'faker.address.countryCode': 'faker.location.countryCode',
    'faker.address.state': 'faker.location.state', 'faker.address.stateAbbr': 'faker.location.state',
    'faker.address.buildingNumber': 'faker.location.buildingNumber',
    'faker.address.fullAddress': 'faker.location.streetAddress',
    'faker.address.latitude': 'faker.location.latitude', 'faker.address.longitude': 'faker.location.longitude',
    'faker.aviation.airport': 'faker.airline.airport', 'faker.aviation.aircraft': 'faker.airline.airplane',
    'faker.aviation.iata': 'faker.airline.airport',
    'faker.currency.name': 'faker.finance.currencyName', 'faker.currency.code': 'faker.finance.currencyCode',
    'faker.country.name': 'faker.location.country', 'faker.country.capital': 'faker.location.city',
    'faker.country.code2': 'faker.location.countryCode', 'faker.country.code3': 'faker.location.countryCode',
    'faker.job.title': 'faker.person.jobTitle', 'faker.job.field': 'faker.person.jobArea',
    'faker.job.position': 'faker.person.jobType', 'faker.job.keySkill': 'faker.word.noun',
    'faker.demographic.sex': 'faker.person.sex',
    'faker.file.fileName': 'faker.system.fileName', 'faker.file.extension': 'faker.system.fileExt',
    'faker.file.mimeType': 'faker.system.mimeType',
    'faker.code.isbn10': 'faker.commerce.isbn', 'faker.code.isbn13': 'faker.commerce.isbn',
    'faker.internet.ipAddress': 'faker.internet.ip', 'faker.internet.ipV6Address': 'faker.internet.ipv6',
    'faker.internet.macAddress': 'faker.internet.mac', 'faker.internet.uuid': 'faker.string.uuid',
    'faker.internet.safeEmail': 'faker.internet.email',
    'faker.color.name': 'faker.color.human', 'faker.color.hex': 'faker.color.rgb',
    'faker.finance.creditCard': 'faker.finance.creditCardNumber',
    'faker.animal.name': 'faker.animal.petName', 'faker.animal.species': 'faker.animal.type',
    'faker.phone.cellPhone': 'faker.phone.number',
    'faker.space.planet': 'faker.science.unit', 'faker.educator.university': 'faker.company.name',
    'faker.app.name': 'faker.commerce.productName', 'faker.app.version': 'faker.system.semver',
    'faker.music.instrument': 'faker.music.songName',
    'faker.date.birthday': 'faker.date.birthdate',
    'faker.person.title': 'faker.person.jobTitle',
    'faker.person.username': 'faker.internet.username',
    'faker.company.industry': 'faker.commerce.department',
    'faker.company.buzzword': 'faker.company.buzzPhrase',
    'faker.company.bs': 'faker.company.buzzPhrase',
    'faker.company.url': 'faker.internet.url',
    'faker.company.logo': 'faker.image.url',
    'faker.lorem.characters': 'faker.string.alpha',
    'faker.number.digit': 'faker.number.singleDigit',
    'faker.number.randomDigit': 'faker.number.singleDigit',
    'faker.commerce.material': 'faker.commerce.productMaterial',
    'faker.app.author': 'faker.person.fullName',
    'faker.computer.operatingSystem': 'faker.computer.platform',
    'faker.educator.course': 'faker.educator.tertiary.degree.subject',
    'faker.educator.campus': 'faker.educator.name',
    'faker.medical.medicineName': 'faker.medical.medicine_name',
    'faker.medical.diseaseName': 'faker.medical.disease_name',
    'faker.medical.hospitalName': 'faker.medical.hospital_name',
    'faker.demographic.maritalStatus': 'faker.demographic.marital_status',
  }

  /**
   * Get a generator by key (with alias resolution for Java Datafaker compatibility)
   */
  function get(key: string): GeneratorInfo | undefined {
    return registry.value.get(key) || registry.value.get(KEY_ALIASES[key] || '')
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
