<script setup lang="ts">
/**
 * Saves a file from the Atlas into a folder of the explorer.
 *
 * Asks for name and folder, writes the file and opens it with its default
 * editor - in a tab of its own, so there is nothing to decide about merging.
 * Only folders opened in the explorer are offered: the file is meant to be
 * edited and saved there afterwards.
 */
import { ref, computed, watch, inject } from 'tsm:vue'
import { Dialog, Button, Dropdown, InputText } from 'tsm:primevue'
import { useAtlasDownload } from '../composables/atlasDownload'

interface FolderOption {
  label: string
  sourceId: string
  path: string
}

const tsm = inject<any>('tsm')
const download = useAtlasDownload()

const fileName = ref('')
const folder = ref<FolderOption | null>(null)
const error = ref<string | null>(null)
const saving = ref(false)

const visible = computed(() => download.request.value !== null)

function fileSystem(): any {
  return tsm?.getService?.('gene.filesystem')
}

/** Every folder of every local source, as "source / path" */
const folders = computed<FolderOption[]>(() => {
  const fs = fileSystem()
  if (!fs) return []
  const options: FolderOption[] = []
  for (const source of fs.sources?.value ?? []) {
    if (source.type !== 'local') continue
    options.push({ label: source.name, sourceId: source.id, path: '' })
    const walk = (entries: any[]) => {
      for (const entry of entries ?? []) {
        if (!entry.isDirectory) continue
        options.push({ label: `${source.name} / ${entry.path}`, sourceId: source.id, path: entry.path })
        walk(entry.children)
      }
    }
    walk(fs.filesBySource?.get(source.id) ?? [])
  }
  return options
})

/** Where the explorer's selection is - the folder one is most likely working in */
function defaultFolder(): FolderOption | null {
  const selected = fileSystem()?.selectedFile?.value
  if (selected?.sourceId) {
    const dir = selected.isDirectory ? selected.path : String(selected.path ?? '').split('/').slice(0, -1).join('/')
    const match = folders.value.find((f: FolderOption) => f.sourceId === selected.sourceId && f.path === dir)
    if (match) return match
  }
  return folders.value[0] ?? null
}

const exists = computed(() => {
  if (!folder.value || !fileName.value.trim()) return false
  const path = folder.value.path ? `${folder.value.path}/${fileName.value.trim()}` : fileName.value.trim()
  return !!fileSystem()?.getFileByPath?.(folder.value.sourceId, path)
})

watch(visible, (open: boolean) => {
  if (!open) return
  fileName.value = download.request.value?.filename ?? ''
  folder.value = defaultFolder()
  error.value = null
})

async function save() {
  const req = download.request.value
  const name = fileName.value.trim()
  if (!req || !folder.value || !name) return
  if (name.includes('/')) {
    error.value = 'Der Dateiname darf keinen Schrägstrich enthalten.'
    return
  }
  saving.value = true
  error.value = null
  try {
    const fs = fileSystem()
    const entry = await fs.writeNewTextFile(folder.value.sourceId, folder.value.path, name, req.content)
    download.close()
    if (!entry) return
    fs.selectedFile.value = entry
    const art = tsm?.getService?.('gene.editor.context')?.editorFuer?.(entry.path, req.content)
    await art?.open?.(entry, req.content)
  } catch (e: any) {
    error.value = e?.message ?? String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v: boolean) => { if (!v) download.close() }"
    header="Aus dem Model Atlas herunterladen"
    :modal="true"
    :style="{ width: '460px' }"
  >
    <div class="download-form">
      <template v-if="folders.length > 0">
        <label for="atlas-download-name">Dateiname</label>
        <InputText id="atlas-download-name" v-model="fileName" autofocus @keydown.enter="save" />
        <label for="atlas-download-folder">Verzeichnis</label>
        <Dropdown
          input-id="atlas-download-folder"
          v-model="folder"
          :options="folders"
          option-label="label"
          filter
          placeholder="Verzeichnis wählen"
        />
        <p v-if="exists" class="download-hint">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          Die Datei gibt es dort schon; sie wird überschrieben.
        </p>
      </template>
      <p v-else class="download-hint">
        <i class="pi pi-folder-open" aria-hidden="true"></i>
        Kein lokaler Ordner geöffnet. Im Explorer zuerst einen Ordner hinzufügen.
      </p>
      <div v-if="error" class="download-error">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        {{ error }}
      </div>
    </div>
    <template #footer>
      <Button label="Abbrechen" severity="secondary" @click="download.close()" />
      <Button
        :label="exists ? 'Überschreiben' : 'Herunterladen'"
        icon="pi pi-download"
        :severity="exists ? 'warn' : undefined"
        :disabled="!folder || !fileName.trim()"
        :loading="saving"
        @click="save"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.download-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.download-form label {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.download-hint {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.download-error {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--p-red-500);
}
</style>
