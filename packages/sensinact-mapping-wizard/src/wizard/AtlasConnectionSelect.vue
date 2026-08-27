<template>
  <div class="connection-select">
    <template v-if="connections.length">
      <label v-if="connections.length > 1">
        Verbindung
        <select v-model="connectionId">
          <option v-for="c in connections" :key="c.id" :value="c.id">
            {{ c.label }} — Scope „{{ c.scopeName }}“
          </option>
        </select>
      </label>
      <span v-else class="current">
        <i class="pi pi-cloud" aria-hidden="true"></i>
        {{ connections[0].label }} — Scope „{{ connections[0].scopeName }}“
      </span>
      <label v-if="props.showStage" class="stage">
        Stage
        <input v-model="stage" type="text" placeholder="release" />
      </label>
    </template>
    <span v-else class="muted">
      <i class="pi pi-info-circle" aria-hidden="true"></i>
      Keine Modelatlas-Verbindung — im Atlas Browser einrichten.
      <button type="button" class="link" @click="refreshConnections">Erneut prüfen</button>
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * Kompakte Anzeige/Auswahl der Atlas-Verbindung — sitzt in den Dialogen, nicht
 * mehr im Sensormodell-Schritt (T24/#201).
 */
import {
  connections,
  refreshConnections,
  selectedConnectionId,
  selectedStage,
} from './useAtlasConnection';

/**
 * Im Upload-Dialog wird die Ziel-Stage separat gewählt — dort würde ein
 * zweites „Stage"-Feld nur verwirren.
 */
const props = withDefaults(defineProps<{ showStage?: boolean }>(), { showStage: true });

const connectionId = selectedConnectionId;
const stage = selectedStage;
</script>

<style scoped>
.connection-select {
  display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap;
  font-size: 0.85rem; color: var(--text-color-secondary, #666);
}
label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 500; }
label.stage { max-width: 7rem; }
select, input {
  padding: 0.3rem 0.5rem; font: inherit; border-radius: 6px;
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
}
select:focus-visible, input:focus-visible { outline: none; border-color: var(--primary-color, #1a56a0); }
.current { display: inline-flex; align-items: center; gap: 0.4rem; padding-bottom: 0.3rem; }
.current .pi, .muted .pi { color: var(--primary-color, #1a56a0); }
.muted { display: inline-flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.link {
  border: none; background: none; padding: 0; font: inherit;
  color: var(--primary-color, #1a56a0); cursor: pointer; text-decoration: underline;
}
</style>
