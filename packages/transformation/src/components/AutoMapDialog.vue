<script setup lang="ts">
/**
 * AutoMapDialog - Automatic mapping strategies for transformation editor
 *
 * Offers multiple matching strategies (exact name, normalized name,
 * inheritance-based, annotation-based) that iteratively build
 * class-to-class and feature-to-feature mappings.
 */

import { ref, computed } from 'tsm:vue'
import { Dialog, Button, Checkbox } from 'tsm:primevue'
import type { ClassInfo } from 'ui-model-browser'

// --- Types (mirrored from TransformationEditor) ---

interface FeatureInfo {
  name: string
  typeName: string
  kind: 'attribute' | 'reference'
  isMany: boolean
  isContainment?: boolean
}

interface ClassFeatures {
  className: string
  isAbstract: boolean
  features: FeatureInfo[]
}

interface FeatureMapping {
  sourceFeature: string
  targetFeature: string
  expression?: string
  viaVariable?: string
}

interface RelationDef {
  id: number
  name: string
  isTop: boolean
  sourceClass: string
  targetClass: string
  mappings: FeatureMapping[]
}

interface MatchResult {
  sourceClass: string
  targetClass: string
  mappings: FeatureMapping[]
  strategy: string
}

// --- Props & Emits ---

const props = defineProps<{
  visible: boolean
  sourceClasses: ClassFeatures[]
  targetClasses: ClassFeatures[]
  sourceClassInfos: ClassInfo[]
  targetClassInfos: ClassInfo[]
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  'apply': [results: RelationDef[]]
}>()

// --- Strategy state ---

const strategyExactName = ref(true)
const strategyCleanupName = ref(true)
const strategyInheritance = ref(false)
const strategyAnnotation = ref(false)

const matchResults = ref<MatchResult[]>([])
const hasExecuted = ref(false)

// --- Helpers ---

function normalize(name: string): string {
  return name.toLowerCase().replace(/[_\s-]/g, '')
}

function getSuperTypeNames(classInfo: ClassInfo): string[] {
  try {
    const superTypes = typeof classInfo.eClass.getESuperTypes === 'function'
      ? classInfo.eClass.getESuperTypes()
      : []
    return superTypes.map((st: any) => {
      if (typeof st.getName === 'function') return st.getName()
      return ''
    }).filter((n: string) => n.length > 0)
  } catch {
    return []
  }
}

function getAnnotationSources(classInfo: ClassInfo): string[] {
  try {
    const annotations = classInfo.eClass.getEAnnotations?.() || []
    return annotations.map((a: any) => {
      if (typeof a.getSource === 'function') return a.getSource()
      return ''
    }).filter((s: string) => s.length > 0)
  } catch {
    return []
  }
}

function matchFeaturesExact(srcFeatures: FeatureInfo[], tgtFeatures: FeatureInfo[]): FeatureMapping[] {
  const mappings: FeatureMapping[] = []
  for (const sf of srcFeatures) {
    const match = tgtFeatures.find(tf => tf.name === sf.name)
    if (match) {
      mappings.push({ sourceFeature: sf.name, targetFeature: match.name })
    }
  }
  return mappings
}

function matchFeaturesCleanup(srcFeatures: FeatureInfo[], tgtFeatures: FeatureInfo[], excludeExact: boolean): FeatureMapping[] {
  const mappings: FeatureMapping[] = []
  const usedTargets = new Set<string>()

  for (const sf of srcFeatures) {
    const normSrc = normalize(sf.name)
    const match = tgtFeatures.find(tf => {
      if (usedTargets.has(tf.name)) return false
      if (excludeExact && sf.name === tf.name) return false
      return normalize(tf.name) === normSrc
    })
    if (match) {
      mappings.push({ sourceFeature: sf.name, targetFeature: match.name })
      usedTargets.add(match.name)
    }
  }
  return mappings
}

function matchFeaturesForPair(
  srcClass: ClassFeatures,
  tgtClass: ClassFeatures
): FeatureMapping[] {
  // First exact matches
  const exact = matchFeaturesExact(srcClass.features, tgtClass.features)
  const exactTargets = new Set(exact.map(m => m.targetFeature))
  const exactSources = new Set(exact.map(m => m.sourceFeature))

  // Then cleanup matches for remaining features
  const remainingSrc = srcClass.features.filter(f => !exactSources.has(f.name))
  const remainingTgt = tgtClass.features.filter(f => !exactTargets.has(f.name))
  const cleanup = matchFeaturesCleanup(remainingSrc, remainingTgt, false)

  return [...exact, ...cleanup]
}

