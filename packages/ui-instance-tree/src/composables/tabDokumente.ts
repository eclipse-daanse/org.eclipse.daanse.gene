/**
 * Eine Instanzdatei je Editor-Tab.
 *
 * Der Editor-Bereich zeigt immer nur den vorderen Tab und baut ihn beim
 * Wechsel neu auf. Lebte der Baum in der Tab-Komponente, wäre beim
 * Zurückwechseln alles weg — geladene Resource, Auswahl, aufgeklappte Knoten.
 *
 * Deshalb liegen die Bäume hier, an der Tab-Id. Jeder hat seine eigene
 * Resource-Liste; die Resourcen selbst liegen weiter im gemeinsamen
 * ResourceSet, Querverweise zwischen zwei offenen Dateien bleiben also
 * auflösbar.
 */
import { ref, watch, type Ref, type WatchStopHandle } from 'tsm:vue'
import type { Resource } from '@emfts/core'
import { useInstanceTree, type SharedState } from './useInstanceTree'

/*
 * A tab holds the same bundle as the shared state: resources, active resource,
 * tree and loading indicator. The module functions - load, set resources - take
 * this bundle as a parameter; nothing is switched to "the front" any more.
 */
const dokumente = new Map<string, SharedState>()

/**
 * Who is told about the resources of the open documents - the problems
 * service, which validates them live. Set by the plugin; kept out of here so
 * the tree does not depend on the problems panel.
 */
export interface DocumentResourceWatcher {
  attach(resource: Resource): void
  detach(resource: Resource): void
}

let watcher: DocumentResourceWatcher | null = null
/** The resources each document has handed to the watcher, and how to stop following it */
const followed = new Map<string, { resources: Set<Resource>; stop: WatchStopHandle }>()

/** Hands every resource of a document to the watcher as it comes and goes */
function follow(tabId: string, dokument: SharedState): void {
  if (followed.has(tabId)) return
  const resources = new Set<Resource>()
  const stop = watch(
    () => [...dokument.resources.value],
    (now: Resource[]) => {
      if (!watcher) return
      for (const resource of now) {
        if (!resources.has(resource)) {
          resources.add(resource)
          watcher.attach(resource)
        }
      }
      for (const resource of [...resources]) {
        if (!now.includes(resource)) {
          resources.delete(resource)
          watcher.detach(resource)
        }
      }
    },
    { immediate: true, flush: 'sync' }
  )
  followed.set(tabId, { resources, stop })
}

/** Stops following a document and lets its resources go */
function unfollow(tabId: string): void {
  const entry = followed.get(tabId)
  if (!entry) return
  entry.stop()
  followed.delete(tabId)
  for (const resource of entry.resources) watcher?.detach(resource)
}

/**
 * Sets who is told about the documents' resources. Documents already open
 * are handed over at once - the problems service may arrive after them.
 */
export function setDocumentResourceWatcher(next: DocumentResourceWatcher | null): void {
  for (const tabId of [...followed.keys()]) unfollow(tabId)
  watcher = next
  if (!watcher) return
  for (const [tabId, dokument] of dokumente) follow(tabId, dokument)
}

/** Die Tab-Id zu einer Datei — eine Datei, ein Tab. */
export function instanzTabIdFuer(filePath: string): string {
  return `instance:${filePath}`
}

/** Das Dokument des Tabs; beim ersten Aufruf wird es angelegt. */
export function instanzTabDokument(tabId: string): SharedState {
  let dokument = dokumente.get(tabId)
  if (!dokument) {
    const resources = ref<Resource[]>([])
    const activeResource = ref<Resource | null>(null)
    dokument = {
      resources,
      activeResource,
      instance: useInstanceTree(resources, activeResource),
      isLoading: ref(false),
      loadingName: ref('')
    }
    dokumente.set(tabId, dokument)
    follow(tabId, dokument)
  }
  return dokument
}

/** Ob der Tab schon etwas geladen hat — sonst würde erneut geparst. */
export function instanzTabIstGeladen(tabId: string): boolean {
  return (dokumente.get(tabId)?.resources.value.length ?? 0) > 0
}

/** Gibt das Dokument frei, wenn der Tab schließt. */
export function instanzTabGeschlossen(tabId: string): void {
  unfollow(tabId)
  dokumente.delete(tabId)
}

/** Welche Tabs offen sind — für das Wiederherstellen nach einem Ansichtswechsel. */
export function offeneInstanzTabIds(): string[] {
  return [...dokumente.keys()]
}
