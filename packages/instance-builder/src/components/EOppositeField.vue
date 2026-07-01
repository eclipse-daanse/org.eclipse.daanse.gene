<script setup lang="ts">
/**
 * EOppositeField Component
 *
 * Special field for selecting EOpposite for an EReference.
 * Shows a dropdown with available EReferences from the target EClass
 * that can serve as the opposite reference.
 *
 * IMPORTANT: The target EClass (from getEReferenceType) may point to a
 * foreign instance (resolved via EPackageRegistry) instead of the live
 * model in the same Resource. We must resolve references back to the
 * live Resource tree so the serializer writes intra-document #// fragments
 * instead of nsURI hrefs.
 */

import { computed } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import type { EReference, EClass, EObject, EPackage } from '@emfts/core'

const props = defineProps<{
  feature: EReference
  value: EReference | null
  readonly?: boolean
  error?: string
  /** The EReference being edited */
  eObject?: EObject
}>()

const emit = defineEmits<{
  'update:value': [value: EReference | null]
}>()

/**
 * Walk the live Resource tree to find a classifier by nsURI + name.
 * Returns the live instance from the same Resource, avoiding foreign
 * registry instances that would cause nsURI-href serialization.
 */
function resolveInLiveResource(nsURI: string | null, className: string): EClass | null {
  if (!props.eObject) return null
  const resource = props.eObject.eResource?.()
  if (!resource) return null

  const contents = resource.getContents()
  for (let i = 0; i < contents.size(); i++) {
    const root = contents.get(i)
    const found = walkPackageForClass(root as any, nsURI, className)
    if (found) return found
  }
  return null
}

function walkPackageForClass(pkg: any, nsURI: string | null, className: string): EClass | null {
  if (!pkg || typeof pkg.getEClassifiers !== 'function') return null
  const pkgNsURI = pkg.getNsURI?.()

  for (const c of pkg.getEClassifiers()) {
    if (c.getName?.() === className && (!nsURI || pkgNsURI === nsURI)) {
      if ('isAbstract' in c && 'isInterface' in c) return c as EClass
    }
  }
  for (const sub of pkg.getESubpackages?.() || []) {
    const found = walkPackageForClass(sub, nsURI, className)
    if (found) return found
  }
  return null
}

/**
 * Resolve a reference from a (potentially foreign) EClass to the
 * corresponding reference in the live Resource tree.
 */
function resolveRefInLiveResource(foreignRef: EReference, liveTargetClass: EClass): EReference | null {
  const refName = foreignRef.getName?.()
  if (!refName) return null

  const allRefs = liveTargetClass.getEAllReferences?.() || []
  for (const ref of allRefs) {
    if (ref.getName?.() === refName) return ref
  }
  return null
}

// Get the target EClass of the current reference — resolved to the live Resource
const targetEClass = computed<EClass | null>(() => {
  if (!props.eObject) return null
  try {
    const eRef = props.eObject as EReference
    const rawTarget = eRef.getEReferenceType?.()
    if (!rawTarget) return null

    // Try to resolve to the live Resource tree
    const targetName = rawTarget.getName?.()
    const targetPkg = rawTarget.getEPackage?.()
    const targetNsURI = targetPkg?.getNsURI?.() || null
    if (targetName) {
      const liveTarget = resolveInLiveResource(targetNsURI, targetName)
      if (liveTarget) return liveTarget
    }
    return rawTarget
  } catch {
    return null
  }
})

// Get the containing EClass of the current reference
const containingEClass = computed<EClass | null>(() => {
  if (!props.eObject) return null
  try {
    const container = props.eObject.eContainer?.()
    if (container && typeof (container as any).isAbstract === 'function') {
      return container as EClass
    }
  } catch {
    // ignore
  }
  return null
})

// Get available opposite references from the target EClass
const availableOpposites = computed(() => {
  const opposites: { label: string; value: EReference }[] = []

  const target = targetEClass.value
  const containing = containingEClass.value

  if (!target) return opposites

  // Get all references from the (live) target EClass
  try {
    const allRefs = target.getEAllReferences?.() || []

    for (const ref of allRefs) {
      try {
        const refTarget = ref.getEReferenceType?.()
        if (refTarget && containing) {
          const refTargetName = refTarget.getName()
          const containingName = containing.getName()

          if (refTargetName === containingName || isSuperTypeOf(refTarget, containing)) {
            opposites.push({
              label: ref.getName() || 'Unknown',
              value: ref
            })
          }
        }
      } catch {
        // Reference type not set, skip
      }
    }
  } catch (e) {
    console.warn('[EOppositeField] Failed to get references:', e)
  }

  return opposites
})

// Check if a class is a supertype of another
function isSuperTypeOf(potentialSuper: EClass, sub: EClass): boolean {
  if (potentialSuper === sub) return true
  try {
    const superTypes = sub.getESuperTypes?.() || []
    for (const st of superTypes) {
      if (st === potentialSuper || isSuperTypeOf(potentialSuper, st)) {
        return true
      }
    }
  } catch {
    // Ignore
  }
  return false
}

// Find matching option for current value
const selectedOption = computed({
  get() {
    if (!props.value) return null
    const found = availableOpposites.value.find(opt => {
      if (opt.value === props.value) return true
      // Fallback: match by name
      const optName = opt.value.getName?.()
      const valName = (props.value as any)?.getName?.()
      return optName && valName && optName === valName
    })
    return found || null
  },
  set(option: { label: string; value: EReference } | null) {
    emit('update:value', option?.value ?? null)
  }
})
</script>

<template>
  <div class="eopposite-field">
    <label class="field-label">{{ feature.getName() }}</label>
    <Dropdown
      v-model="selectedOption"
      :options="availableOpposites"
      optionLabel="label"
      dataKey="label"
      placeholder="Select opposite..."
      :disabled="readonly || availableOpposites.length === 0"
      :class="{ 'p-invalid': error }"
      class="w-full"
      showClear
    />
    <small v-if="!targetEClass" class="hint">Set eType first to see available opposites</small>
    <small v-else-if="availableOpposites.length === 0" class="hint">No matching references in {{ targetEClass.getName() }}</small>
    <small v-if="error" class="p-error">{{ error }}</small>
  </div>
</template>

<style scoped>
.eopposite-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.w-full {
  width: 100%;
}

.hint {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.p-error {
  color: var(--red-500);
  font-size: 0.75rem;
}
</style>
