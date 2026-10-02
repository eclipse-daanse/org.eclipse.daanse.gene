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
import {
  useInstanceTree,
  setActiveInstanceDocument,
  clearActiveInstanceDocument,
  type SharedState
} from './useInstanceTree'

/*
 * Ein Tab haelt denselben Verbund wie der gemeinsame Zustand: Resourcen,
 * aktive Resource, Baum und Ladeanzeige. Dadurch koennen die Funktionen des
 * Moduls — laden, Resourcen setzen — unveraendert auf dem vorderen Tab
 * arbeiten.
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

/** Meldet den Baum des Tabs als den vorderen. */
export function instanzTabNachVorn(tabId: string): void {
  const dokument = dokumente.get(tabId)
  if (dokument) setActiveInstanceDocument(dokument)
}

/** Gibt das Dokument frei, wenn der Tab schließt. */
export function instanzTabGeschlossen(tabId: string): void {
  const dokument = dokumente.get(tabId)
  if (!dokument) return
  clearActiveInstanceDocument(dokument)
  dokumente.delete(tabId)
}

/** Welche Tabs offen sind — für das Wiederherstellen nach einem Ansichtswechsel. */
export function offeneInstanzTabIds(): string[] {
  return [...dokumente.keys()]
}
