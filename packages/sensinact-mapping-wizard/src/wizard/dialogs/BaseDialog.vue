<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="close">
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        :style="{ maxWidth: width }"
      >
        <header>
          <h3><i v-if="icon" :class="icon" aria-hidden="true"></i> {{ title }}</h3>
          <button type="button" class="close" aria-label="Schließen" @click="close">
            <i class="pi pi-times" aria-hidden="true"></i>
          </button>
        </header>
        <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
        <div class="content"><slot /></div>
        <footer v-if="$slots.footer"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Schlankes Modal für die Auswahl-Dialoge des Assistenten (T23/#195).
 * Bewusst ohne PrimeVue: Der Wizard läuft auch standalone, und die
 * gene-Theme-Variablen reichen für ein passendes Erscheinungsbild.
 */
import { onBeforeUnmount, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    subtitle?: string;
    icon?: string;
    width?: string;
  }>(),
  { width: '46rem' },
);

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

function close(): void {
  emit('update:open', false);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

// Offener Dialog schließt mit ESC; der Listener lebt nur solange er offen ist.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) window.addEventListener('keydown', onKeydown);
    else window.removeEventListener('keydown', onKeydown);
  },
  { immediate: true },
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 4rem 1rem 2rem;
  background: rgb(0 0 0 / 35%);
  backdrop-filter: blur(1px);
}
.dialog {
  width: 100%; max-height: calc(100vh - 6rem);
  display: flex; flex-direction: column; gap: 0.75rem;
  padding: 1rem 1.15rem 1.15rem;
  border-radius: 10px;
  background: var(--surface-card, #fff);
  color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #ddd);
  box-shadow: 0 12px 32px rgb(0 0 0 / 22%);
}
.dialog header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.dialog h3 {
  margin: 0; font-size: 1.1rem; display: inline-flex; align-items: center; gap: 0.5rem;
}
.dialog h3 .pi { color: var(--primary-color, #1a56a0); }
.subtitle { margin: 0; color: var(--text-color-secondary, #666); font-size: 0.9rem; }
.content { overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; }
footer { display: flex; justify-content: flex-end; gap: 0.5rem; }
.close {
  border: none; background: none; cursor: pointer; font: inherit;
  color: var(--text-color-secondary, #888); padding: 0.25rem; border-radius: 6px;
}
.close:hover { background: var(--surface-hover, #f1f1f1); color: var(--text-color, #1a1a1a); }
</style>
