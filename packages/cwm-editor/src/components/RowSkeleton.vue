<script setup lang="ts">
/**
 * Placeholder of an ObjectRow while it is still loading: indented like the
 * row to come, an icon, a title and a few text lines - shimmering.
 */
defineProps<{
  /** Depth of the row it stands for; indents like it */
  depth?: number
  /** Text lines below the title */
  lines?: number
}>()

/** As ContextObjectRow: one slot per level */
const SLOT = 12
</script>

<template>
  <div class="skeleton-row" aria-hidden="true">
    <div class="indent" :style="{ width: `calc(var(--cwm-number-col, 0px) + ${((depth ?? 1) + 2) * SLOT}px)` }"></div>
    <div class="block icon"></div>
    <div class="body">
      <div class="block title"></div>
      <div v-for="n in (lines ?? 2)" :key="n" class="block line" :style="{ width: `${n === (lines ?? 2) ? 45 : 85}%` }"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.55rem 10px 0.55rem 0;
}

.indent {
  flex: 0 0 auto;
}

.body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

/* Shimmer: a light band moving over a soft base */
.block {
  border-radius: 4px;
  background:
    linear-gradient(90deg, transparent 0, color-mix(in srgb, var(--surface-card, #fff) 60%, transparent) 50%, transparent 100%) 0 0 / 200% 100% no-repeat,
    color-mix(in srgb, var(--text-color) 7%, transparent);
  animation: cwm-shimmer 1.4s ease-in-out infinite;
}

.icon {
  flex: 0 0 16px;
  height: 16px;
  margin-top: 0.15rem;
  border-radius: 3px;
}

.title {
  width: 30%;
  height: 0.9rem;
}

.line {
  height: 0.6rem;
}

@keyframes cwm-shimmer {
  from { background-position: -150% 0, 0 0; }
  to { background-position: 250% 0, 0 0; }
}

@media (prefers-reduced-motion: reduce) {
  .block {
    animation: none;
  }
}
</style>
