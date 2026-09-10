/**
 * Was die beiden Quell-Tabs melden, wenn Modelle geladen sind.
 *
 * Ein Objekt statt mehrerer Argumente, damit es erweiterbar bleibt. Dateinamen
 * kommen nicht vor: Verweise auf Modellklassen entstehen immer über den
 * nsURI — wo eine `.ecore` liegt, ist für die erzeugte Konfiguration
 * bedeutungslos.
 */
import type { EPackage } from '@emfts/core';

export interface ModelSourcePayload {
  /** Packages, aus denen Datensätze werden können. */
  candidates: EPackage[];
  /** Alle in diesem Lauf registrierten Packages, Abhängigkeiten eingeschlossen. */
  all: EPackage[];
  warnings: string[];
}
