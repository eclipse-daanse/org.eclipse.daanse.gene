<template>
  <BaseDialog
    :open="open"
    title="In den Modelatlas hochladen"
    subtitle="Die SensiNact-Runtime lädt Mappings direkt aus dem Atlas — ein Deployen von Dateien entfällt."
    icon="pi pi-cloud-upload"
    width="40rem"
    @update:open="$emit('update:open', $event)"
  >
    <AtlasConnectionSelect :show-stage="false" />

    <p v-if="error" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      {{ error }}
    </p>

    <template v-if="!error">
      <div class="target">
        <label>
          Registry
          <select v-model="registry">
            <option v-for="r in registries" :key="r.name" :value="r.name">
              {{ r.name }}<template v-if="r.description"> — {{ r.description }}</template>
            </option>
          </select>
        </label>
        <label>
          Stage
          <select v-model="stage">
            <option v-for="st in writableStages" :key="st.name" :value="st.name">
              {{ st.name }}{{ st.final ? ' (final)' : '' }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="editing" class="note">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        <span>
          Das geöffnete Objekt <code>{{ editing.objectId }}</code> wird überschrieben.
        </span>
      </p>

      <ul class="files">
        <li v-for="file in files" :key="file.fileName" :class="stateOf(file.fileName)">
          <i :class="iconOf(file.fileName)" aria-hidden="true"></i>
          <code>{{ file.fileName }}</code>
          <span class="muted">{{ file.title }}</span>
          <small v-if="messageOf(file.fileName)" class="msg">{{ messageOf(file.fileName) }}</small>
        </li>
      </ul>

      <p v-if="warnings.length" class="warn">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        <span>{{ warnings.length }} Hinweis(e) — siehe Zusammenfassung.</span>
      </p>
      <p v-if="done" class="note">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        <span>
          Damit die Runtime die Mappings findet, muss eine
          <code>org.eclipse.fennec.event.atlas.mapping.atlas</code>-Konfiguration auf diesen
          Scope und die Registry „{{ registry }}“ zeigen.
        </span>
      </p>
    </template>

    <template #footer>
      <button type="button" class="btn" @click="$emit('update:open', false)">Schließen</button>
      <button
        type="button"
        class="btn primary"
        :disabled="uploading || !registry || !stage || !!error"
        @click="upload"
      >
        <i :class="uploading ? 'pi pi-spinner pi-spin' : 'pi pi-cloud-upload'" aria-hidden="true"></i>
        {{ uploading ? 'Lade hoch …' : editing ? 'Änderungen speichern' : 'Hochladen' }}
      </button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
/**
 * Veröffentlichen im Modelatlas (T17/#151), seit T24/#201 aus der
 * Zusammenfassung heraus in einen Dialog, der aus der Menü-Toolbar aufgeht.
 */
import { computed, ref, watch } from 'vue';
import BaseDialog from './BaseDialog.vue';
import AtlasConnectionSelect from '../AtlasConnectionSelect.vue';
import { atlasSource, editing } from '../context';
import { buildArtifacts, publishToAtlas } from '../artifacts';
import type { OutputFile, PublishProgress } from '../artifacts';
import type { AtlasRegistryInfo, AtlasStageInfo } from '../../atlas/atlasSource';

const props = defineProps<{ open: boolean }>();
defineEmits<{ (e: 'update:open', value: boolean): void }>();

const registries = ref<AtlasRegistryInfo[]>([]);
const registry = ref('');
const stage = ref('');
const uploading = ref(false);
const progress = ref<PublishProgress[]>([]);
const error = ref('');
const files = ref<OutputFile[]>([]);
const warnings = ref<string[]>([]);

const writableStages = computed<AtlasStageInfo[]>(
  () => registries.value.find((r) => r.name === registry.value)?.stages.filter((st) => st.writable) ?? [],
);
const done = computed(
  () => progress.value.length > 0 && progress.value.every((p) => p.state === 'ok'),
);

function stateOf(fileName: string): string {
  return progress.value.find((p) => p.fileName === fileName)?.state ?? '';
}
function messageOf(fileName: string): string | undefined {
  return progress.value.find((p) => p.fileName === fileName)?.message;
}
function iconOf(fileName: string): string {
  const state = stateOf(fileName);
  if (state === 'ok') return 'pi pi-check-circle';
  if (state === 'error') return 'pi pi-times-circle';
  if (state === 'pending' && uploading.value) return 'pi pi-spinner pi-spin';
  return 'pi pi-file';
}

// Beim Öffnen: Artefakte erzeugen und Ziel vorbelegen (Herkunft des Dokuments,
// sonst die Registry der Runtime-Konvention).
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    error.value = '';
    progress.value = [];
    try {
      const result = buildArtifacts();
      files.value = result.files;
      warnings.value = result.warnings;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return;
    }
    const source = atlasSource.value;
    if (!source?.canPublish) {
      error.value = 'Keine Modelatlas-Verbindung mit Schreibrecht.';
      return;
    }
    try {
      registries.value = await source.listRegistries();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return;
    }
    const origin = editing.value;
    const preferred =
      registries.value.find((r) => r.name === origin?.registry) ??
      registries.value.find((r) => /mapping/i.test(r.name)) ??
      registries.value[0];
    registry.value = preferred?.name ?? '';
    const originStage = preferred?.stages.find((st) => st.name === origin?.stage && st.writable);
    const stages = preferred?.stages.filter((st) => st.writable) ?? [];
    stage.value = (originStage ?? stages.find((st) => !st.final) ?? stages[0])?.name ?? '';
  },
);

watch(registry, () => {
  if (registry.value === editing.value?.registry) return;
  const stages = writableStages.value;
  stage.value = (stages.find((st) => !st.final) ?? stages[0])?.name ?? '';
});

async function upload(): Promise<void> {
  uploading.value = true;
  try {
    progress.value = await publishToAtlas(registry.value, stage.value, files.value, (entries) => {
      progress.value = entries;
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.target { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.target label {
  display: flex; flex-direction: column; gap: 0.25rem;
  font-size: 0.85rem; font-weight: 500; color: var(--text-color-secondary, #666);
}
select {
  padding: 0.35rem 0.5rem; font: inherit; border-radius: 6px;
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
}
select:focus-visible { outline: none; border-color: var(--primary-color, #1a56a0); }

.files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.files li {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  font-size: 0.9rem; padding: 0.35rem 0.5rem; border-radius: 6px;
  background: var(--surface-hover, #f6f7f9);
}
.files code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
.files .muted { color: var(--text-color-secondary, #777); font-size: 0.85rem; }
.files li.ok .pi { color: #2f9e44; }
.files li.error { color: #e5484d; }
.files li.error .pi { color: #e5484d; }
.files .msg { width: 100%; font-size: 0.8rem; }

.note, .warn { display: flex; gap: 0.5rem; align-items: flex-start; margin: 0; font-size: 0.88rem; }
.note .pi { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }
.warn .pi { color: #b8860b; margin-top: 0.15rem; }
.error { display: flex; align-items: center; gap: 0.5rem; margin: 0; color: #e5484d; font-size: 0.9rem; }

.btn {
  display: inline-flex; align-items: center; gap: 0.4rem; font: inherit; font-size: 0.9rem;
  padding: 0.4rem 0.8rem; cursor: pointer; border-radius: 6px;
  border: 1px solid var(--surface-border, #c0c4cc);
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
}
.btn:hover:not(:disabled) { border-color: var(--primary-color, #1a56a0); }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn.primary {
  background: var(--primary-color, #1a56a0);
  border-color: var(--primary-color, #1a56a0);
  color: var(--primary-color-text, #fff);
}
</style>