// --- Execute strategies ---

/**
 * Finds best class pairs by feature overlap using greedy matching.
 * matchFn determines how features are compared (exact vs normalized).
 */
function findClassPairsByFeatureOverlap(
  srcClasses: ClassFeatures[],
  tgtClasses: ClassFeatures[],
  matchedSrc: Set<string>,
  matchedTgt: Set<string>,
  matchFn: (src: ClassFeatures, tgt: ClassFeatures) => FeatureMapping[]
): { src: ClassFeatures; tgt: ClassFeatures; mappings: FeatureMapping[] }[] {
  const candidates: { src: ClassFeatures; tgt: ClassFeatures; mappings: FeatureMapping[]; score: number }[] = []

  for (const src of srcClasses) {
    if (matchedSrc.has(src.className)) continue
    for (const tgt of tgtClasses) {
      if (matchedTgt.has(tgt.className)) continue
      const mappings = matchFn(src, tgt)
      if (mappings.length >= 2) {
        candidates.push({ src, tgt, mappings, score: mappings.length })
      }
    }
  }

  // Greedy: best score first
  candidates.sort((a, b) => b.score - a.score)
  const result: { src: ClassFeatures; tgt: ClassFeatures; mappings: FeatureMapping[] }[] = []
  const usedSrc = new Set<string>()
  const usedTgt = new Set<string>()

  for (const c of candidates) {
    if (usedSrc.has(c.src.className) || usedTgt.has(c.tgt.className)) continue
    result.push({ src: c.src, tgt: c.tgt, mappings: c.mappings })
    usedSrc.add(c.src.className)
    usedTgt.add(c.tgt.className)
  }

  return result
}

