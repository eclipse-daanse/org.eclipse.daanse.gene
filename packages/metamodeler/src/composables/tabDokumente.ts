/**
 * Ein Metamodell je Editor-Tab.
 *
 * Der Editor-Bereich zeigt immer nur den vorderen Tab und baut ihn beim
 * Wechsel neu auf (`:key="activeTab.id"`). Lebte die Instanz in der
 * Tab-Komponente, wäre beim Zurückwechseln alles weg — geladenes Modell,
 * Auswahl, ungespeicherte Änderungen.
 *
 * Deshalb liegen die Instanzen hier, an der Tab-Id. Die Komponente holt sich
 * beim Aufbau dieselbe wieder; freigegeben wird erst, wenn der Tab schließt.
 */
import { useMetamodeler, setActiveMetamodeler, clearActiveMetamodeler } from './useMetamodeler'

type MetamodelerInstanz = ReturnType<typeof useMetamodeler>

const instanzen = new Map<string, MetamodelerInstanz>()

/** Die Tab-Id zu einer Datei — eine Datei, ein Tab. */
export function tabIdFuer(sourceFile: string): string {
  return `metamodel:${sourceFile}`
}

/** Die Instanz des Tabs; beim ersten Aufruf wird sie angelegt. */
export function metamodelerFuerTab(tabId: string): MetamodelerInstanz {
  let instanz = instanzen.get(tabId)
  if (!instanz) {
    instanz = useMetamodeler()
    instanzen.set(tabId, instanz)
  }
  return instanz
}

/** Ob der Tab schon ein geladenes Modell hat — dann nicht erneut parsen. */
export function tabIstGeladen(tabId: string): boolean {
  return !!instanzen.get(tabId)?.resource.value
}

/** Meldet die Instanz des Tabs als die vordere. */
export function tabNachVorn(tabId: string): void {
  const instanz = instanzen.get(tabId)
  if (instanz) setActiveMetamodeler(instanz)
}

/** Gibt die Instanz frei, wenn der Tab schließt. */
export function tabGeschlossen(tabId: string): void {
  const instanz = instanzen.get(tabId)
  if (!instanz) return
  clearActiveMetamodeler(instanz)
  instanzen.delete(tabId)
}

/** Welche Tabs offen sind — für das Aufräumen geschlossener Tabs. */
export function offeneTabIds(): string[] {
  return [...instanzen.keys()]
}

/** Ungespeicherte Änderungen in einem Tab. */
export function tabIstGeaendert(tabId: string): boolean {
  return instanzen.get(tabId)?.dirty.value === true
}
