/**
 * OCL-Adapter fuer den uimodel-composer (Plan Phase 2, F5).
 *
 * Der Composer wertet Expressions SYNCHRON aus (evaluateBoolean →
 * validator.evaluateExpression), gene's OCL-Engine (ui-problems-panel →
 * @emfts/ocl.engine) arbeitet ASYNCHRON. Der Adapter ueberbrueckt das mit
 * einem reaktiven Cache:
 *
 * 1. Erster Aufruf einer (Expression, Objekt)-Kombination: asynchrone
 *    Auswertung wird angestossen, solange gilt fail-open (true).
 * 2. Ergebnis trifft ein → Cache + Version-Bump → alle computeds, die den
 *    Adapter benutzt haben (useVisibility/useValidation lesen die Version
 *    beim Aufruf), werten neu aus und sehen den Cache-Treffer.
 * 3. Modellaenderungen: bumpModelVersion() invalidiert den Cache, die
 *    computeds werten neu aus (→ erneute asynchrone Auswertung).
 */

import { ref } from 'tsm:vue'
import { bumpExpressionTick } from '@emfts/uimodel-composer'

// Reaktive Version: wird bei jedem eingetroffenen Ergebnis und bei
// Modellaenderungen erhoeht. Von evaluateExpression GELESEN, damit Vue-
// computeds den Adapter als Abhaengigkeit tracken.
const version = ref(0)

// Cache: expressionBody + Objekt-Identitaet → letztes bekanntes Ergebnis.
// WICHTIG: der Composer wrappt das EObject pro Auswertung in einen NEUEN
// Proxy — eine WeakMap auf den Proxy wuerde nie treffen. Der Proxy leitet
// Symbol-Zugriffe (get und set ohne eigene Traps) ans Zielobjekt durch,
// deshalb verankern wir die Identitaet als Symbol-Property am EObject.
const ID_SYMBOL = Symbol('gene.ocl.objectId')
let nextObjectId = 1
const cache = new Map<string, boolean>()
const pending = new Set<string>()

// Asynchrone Query-Funktion (gene OCL) — wird bei Aktivierung gesetzt
type OclQuery = (obj: unknown, expression: string) => Promise<unknown>
let queryFn: OclQuery | null = null

function objectKey(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return String(obj)
  const target = obj as Record<symbol, number>
  let id = target[ID_SYMBOL]
  if (!id) {
    id = nextObjectId++
    target[ID_SYMBOL] = id
  }
  return `#${id}`
}

/** Vom Plugin bei activate() gesetzt (lazy geladen). */
export function setOclQuery(fn: OclQuery | null): void {
  queryFn = fn
}

/** Modellaenderung → Cache invalidieren und Neubewertung anstossen.
 * Bumpt auch den Expression-Tick des Composers (emf.ts.ui#7): damit
 * werten Bindings, Visibility, Validierung UND Conditional/ForEach
 * live neu aus. */
export function bumpModelVersion(): void {
  cache.clear()
  version.value++
  bumpExpressionTick()
}

/**
 * Validator-Klasse im Format, das registerOclEvaluator() des Composers
 * erwartet: pro Auswertung wird eine Instanz erzeugt, evaluateExpression
 * liefert synchron ein boolesches Ergebnis. Zustand (Cache/Version) ist
 * bewusst modulglobal, damit alle Instanzen ihn teilen.
 */
export class GeneOclValidator {
  evaluateExpression(body: string, wrappedContext: unknown): boolean {
    // Reaktive Abhaengigkeit herstellen — Vue-computeds, die (indirekt)
    // hierher gelangen, werten bei version-Bump erneut aus.
    void version.value

    const key = `${objectKey(wrappedContext)}::${body}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    if (queryFn && !pending.has(key)) {
      pending.add(key)
      queryFn(wrappedContext, body)
        .then((result) => {
          cache.set(key, result === true)
        })
        .catch(() => {
          // Auswertungsfehler → fail-open, aber cachen (kein Retry-Sturm)
          cache.set(key, true)
        })
        .finally(() => {
          pending.delete(key)
          version.value++
        })
    }

    // Fail-open, solange kein Ergebnis vorliegt (Composer-Konvention:
    // fehlende/kaputte Expression blockiert die UI nicht).
    return true
  }
}
