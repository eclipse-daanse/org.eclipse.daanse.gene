<script setup lang="ts">
/**
 * One mapping as a tab. The tab owns its context: created from the tab id,
 * handed down with `provide`; the shell, the steps, the widgets and the
 * dialogs take it with `useWizardContext`. Nothing of one mapping can show up
 * in another tab.
 */
import { provideWizardContext, wizardContextFor } from './context';
import WizardShell from './WizardShell.vue';

const props = defineProps<{ tabId: string }>();
provideWizardContext(wizardContextFor(props.tabId));
</script>

<template>
  <WizardShell />
</template>
