/**
 * Was die beiden Quell-Tabs melden, wenn Modelle geladen sind.
 *
 * Ein Objekt statt mehrerer Argumente, weil der Data-Atlas-Assistent mehr
 * braucht als die Kandidatenliste: im Datei-Modus muss zu **jedem**
 * referenzierten Package der Pfad seiner `.ecore` bekannt sein, sonst schreibt
 * der Serializer einen Href, der nicht auflöst. Die Dateinamen kennt nur der
 * Ladevorgang.
 */
import type { EPackage } from '@emfts/core';

export interface ModelSourcePayload {
  /** Packages, aus denen Datensätze werden können. */
  candidates: EPackage[];
  /** Alle in diesem Lauf registrierten Packages, Abhängigkeiten eingeschlossen. */
  all: EPackage[];
  /** Dateiname je Package aus `all`, gleiche Reihenfolge — leer, wenn unbekannt. */
  fileNames?: (string | undefined)[];
  warnings: string[];
}
