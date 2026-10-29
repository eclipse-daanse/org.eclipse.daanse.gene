<script setup lang="ts">
/**
 * The file of a Document: `reference` is entered as a URL or chosen from the
 * workspace's files; images (png, svg, jpg ...) and PDFs show inline - a PDF
 * in the browser's own viewer (pages, zoom), with links to open it in a new
 * tab or download it - anything else is a link.
 *
 * Test ids: `<testId>` on the block, `.Reference` the input, `.Choose` the
 * workspace button, `.Preview` the image, PDF or link.
 */
import { computed, inject, onBeforeUnmount, ref, watch } from 'tsm:vue'
import { attr } from '../composables/documentation'
import { setByName } from '../composables/creation'
import {
  documentFiles,
  documentKind,
  documentUrl,
  findFile,
  isUrl,
  referenceFor,
  typeFor
} from '../composables/documentFiles'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  object: any
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!

const reference = computed(() => {
  void props.version
  return String(attr(props.object, 'reference') ?? '')
})

const kind = computed(() => {
  void props.version
  return documentKind(props.object)
})

/* ── the file's URL ──────────────────────────────────────────────── */

const url = ref<string | null>(null)
const missing = ref(false)
let revoke: string | null = null

function release(): void {
  if (revoke) URL.revokeObjectURL(revoke)
  revoke = null
}

watch([reference, kind], async () => {
  release()
  url.value = null
  missing.value = false
  if (!reference.value.trim()) return
  const found = await documentUrl(props.object)
  if (!found) {
    missing.value = true
    return
  }
  url.value = found.url
  if (found.revoke) revoke = found.url
}, { immediate: true })

onBeforeUnmount(release)

const fileName = computed(() => reference.value.split(/[\\/]/).pop() || reference.value)

/* ── entering the reference ──────────────────────────────────────── */

function setReference(value: string, type?: string): void {
  editing.change(() => {
    setByName(props.object, 'reference', value)
    // The type follows a chosen file; an entered URL keeps a type already given
    if (type) setByName(props.object, 'type', type)
  })
}

function onInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim()
  const ending = typeFor(value)
  const known = ['png', 'svg', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf'].includes(ending)
  setReference(value, known && !String(attr(props.object, 'type') ?? '') ? ending : undefined)
}

const choosing = ref(false)
const filter = ref('')

const files = computed(() => {
  const f = filter.value.trim().toLowerCase()
  return documentFiles().filter(e => !f || e.path.toLowerCase().includes(f))
})

function choose(entry: any): void {
  setReference(referenceFor(props.object, entry), typeFor(entry.name))
  choosing.value = false
}

const local = computed(() => !!reference.value && !isUrl(reference.value) && !!findFile(props.object, reference.value))
</script>

<template>
  <div class="document" :data-testid="testId">
    <div class="bar">
      <span class="label">Datei</span>
      <input
        :value="reference"
        class="reference"
        placeholder="URL oder Pfad im Workspace"
        aria-label="Referenz"
        :data-testid="`${testId}.Reference`"
        @change="onInput"
      />
      <button type="button" class="choose" :data-testid="`${testId}.Choose`" @click="choosing = !choosing">Workspace …</button>
    </div>

    <div v-if="choosing" class="chooser">
      <input v-model="filter" placeholder="Datei filtern …" aria-label="Datei filtern" />
      <ul>
        <li v-for="e in files" :key="e.path" @click="choose(e)">{{ e.path }}</li>
        <li v-if="!files.length" class="none">Keine Bilder oder PDFs im Workspace</li>
      </ul>
    </div>

    <div v-if="reference" class="preview" :data-testid="`${testId}.Preview`">
      <p v-if="missing" class="missing">
        {{ isUrl(reference) ? 'Nicht erreichbar' : 'Datei nicht im Workspace gefunden' }}: {{ reference }}
      </p>
      <img v-else-if="kind === 'image' && url" :src="url" :alt="fileName" class="image" />
      <template v-else-if="kind === 'pdf' && url">
        <div class="pdf-bar">
          <i class="pi pi-file-pdf"></i>
          <span class="pdf-name">{{ fileName }}</span>
          <a :href="url" target="_blank" rel="noopener" class="open" title="In neuem Tab öffnen"><i class="pi pi-external-link"></i></a>
          <a :href="url" :download="fileName" class="open" title="Herunterladen"><i class="pi pi-download"></i></a>
        </div>
        <!-- The browser's PDF viewer; the frame's lower edge drags to resize -->
        <div class="pdf-frame">
          <iframe :src="url" :title="fileName"></iframe>
        </div>
      </template>
      <a v-else-if="url" :href="url" target="_blank" rel="noopener" class="open">
        <i :class="kind === 'pdf' ? 'pi pi-file-pdf' : 'pi pi-external-link'"></i>
        {{ kind === 'pdf' ? `${fileName} öffnen` : fileName }}
      </a>
      <span v-if="local" class="where">aus dem Workspace</span>
    </div>
  </div>
</template>

<style scoped>
.document {
  margin-top: 0.35rem;
  font-size: 0.8rem;
}

.bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.label {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

input {
  font: inherit;
  color: var(--text-color);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
}

input:hover,
input:focus {
  border-color: var(--surface-border);
  background: var(--surface-ground);
}

.reference {
  flex: 1 1 auto;
  min-width: 0;
}

.choose {
  font: inherit;
  font-size: 0.75rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
  white-space: nowrap;
}

.chooser {
  margin: 0.3rem 0;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-card, var(--surface-ground));
}

.chooser input {
  width: 100%;
  box-sizing: border-box;
  border-bottom-color: var(--surface-border);
}

.chooser ul {
  max-height: 12rem;
  overflow: auto;
  margin: 0;
  padding: 0.2rem 0;
  list-style: none;
}

.chooser li {
  padding: 0.2rem 0.6rem;
  cursor: pointer;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.75rem;
}

.chooser li:hover {
  background: var(--surface-hover);
}

.chooser li.none {
  cursor: default;
  font-family: inherit;
  color: var(--text-color-secondary);
}

.preview {
  margin-top: 0.4rem;
}

.image {
  display: block;
  max-width: 100%;
  max-height: 24rem;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-ground);
}

.pdf-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  color: var(--text-color-secondary);
}

.pdf-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-frame {
  height: 32rem;
  min-height: 10rem;
  resize: vertical;
  overflow: hidden;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-ground);
}

.pdf-frame iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}

.open {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--primary-color);
  cursor: pointer;
}

.missing {
  margin: 0;
  color: var(--text-color-secondary);
  font-style: italic;
}

.where {
  margin-left: 0.5rem;
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}
</style>
