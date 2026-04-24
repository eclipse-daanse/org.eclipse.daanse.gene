/**
 * Data Generator State Management (Singleton)
 *
 * Manages the current DataGenConfig, selected class,
 * and provides load/save operations.
 */

import { ref, computed } from 'tsm:vue'
import type {
  DataGenConfig,
  ClassGenConfig,
  AttributeGenConfig,
  ReferenceGenConfig
} from '../types'
import {
  createDefaultConfig,
  createDefaultClassConfig,
  createDefaultAttributeGen,
  createDefaultReferenceGen
} from '../types'

// Singleton state
const config = ref<DataGenConfig | null>(null)
const selectedClassIndex = ref<number>(-1)
const isDirty = ref(false)
const filePath = ref<string | null>(null)
let fileEntry: any = null

/**
 * State management composable for the Data Generator
 */
export function useDataGenerator() {
  const selectedClassConfig = computed((): ClassGenConfig | null => {
    if (!config.value || selectedClassIndex.value < 0) return null
    return config.value.classConfigs[selectedClassIndex.value] || null
  })

  /**
   * Create a new config
   */
  function newConfig(name: string = 'New Config') {
    config.value = createDefaultConfig(name)
    selectedClassIndex.value = -1
    isDirty.value = true
    filePath.value = null
    fileEntry = null
  }

  /**
   * Load a config from parsed data
   */
  function loadConfig(data: DataGenConfig, path?: string, entry?: any) {
    config.value = data
    selectedClassIndex.value = data.classConfigs.length > 0 ? 0 : -1
    isDirty.value = false
    filePath.value = path || null
    fileEntry = entry || null
  }

  /**
   * Add a class config
   */
  function addClassConfig(contextClass: string) {
    if (!config.value) return
    // Don't add duplicates
    if (config.value.classConfigs.some(c => c.contextClass === contextClass)) return

    const classConfig = createDefaultClassConfig(contextClass)
    config.value.classConfigs.push(classConfig)
    selectedClassIndex.value = config.value.classConfigs.length - 1
    isDirty.value = true
  }

  /**
   * Remove a class config
   */
  function removeClassConfig(index: number) {
    if (!config.value) return
    config.value.classConfigs.splice(index, 1)
    if (selectedClassIndex.value >= config.value.classConfigs.length) {
      selectedClassIndex.value = config.value.classConfigs.length - 1
    }
    isDirty.value = true
  }

  /**
   * Select a class config by index
   */
  function selectClass(index: number) {
    selectedClassIndex.value = index
  }

  /**
   * Update a class config field
   */
  function updateClassConfig(index: number, updates: Partial<ClassGenConfig>) {
    if (!config.value) return
    const cc = config.value.classConfigs[index]
    if (!cc) return
    Object.assign(cc, updates)
    isDirty.value = true
  }

  /**
   * Add an attribute generator to a class config
   */
  function addAttributeGen(classIndex: number, featureName: string, generatorKey: string = '') {
    if (!config.value) return
    const cc = config.value.classConfigs[classIndex]
    if (!cc) return
    // Don't add duplicates
    if (cc.attributeGens.some(a => a.featureName === featureName)) return

    cc.attributeGens.push(createDefaultAttributeGen(featureName, generatorKey))
    isDirty.value = true
  }

  /**
   * Update an attribute generator
   */
  function updateAttributeGen(classIndex: number, attrIndex: number, updates: Partial<AttributeGenConfig>) {
    if (!config.value) return
    const cc = config.value.classConfigs[classIndex]
    if (!cc) return
    const ag = cc.attributeGens[attrIndex]
    if (!ag) return
    Object.assign(ag, updates)
    isDirty.value = true
  }

  /**
   * Remove an attribute generator
   */
  function removeAttributeGen(classIndex: number, attrIndex: number) {
    if (!config.value) return
    const cc = config.value.classConfigs[classIndex]
    if (!cc) return
    cc.attributeGens.splice(attrIndex, 1)
    isDirty.value = true
  }

  /**
   * Add a reference generator to a class config
   */
  function addReferenceGen(classIndex: number, featureName: string) {
    if (!config.value) return
    const cc = config.value.classConfigs[classIndex]
    if (!cc) return
    if (cc.referenceGens.some(r => r.featureName === featureName)) return

    cc.referenceGens.push(createDefaultReferenceGen(featureName))
    isDirty.value = true
  }

  /**
   * Update a reference generator
   */
  function updateReferenceGen(classIndex: number, refIndex: number, updates: Partial<ReferenceGenConfig>) {
    if (!config.value) return
    const cc = config.value.classConfigs[classIndex]
    if (!cc) return
    const rg = cc.referenceGens[refIndex]
    if (!rg) return
    Object.assign(rg, updates)
    isDirty.value = true
  }

  /**
   * Remove a reference generator
   */
  function removeReferenceGen(classIndex: number, refIndex: number) {
    if (!config.value) return
    const cc = config.value.classConfigs[classIndex]
    if (!cc) return
    cc.referenceGens.splice(refIndex, 1)
    isDirty.value = true
  }

  /**
   * Auto-configure a class: detect attributes and references from the EClass
   * and add default generators
   */
  function autoConfigureClass(classIndex: number, eClass: any) {
    if (!config.value) return
    const cc = config.value.classConfigs[classIndex]
    if (!cc) return

    // Auto-configure attributes
    const attrs = eClass.getEAllAttributes?.() || eClass.getEAttributes?.() || []
    for (const attr of Array.from(attrs) as any[]) {
      const name = attr.getName?.()
      if (!name) continue
      if (cc.attributeGens.some(a => a.featureName === name)) continue

      const typeName = attr.getEType?.()?.getName?.() || 'EString'
      const generatorKey = guessGenerator(name, typeName)
      cc.attributeGens.push(createDefaultAttributeGen(name, generatorKey))
    }

    // Auto-configure references (both containment and cross-references)
    const refs = eClass.getEAllReferences?.() || eClass.getEReferences?.() || []
    for (const ref of Array.from(refs) as any[]) {
      const name = ref.getName?.()
      if (!name) continue
      if (cc.referenceGens.some(r => r.featureName === name)) continue

      cc.referenceGens.push(createDefaultReferenceGen(name))
    }

    isDirty.value = true
  }

  /**
   * Mark config as dirty
   */
  function markDirty() {
    isDirty.value = true
  }

  /**
   * Mark config as saved
   */
  function markSaved() {
    isDirty.value = false
  }

  /**
   * Get the file entry for saving
   */
  function getFileEntry() {
    return fileEntry
  }

  /**
   * Set file info after save-as
   */
  function setFileInfo(path: string, entry: any) {
    filePath.value = path
    fileEntry = entry
  }

  return {
    config,
    selectedClassIndex,
    selectedClassConfig,
    isDirty,
    filePath,
    newConfig,
    loadConfig,
    addClassConfig,
    removeClassConfig,
    selectClass,
    updateClassConfig,
    addAttributeGen,
    updateAttributeGen,
    removeAttributeGen,
    addReferenceGen,
    updateReferenceGen,
    removeReferenceGen,
    autoConfigureClass,
    markDirty,
    markSaved,
    getFileEntry,
    setFileInfo
  }
}

/**
 * Guess a good default generator key based on attribute name and type
 */
function guessGenerator(name: string, typeName: string): string {
  const n = name.toLowerCase()

  // String-type guessing
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

  if (typeName === 'EInt' || typeName === 'ELong' || typeName === 'EShort') {
    return 'faker.number.int'
  }

  if (typeName === 'EFloat' || typeName === 'EDouble') {
    return 'faker.number.float'
  }

  if (typeName === 'EBoolean') {
    return 'faker.datatype.boolean'
  }

  if (typeName === 'EDate') {
    return 'faker.date.past'
  }

  return 'faker.lorem.word'
}