function execute() {
  const results: MatchResult[] = []
  const matchedSourceClasses = new Set<string>()
  const matchedTargetClasses = new Set<string>()

  function addResult(srcName: string, tgtName: string, mappings: FeatureMapping[], strategy: string) {
    if (matchedSourceClasses.has(srcName) || matchedTargetClasses.has(tgtName)) return
    if (mappings.length === 0) return

    results.push({ sourceClass: srcName, targetClass: tgtName, mappings, strategy })
    matchedSourceClasses.add(srcName)
    matchedTargetClasses.add(tgtName)
  }

  const nonAbstractSrc = props.sourceClasses.filter(c => !c.isAbstract)
  const nonAbstractTgt = props.targetClasses.filter(c => !c.isAbstract)

  // Strategy 1: Vollständige Namegleichheit
  //   Phase A: Exact class name match
  //   Phase B: Feature-overlap with exact feature name matching
  if (strategyExactName.value) {
    // Phase A: classes with identical names
    for (const src of nonAbstractSrc) {
      const tgt = nonAbstractTgt.find(t => t.className === src.className)
      if (tgt) {
        const mappings = matchFeaturesExact(src.features, tgt.features)
        addResult(src.className, tgt.className, mappings, 'Exakter Name')
      }
    }

    // Phase B: remaining classes matched by exact feature name overlap
    const overlapPairs = findClassPairsByFeatureOverlap(
      nonAbstractSrc, nonAbstractTgt,
      matchedSourceClasses, matchedTargetClasses,
      (src, tgt) => matchFeaturesExact(src.features, tgt.features)
    )
    for (const pair of overlapPairs) {
      addResult(pair.src.className, pair.tgt.className, pair.mappings, 'Exakter Name')
    }
  }

  // Strategy 2: Cleanup Namegleichheit
  //   Phase A: Normalized class name match
  //   Phase B: Feature-overlap with normalized feature name matching
  if (strategyCleanupName.value) {
    // Phase A: classes with normalized-equal names
    for (const src of nonAbstractSrc) {
      if (matchedSourceClasses.has(src.className)) continue
      const normSrc = normalize(src.className)
      const tgt = nonAbstractTgt.find(t => {
        if (matchedTargetClasses.has(t.className)) return false
        return normalize(t.className) === normSrc
      })
      if (tgt) {
        const mappings = matchFeaturesCleanup(src.features, tgt.features, false)
        addResult(src.className, tgt.className, mappings, 'Cleanup Name')
      }
    }

    // Phase B: remaining classes matched by normalized feature name overlap
    const overlapPairs = findClassPairsByFeatureOverlap(
      nonAbstractSrc, nonAbstractTgt,
      matchedSourceClasses, matchedTargetClasses,
      (src, tgt) => matchFeaturesCleanup(src.features, tgt.features, false)
    )
    for (const pair of overlapPairs) {
      addResult(pair.src.className, pair.tgt.className, pair.mappings, 'Cleanup Name')
    }
  }

  // Strategy 3: Inheritance (shared supertype names)
  if (strategyInheritance.value) {
    for (const src of nonAbstractSrc) {
      if (matchedSourceClasses.has(src.className)) continue
      const srcInfo = props.sourceClassInfos.find(ci => ci.name === src.className)
      if (!srcInfo) continue
      const srcSuperNames = getSuperTypeNames(srcInfo)
      if (srcSuperNames.length === 0) continue

      for (const tgt of nonAbstractTgt) {
        if (matchedTargetClasses.has(tgt.className)) continue
        const tgtInfo = props.targetClassInfos.find(ci => ci.name === tgt.className)
        if (!tgtInfo) continue
        const tgtSuperNames = getSuperTypeNames(tgtInfo)

        const shared = srcSuperNames.some(sn => tgtSuperNames.includes(sn))
        if (shared) {
          const mappings = matchFeaturesForPair(src, tgt)
          addResult(src.className, tgt.className, mappings, 'Vererbung')
          break
        }
      }
    }
  }

  // Strategy 4: Annotation-based matching
  if (strategyAnnotation.value) {
    for (const src of nonAbstractSrc) {
      if (matchedSourceClasses.has(src.className)) continue
      const srcInfo = props.sourceClassInfos.find(ci => ci.name === src.className)
      if (!srcInfo) continue
      const srcAnnotations = getAnnotationSources(srcInfo)
      if (srcAnnotations.length === 0) continue

      for (const tgt of nonAbstractTgt) {
        if (matchedTargetClasses.has(tgt.className)) continue
        const tgtInfo = props.targetClassInfos.find(ci => ci.name === tgt.className)
        if (!tgtInfo) continue
        const tgtAnnotations = getAnnotationSources(tgtInfo)

        const shared = srcAnnotations.some(sa => tgtAnnotations.includes(sa))
        if (shared) {
          const mappings: FeatureMapping[] = []
          for (const sf of src.features) {
            const match = tgt.features.find(tf => {
              const nameMatch = normalize(sf.name) === normalize(tf.name)
              const typeMatch = sf.typeName === tf.typeName
              return nameMatch && typeMatch
            })
            if (match) {
              mappings.push({ sourceFeature: sf.name, targetFeature: match.name })
            }
          }
          addResult(src.className, tgt.className, mappings, 'Annotation')
          break
        }
      }
    }
  }

  matchResults.value = results
  hasExecuted.value = true
}

// --- Apply results ---

function applyResults() {
  const relations: RelationDef[] = matchResults.value.map((result, idx) => ({
    id: 0, // will be assigned by parent
    name: `${result.sourceClass}2${result.targetClass}`,
    isTop: true,
    sourceClass: result.sourceClass,
    targetClass: result.targetClass,
    mappings: result.mappings
  }))
  emit('apply', relations)
}

function close() {
  matchResults.value = []
  hasExecuted.value = false
  emit('update:visible', false)
}

// --- Computed ---

const totalMappings = computed(() =>
  matchResults.value.reduce((sum, r) => sum + r.mappings.length, 0)
)

