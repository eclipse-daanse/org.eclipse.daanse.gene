/**
 * Icon Registry Service
 *
 * Manages icon mappings for EClasses in the instance tree.
 * Can be configured via EditorConfig model or programmatically.
 */

import { ref, computed } from 'tsm:vue'
import type { EClass, EObject } from '@emfts/core'

/**
 * Scope of the icon mapping
 */
export enum MappingScope {
  TYPE_ONLY = 'TYPE_ONLY',
  TYPE_AND_SUBTYPES = 'TYPE_AND_SUBTYPES'
}

/**
 * Supported icon libraries
 */
export enum IconLibrary {
  PRIME_ICONS = 'PRIME_ICONS',
  MATERIAL_SYMBOLS = 'MATERIAL_SYMBOLS',
  FONT_AWESOME = 'FONT_AWESOME',
  CUSTOM = 'CUSTOM'
}

/**
 * Icon specification
 */
export interface IconSpec {
  library: IconLibrary
  name: string
  variant?: string
}

/**
 * Icon mapping entry
 */
export interface IconMapping {
  targetType: string
  scope: MappingScope
  priority: number
  icon: IconSpec
}

/**
 * Resolve icon spec to CSS class
 */
export function resolveIconClass(icon: IconSpec): string {
  switch (icon.library) {
    case IconLibrary.PRIME_ICONS:
      return `pi pi-${icon.name}`
    case IconLibrary.MATERIAL_SYMBOLS:
      return `material-symbols-${icon.variant || 'outlined'} ${icon.name}`
    case IconLibrary.FONT_AWESOME:
      return `fa-${icon.variant || 'solid'} fa-${icon.name}`
    case IconLibrary.CUSTOM:
      return icon.name
    default:
      return `pi pi-${icon.name}`
  }
}

/**
 * Helper to get a feature value from EObject (supports both Impl and DynamicEObject)
 */
function getFeatureValue(obj: any, featureName: string): any {
  // Try property access first (generated Impl classes)
  if (obj[featureName] !== undefined) {
    return obj[featureName]
  }
  // Fall back to eGet for DynamicEObject
  if (typeof obj.eGet === 'function') {
    const eClass = obj.eClass()
    const feature = eClass?.getEStructuralFeature(featureName)
    if (feature) {
      return obj.eGet(feature)
    }
  }
  return undefined
}

/**
 * Convert fennecui IconMapping EObject to simple IconMapping
 * Works with any EObject that has the fennecui IconMapping structure
 */
function convertFennecMapping(fennec: EObject): IconMapping | null {
  try {
    const targetTypeUri = getFeatureValue(fennec, 'targetTypeUri')
    const scope = getFeatureValue(fennec, 'scope')
    const priority = getFeatureValue(fennec, 'priority')
    const iconObj = getFeatureValue(fennec, 'icon')

    console.log('[IconRegistry] convertFennecMapping:', { targetTypeUri, scope, priority, iconObj })

    if (!targetTypeUri) {
      console.warn('[IconRegistry] Missing targetTypeUri')
      return null
    }

    // Convert icon
    let icon: IconSpec = { library: IconLibrary.PRIME_ICONS, name: 'circle' }

    if (iconObj) {
      // Get icon properties using eGet helper
      const libValue = getFeatureValue(iconObj, 'library')
      const nameValue = getFeatureValue(iconObj, 'name')
      const variantValue = getFeatureValue(iconObj, 'variant')
      const characterValue = getFeatureValue(iconObj, 'character')

      console.log('[IconRegistry] Icon properties:', { libValue, nameValue, variantValue, characterValue })

      // LibraryIcon
      if (nameValue) {
        const libName = libValue?.toString() || 'PRIME_ICONS'
        let library = IconLibrary.PRIME_ICONS
        if (libName.includes('MATERIAL')) library = IconLibrary.MATERIAL_SYMBOLS
        else if (libName.includes('FONT_AWESOME')) library = IconLibrary.FONT_AWESOME
        else if (libName.includes('CUSTOM')) library = IconLibrary.CUSTOM

        icon = {
          library,
          name: nameValue || 'circle',
          variant: variantValue
        }
      }
      // Utf8Icon
      else if (characterValue) {
        icon = {
          library: IconLibrary.CUSTOM,
          name: characterValue || '●'
        }
      }
    } else {
      console.warn('[IconRegistry] Missing icon object')
    }

    return {
      targetType: targetTypeUri,
      scope: scope?.toString().includes('SUBTYPES') ? MappingScope.TYPE_AND_SUBTYPES : MappingScope.TYPE_ONLY,
      priority: priority || 0,
      icon
    }
  } catch (e) {
    console.warn('[IconRegistry] Failed to convert mapping:', e)
    return null
  }
}

/**
 * Default icon mappings (fallbacks)
 */
const DEFAULT_MAPPINGS: IconMapping[] = [
  // Generic default
  { targetType: 'EObject', scope: MappingScope.TYPE_AND_SUBTYPES, priority: 0, icon: { library: IconLibrary.PRIME_ICONS, name: 'circle' } },
]

// Storage key for persistence
const ICON_MAPPINGS_STORAGE_KEY = 'gene-icon-mappings'

// Reactive state
const customMappings = ref<IconMapping[]>([])
const editorConfigMappings = ref<IconMapping[]>([])

// Version counter for triggering re-renders when icons change
const iconVersion = ref(0)

// Callbacks to notify when icons change
const iconChangeListeners: Array<() => void> = []

