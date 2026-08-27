/**
 * Modelatlas-Verbindung des Assistenten (T24/#201).
 *
 * Der Assistent richtet keine Verbindungen ein — das passiert im Atlas Browser.
 * Hier wird die aktive Verbindung übernommen (und ist in den Dialogen
 * umschaltbar). Modulweiter Zustand: Menü-Aktionen und Dialoge sehen dasselbe.
 */
import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { AtlasReadClient } from '../atlas/ModelAtlasClient';
import { AtlasModelSource } from '../atlas/atlasSource';
import { atlasSource } from './context';

export interface BrowserConnection {
  id: string;
  label: string;
  baseUrl: string;
  scopeName: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
}
export interface GeneAtlasBrowser {
  connections: Ref<BrowserConnection[]>;
  getClient(connectionId: string): AtlasReadClient | undefined;
}

let browser: GeneAtlasBrowser | undefined;
const tick = ref(0);
const selectedId = ref('');
const stage = ref('release');

/** Wird beim Aktivieren des Plugins gesetzt (Service `gene.atlas.browser`). */
export function setAtlasBrowser(service: GeneAtlasBrowser | undefined): void {
  browser = service;
  tick.value++;
  apply();
}

export const connections = computed<BrowserConnection[]>(() => {
  void tick.value;
  return (browser?.connections.value ?? []).filter((c) => c.status === 'connected');
});

export const selectedConnectionId = computed({
  get: () => selectedId.value,
  set: (value: string) => {
    selectedId.value = value;
    apply();
  },
});

export const selectedStage = computed({
  get: () => stage.value,
  set: (value: string) => {
    stage.value = value;
    apply();
  },
});

export const activeConnection = computed(() =>
  connections.value.find((c) => c.id === selectedId.value),
);

/** Aktive Auswahl in eine Quelle übersetzen (oder verwerfen). */
function apply(): void {
  const connection = connections.value.find((c) => c.id === selectedId.value);
  const client = connection ? browser?.getClient(connection.id) : undefined;
  atlasSource.value =
    connection && client
      ? new AtlasModelSource(client, connection.scopeName, stage.value.trim() || 'release')
      : undefined;
}

// Erste verbundene Verbindung automatisch übernehmen; verschwindet sie,
// Auswahl (und Quelle) verwerfen.
watch(
  connections,
  (list) => {
    if (!selectedId.value && list.length) {
      selectedId.value = list[0].id;
      apply();
    } else if (selectedId.value && !list.some((c) => c.id === selectedId.value)) {
      selectedId.value = list[0]?.id ?? '';
      apply();
    }
  },
  { immediate: true },
);

/** Erneut nach Verbindungen sehen (der Atlas Browser meldet sich nicht). */
export function refreshConnections(): void {
  tick.value++;
  if (!selectedId.value && connections.value.length) {
    selectedId.value = connections.value[0].id;
  }
  apply();
}
