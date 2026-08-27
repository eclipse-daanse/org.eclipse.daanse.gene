<template>
  <main class="wizard-app">
    <h1>eorm-Assistent <small>EMF-Modell → Datenbank</small></h1>
    <p v-if="!ready">Initialisiere Modelle …</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <WizardShell v-else />
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { setupPackages } from './emf/setup';
import { registerWizardWidgets } from './widgets/register';
import WizardShell from './wizard/WizardShell.vue';

const ready = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    await setupPackages();
    registerWizardWidgets();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    ready.value = true;
  }
});
</script>

<style scoped>
.wizard-app { max-width: 74rem; margin: 0 auto; padding: 1.5rem; font-family: system-ui, sans-serif; }
h1 { font-size: 1.5rem; }
h1 small { font-weight: 400; color: var(--text-color-secondary, #666); font-size: 0.7em; margin-left: 0.5rem; }
.error { color: #b00020; }
</style>
