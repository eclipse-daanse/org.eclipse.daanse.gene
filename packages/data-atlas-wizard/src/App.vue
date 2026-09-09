<template>
  <main class="wizard-app">
    <h1>Data-Atlas-Assistent <small>Domänenmodell → REST-Endpunkt</small></h1>
    <WizardShell />
  </main>
</template>

<script setup lang="ts">
/**
 * Standalone-Rahmen. Die Registrierung der Metamodelle kommt in Schritt 3 der
 * Umsetzungsreihenfolge dazu (`src/emf/setup.ts`); solange steht hier nur die
 * Shell, damit `npm run dev` etwas zeigt.
 */
import WizardShell from './wizard/WizardShell.vue';
</script>

<style scoped>
.wizard-app {
  max-width: 74rem;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: system-ui, sans-serif;
}
h1 { font-size: 1.5rem; }
h1 small {
  font-weight: 400;
  color: var(--text-color-secondary, #666);
  font-size: 0.7em;
  margin-left: 0.5rem;
}
</style>
