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
import { ref, type Ref } from 'tsm:vue'
import type { Resource } from '@emfts/core'
import { useInstanceTree, type SharedState } from './useInstanceTree'

/*
 * A tab holds the same bundle as the shared state: resources, active resource,
 * tree and loading indicator. The module functions - load, set resources - take
 * this bundle as a parameter; nothing is switched to "the front" any more.
 */
const dokumente = new Map<string, SharedState>()

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
  }
  return dokument
}

/** Ob der Tab schon etwas geladen hat — sonst würde erneut geparst. */
export function instanzTabIstGeladen(tabId: string): boolean {
  return (dokumente.get(tabId)?.resources.value.length ?? 0) > 0
}

/** Gibt das Dokument frei, wenn der Tab schließt. */
export function instanzTabGeschlossen(tabId: string): void {
  dokumente.delete(tabId)
}

/** Welche Tabs offen sind — für das Wiederherstellen nach einem Ansichtswechsel. */
export function offeneInstanzTabIds(): string[] {
  return [...dokumente.keys()]
}