const anyStrategySelected = computed(() =>
  strategyExactName.value || strategyCleanupName.value ||
  strategyInheritance.value || strategyAnnotation.value
)
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="close"
    header="AutoMap"
    :modal="true"
    :closable="true"
    :style="{ width: '600px', maxWidth: '90vw' }"
  >
    <div class="automap-content">
      <!-- Strategy selection -->
      <div class="automap-section">
        <div class="automap-section-header">Strategien</div>
        <div class="automap-strategy-list">
          <label for="strat-exact" class="automap-strategy-row">
            <Checkbox v-model="strategyExactName" :binary="true" inputId="strat-exact" />
            <span class="automap-strategy-label">Vollständige Namegleichheit</span>
            <span class="automap-strategy-hint">Person.firstName = Employee.firstName</span>
          </label>
          <label for="strat-cleanup" class="automap-strategy-row">
            <Checkbox v-model="strategyCleanupName" :binary="true" inputId="strat-cleanup" />
            <span class="automap-strategy-label">Cleanup Namegleichheit</span>
            <span class="automap-strategy-hint">first_name = firstName</span>
          </label>
          <label for="strat-inherit" class="automap-strategy-row">
            <Checkbox v-model="strategyInheritance" :binary="true" inputId="strat-inherit" />
            <span class="automap-strategy-label">Vererbungsgleichheit</span>
            <span class="automap-strategy-hint">Gemeinsame Supertypen</span>
          </label>
          <label for="strat-annotation" class="automap-strategy-row">
            <Checkbox v-model="strategyAnnotation" :binary="true" inputId="strat-annotation" />
            <span class="automap-strategy-label">Mapping Regel</span>
            <span class="automap-strategy-hint">Typ + EAnnotation</span>
          </label>
        </div>
      </div>

      <!-- Results -->
      <div v-if="hasExecuted" class="automap-section">
        <div class="automap-section-header">
          Ergebnis
          <span class="automap-count-badge">{{ matchResults.length }}</span>
        </div>

        <div v-if="matchResults.length === 0" class="automap-empty">
          Keine Matches gefunden.
        </div>

        <div v-else class="automap-results-list">
          <div v-for="(result, idx) in matchResults" :key="idx" class="automap-result-row">
            <div class="automap-result-main">
              <i class="pi pi-arrows-h automap-result-icon"></i>
              <span class="automap-class-source">{{ result.sourceClass }}</span>
              <i class="pi pi-arrow-right automap-arrow"></i>
              <span class="automap-class-target">{{ result.targetClass }}</span>
              <span class="automap-tag">{{ result.strategy }}</span>
            </div>
            <div class="automap-result-detail">
              <span
                v-for="(m, mi) in result.mappings"
                :key="mi"
                class="automap-mapping"
              >{{ m.sourceFeature }} → {{ m.targetFeature }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Abbrechen" severity="secondary" @click="close" />
      <Button
        v-if="!hasExecuted || matchResults.length === 0"
        label="Ausführen"
        icon="pi pi-play"
        :disabled="!anyStrategySelected"
        @click="execute"
      />
      <Button
        v-else
        label="Übernehmen"
        icon="pi pi-check"
        @click="applyResults"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.automap-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Sections */
.automap-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.automap-section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
  margin-bottom: 0;
}

/* Strategy rows — flat, compact, like tree nodes */
.automap-strategy-list {
  display: flex;
  flex-direction: column;
}

.automap-strategy-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--surface-border);
}

.automap-strategy-row:last-child {
  border-bottom: none;
}

.automap-strategy-row:hover {
  background: var(--surface-hover);
}

.automap-strategy-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
}

.automap-strategy-hint {
  font-size: 0.75rem;
  color: var(--text-color-muted);
  font-family: monospace;
  margin-left: auto;
}

/* Count badge */
.automap-count-badge {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.0625rem 0.5rem;
  border-radius: 999px;
  background: var(--primary-color);
  color: var(--primary-color-text);
  min-width: 1.25rem;
  text-align: center;
}

/* Empty state */
.automap-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-color-muted);
  font-size: 0.8125rem;
  font-style: italic;
}

/* Results list — flat rows like tree items */
.automap-results-list {
  max-height: 260px;
  overflow-y: auto;
}

.automap-result-row {
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--surface-border);
}

.automap-result-row:last-child {
  border-bottom: none;
}

.automap-result-row:hover {
  background: var(--surface-hover);
}

.automap-result-main {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
}

.automap-result-icon {
  font-size: 0.75rem;
  color: var(--text-color-muted);
  width: 1rem;
  flex-shrink: 0;
}

.automap-class-source,
.automap-class-target {
  font-family: monospace;
  font-weight: 600;
  color: var(--primary-color);
}

.automap-arrow {
  font-size: 0.5rem;
  color: var(--text-color-muted);
}

.automap-tag {
  margin-left: auto;
  font-size: 0.625rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  font-style: italic;
  white-space: nowrap;
}

.automap-result-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding-left: 1.375rem;
  padding-top: 0.25rem;
}

.automap-mapping {
  font-family: monospace;
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
}

.automap-mapping:not(:last-child)::after {
  content: ',';
  color: var(--text-color-muted);
}
</style>