/**
 * All mappings (defaults + editorConfig + custom)
 */
const allMappings = computed(() => [...DEFAULT_MAPPINGS, ...editorConfigMappings.value, ...customMappings.value])

/**
 * Load icon mappings from a fennecui EditorConfig instance (as EObject)
 */
export function loadFromEditorConfig(config: EObject): void {
  console.log('[IconRegistry] loadFromEditorConfig called, config:', config)

  // Try property access first (EditorConfigImpl), then eGet (DynamicEObject)
  let iconMappings = (config as any).iconMappings
  if (iconMappings === undefined && typeof (config as any).eGet === 'function') {
    // DynamicEObject - use reflective API
    const eClass = config.eClass()
    const iconMappingsFeature = eClass.getEStructuralFeature('iconMappings')
    if (iconMappingsFeature) {
      iconMappings = (config as any).eGet(iconMappingsFeature)
    }
  }
  console.log('[IconRegistry] iconMappings from config:', iconMappings, 'length:', iconMappings?.length ?? iconMappings?.data?.length)

  if (iconMappings && (Array.isArray(iconMappings) || typeof iconMappings[Symbol.iterator] === 'function')) {
    // Convert to array if it's an iterable (like EList)
    const mappingsArray = Array.isArray(iconMappings) ? iconMappings : Array.from(iconMappings)
    console.log('[IconRegistry] mappingsArray:', mappingsArray)

    const converted = mappingsArray
      .map(convertFennecMapping)
      .filter((m): m is IconMapping => m !== null)
    editorConfigMappings.value = converted
    console.log('[IconRegistry] Loaded', converted.length, 'icon mappings from EditorConfig')
    console.log('[IconRegistry] Converted mappings:', converted)
    // Notify listeners that icons have changed
    notifyIconChange()
  } else {
    console.log('[IconRegistry] No iconMappings found or not iterable')
  }
}

/**
 * Clear editor config mappings
 */
export function clearEditorConfigMappings(): void {
  editorConfigMappings.value = []
}

/**
 * Check if an EClass matches a target type
 */
function matchesType(eClass: EClass, targetType: string, scope: MappingScope): boolean {
  // Check exact match by name
  if (eClass.getName() === targetType) {
    return true
  }

  // Check by URI
  const pkg = typeof eClass.getEPackage === 'function' ? eClass.getEPackage() : null
  if (pkg) {
    const classUri = `${pkg.getNsURI()}#${eClass.getName()}`
    if (classUri === targetType) {
      return true
    }
  }

  // Check supertypes if scope allows
  if (scope === MappingScope.TYPE_AND_SUBTYPES) {
    try {
      const superTypes = typeof eClass.getESuperTypes === 'function' ? eClass.getESuperTypes() : []
      if (superTypes && (Array.isArray(superTypes) || (superTypes as any)[Symbol.iterator])) {
        for (const superType of superTypes) {
          if (matchesType(superType, targetType, scope)) {
            return true
          }
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }

  return false
}

/**
 * Get icon for an EClass
 */
export function getIconForClass(eClass: EClass): string {
  let bestMatch: IconMapping | null = null
  let bestPriority = -1

  for (const mapping of allMappings.value) {
    if (mapping.priority > bestPriority && matchesType(eClass, mapping.targetType, mapping.scope)) {
      bestMatch = mapping
      bestPriority = mapping.priority
    }
  }

  if (bestMatch) {
    return resolveIconClass(bestMatch.icon)
  }

  // Fallback
  return 'pi pi-circle'
}

/**
 * Register a custom icon mapping
 */
export function registerIconMapping(mapping: IconMapping): void {
  customMappings.value.push(mapping)
}

/**
 * Register multiple icon mappings
 */
export function registerIconMappings(mappings: IconMapping[]): void {
  customMappings.value.push(...mappings)
}

/**
 * Clear all custom mappings
 */
export function clearCustomMappings(): void {
  customMappings.value = []
}

/**
 * Get all registered mappings
 */
export function getAllMappings(): IconMapping[] {
  return allMappings.value
}

/**
 * Create a simple icon mapping
 */
export function createIconMapping(
  targetType: string,
  iconName: string,
  options?: {
    scope?: MappingScope
    priority?: number
    library?: IconLibrary
    variant?: string
  }
): IconMapping {
  return {
    targetType,
    scope: options?.scope ?? MappingScope.TYPE_ONLY,
    priority: options?.priority ?? 50,
    icon: {
      library: options?.library ?? IconLibrary.PRIME_ICONS,
      name: iconName,
      variant: options?.variant
    }
  }
}

/**
 * Register a listener for icon changes
 * @returns Unsubscribe function
 */
export function onIconsChanged(listener: () => void): () => void {
  iconChangeListeners.push(listener)
  return () => {
    const index = iconChangeListeners.indexOf(listener)
    if (index >= 0) {
      iconChangeListeners.splice(index, 1)
    }
  }
}

/**
 * Notify all listeners that icons have changed
 */
function notifyIconChange(): void {
  iconVersion.value++
  console.log('[IconRegistry] Notifying', iconChangeListeners.length, 'listeners of icon change, version:', iconVersion.value)
  iconChangeListeners.forEach(listener => listener())
}

/**
 * Get the icon registry service object (for TSM registration)
 */
export function getIconRegistryService() {
  return {
    getIconForClass,
    iconVersion,
    onIconsChanged
  }
}
