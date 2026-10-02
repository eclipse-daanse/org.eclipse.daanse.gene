# Plan: Perspektiven, Tabs und Dateiansichten

**Stand:** Entwurf, 2026-10-02. Grundlage ist PR #169 (`feat/editor-tabs`).

## Das Ziel

Drei Perspektiven, mehr nicht:

1. **Explorer** — links der Dateibaum
2. **Atlas** — links der Atlas-Baum
3. **Einstellungen**

Der Navigator links oben und die Tab-Leiste gehören zur Perspektive. Eine Datei
wird ausgewählt, erscheint als Tab, und **alles Weitere hängt am Tab**: der
Baum der Datei (links unten), ihre Eigenschaften, ihre Modelle, ihre Probleme.
Der Tab trägt die Ansicht, nicht die Anwendung.

Eine Datei hat dabei nicht *eine* Ansicht. Ein eorm-Mapping lässt sich als
eorm-Ansicht öffnen oder als gewöhnlicher Instanzbaum; welche es wird,
entscheidet eine Regel im Workspace, sonst das Metamodell der Wurzel, sonst die
Endung. „Öffnen mit" stellt die Kandidaten zur Wahl.

## Was heute im Weg steht

`App.vue` hat drei Aufbau-Funktionen mit zusammen rund 1400 Zeilen:

| Funktion | Zeilen | Panels |
|---|---|---|
| `setupFileExplorerPerspective` | 168 | Explorer oben, beide Bäume unten |
| `setupModelEditorPerspective` | 276 | Model Browser rechts, Probleme unten |
| `setupMetamodelerPerspective` | 945 | Model Browser rechts, Probleme unten |

Jede beginnt mit `layout.clearAll()` und baut alles neu. Beim Öffnen einer
Datei wird umgeschaltet (`switchTo('metamodeler')`, bzw. der Model-Editor-Aufbau
beim Öffnen des Workspace). Daraus folgen genau die beobachteten Fehler:

- Das Layout wird abgerissen, der Explorer oben links verschwindet.
- Eine Perspektive ist aktiv, die in der Leiste nicht mehr steht — also wirkt
  keine ausgewählt.
- Die Ansicht hängt an der Perspektive statt am Tab.

Die Perspektiven sind derzeit nur **ausgeblendet**, nicht abgeschafft. Das ist
der eigentliche Fehler.

## Schnitt

Fünf Teile mit je einer Aufgabe. Keiner kennt die Aufgaben der anderen.

### 1. Rahmen — `ui-layout`

Weiß nichts über Dateien oder Modelle. Stellt bereit:

- die Zonen: links oben, links unten, rechts, unten, Editorfläche
- Tab-Leiste mit Öffnen, Wählen, Schließen (`onEditorClosed`)
- Panel-Registrierung je Zone, Größen, Sichtbarkeit

*Unverändert gegenüber heute, bis auf die zweite Zone links — die ist gebaut.*

### 2. Perspektive — `gene-app`, schlank

Baut nur den Rahmen und entscheidet, **welcher Navigator oben links steht**:

| Perspektive | Navigator oben links |
|---|---|
| Explorer | Dateibaum |
| Atlas | Atlas-Baum |
| Einstellungen | — |

Mehr tut sie nicht. Insbesondere baut sie **nichts** auf, was zu einer Datei
gehört, und sie wird **nie** beim Öffnen einer Datei gewechselt — nur durch
einen Klick in der Leiste.

### 3. Welche Ansicht zu welcher Datei — `ui-instance-tree/context/editorRegistry`

Vorhanden. Führt die Ansichten und löst auf: Workspace-Regel → nsURI der Wurzel
→ Endung und Rang. Kennt keine Panels und kein Layout.

### 4. Dateiansicht — je Dateityp ein eigenes Modul

Das ist der neue Schnitt. Heute steckt diese Arbeit in den Aufbau-Funktionen
von `App.vue`. Künftig beschreibt jede Ansicht sich selbst:

```ts
interface EditorArt {
  id: string
  name: string
  icon?: string
  extensions: string[]
  nsURIs?: string[]
  priority?: number

  /** Öffnet die Datei und legt ihren Tab an. */
  oeffnen(datei: Datei, inhalt: string): Promise<void>

  /** Was zu dieser Ansicht gehört — sichtbar, solange ihr Tab vorn liegt. */
  panels?: {
    /** links unten, der Baum der Datei */
    baum?: string
    /** rechts */
    nebenan?: string[]
    /** unten */
    unten?: string[]
  }
}
```

Je Ansicht ein Modul in `packages/gene-app/src/editors/`:
`metamodellEditor.ts`, `instanzEditor.ts`, später `eormEditor.ts` und so fort.
Jedes registriert seine Panels einmal beim Start und meldet sich bei der
Registry an. `App.vue` verdrahtet nur noch, statt Layouts zu bauen.

### 5. Tab-Zustand — vorhanden

- Dokument je Tab-Id (`tabDokumente`), überlebt, dass der Editorbereich den Tab
  beim Wechsel zerstört
- Kontext je Tab, je Modus ein vorderer
- Fassade auf das vordere Dokument für Panels im Seitenbereich

**Neu:** ein kleiner *Tab-Layout-Dienst*. Er hört auf den Tab-Wechsel und wählt
die Panels, die die Ansicht des Tabs angemeldet hat. Mehr nicht — er baut
nichts auf und räumt nichts ab.

## Was TSM 0.1 dazu beiträgt

Die neue Variante (`@eclipse-daanse/tsm@0.1.0-next.1`, installiert ist
`0.0.1-next.2`) bringt ein Komponentenmodell, das genau die Stellen trägt, an
denen ich oben von Hand verdrahten wollte:

| Mittel | Wofür hier |
|---|---|
| `@injectAll(EDITOR_ART)` | Alle Dateiansichten einsammeln, ohne zentrale Liste. Heute meldet `App.vue` acht Ansichten selbst an — künftig bringt jedes Plugin seine mit, und der Sammler bekommt sie. |
| `@bind` / `@unbind` | Ansichten kommen und gehen zur Laufzeit. Damit entfallen die Warteschleifen, die ich gerade gebaut habe (`versucheEditorArten`, `trySetupResourceSet`, der Explorer oben) — die sind nichts als fehlende Abhängigkeitsauflösung. |
| `serviceId<T>()` | `'gene.editor.context'`, `'gene.resourceset'` sind heute lose Strings. Mit einem Vertrag daran wird ein Fehlgriff zum Übersetzungsfehler. |
| Konfiguration je Komponente (PID) | Passt auf die Zuordnungen aus dem Workspace: welche Ansicht welche Datei öffnet. |
| Requirements/Capabilities | Beantwortet vor dem Laden, welche Ansicht laufen kann — statt im Betrieb zu merken, dass ein Dienst fehlt. |

Das ist kein Beiwerk, sondern der Grund, warum der Schnitt oben überhaupt
hält: Die Registry der Ansichten wird zur Sammelstelle eines Dienstes, nicht zu
einer Liste, die jemand pflegt.

**Entschieden:** Das Upgrade kommt **vor** dem Layout-Umbau. Sonst entstehen
Warteschleifen, die danach wieder verschwinden — und genau die haben beim
Vorführen das falsche Bild gezeigt.

## Schritte

1. **Perspektivwechsel beim Öffnen entfernen.** `switchTo(...)` und der
   Model-Editor-Aufbau beim Öffnen des Workspace fallen weg. Eine Datei öffnen
   heißt: Tab anlegen, Kontext anmelden — sonst nichts.

2. **Arbeitslayout einmal aufbauen.** Die Panels, die Dateiansichten brauchen
   (Model Browser, Probleme, Suche, beide Bäume), werden einmal registriert, so
   wie heute der Explorer. Sichtbar wird, was der vordere Tab bestimmt.

3. **Tab-Layout-Dienst.** Beim Aktivieren eines Tabs die Panels seiner Ansicht
   wählen; beim Schließen des letzten Tabs auf die Workspace-Vorschau
   zurückfallen.

4. **Die 1400 Zeilen zerlegen.** `setupModelEditorPerspective` und
   `setupMetamodelerPerspective` werden zu je einem Editor-Modul mit Panels und
   `oeffnen`. Was dort an Allgemeinem steckt (Problems-Panel, Suche), wandert in
   das Arbeitslayout.

5. **Perspektiven auf drei bringen.** Explorer, Atlas, Einstellungen als
   schlanke Rahmen; die übrigen Registrierungen entfallen, statt nur
   ausgeblendet zu werden.

6. **Übrige Ansichten nachziehen.** eorm, SensiNact-Mapping, Transformation,
   Constraints, DMN, Datengenerator bekommen je ein Modul mit eigenem Tab und
   eigenem Zustand — heute rufen sie noch den alten Öffner ihres Plugins.

Davor steht, als Schritt 0:

0. **TSM 0.1.** Dienste auf `serviceId<T>()`, Ansichten als Komponenten mit
   `@component({ service: [EDITOR_ART] })`, Sammelstelle mit `@injectAll`. Die
   Warteschleifen entfallen, bevor der Layout-Umbau sie vermehrt.

   **Erledigt.** Der Vertrag steht in `packages/gene-contracts` — außerhalb
   jedes Moduls, damit ihn jedes importieren kann, ohne eines der anderen zu
   kennen. `EDITOR_ART` ist ein `serviceId<EditorArt>`, die acht Ansichten
   liegen als Komponenten in `packages/gene-app/src/editors/`, und
   `EditorArtCollector` in ui-instance-tree sammelt sie mit `@injectAll`. Die
   Öffner der Wizards sind dynamische Referenzen (`@bind`/`@unbind`): Das
   Plugin darf später kommen und wieder gehen, ohne dass die Ansicht neu
   gebaut wird. `App.vue` meldet nichts mehr an, `whenService` auf den
   Kontext-Dienst ist dort weg.

   Offen bleibt daran: die übrigen Dienstnamen (`gene.editor.context`,
   `gene.resourceset` und die anderen rund zwanzig Strings) haben noch keinen
   Vertrag, und die Ansichten liegen noch in gene-app statt in ihren Plugins —
   das ist Schritt 6, und dann ist es ein Verschieben der Datei.

Jeder Schritt ist für sich lauffähig. Nach 1–3 verschwindet das Abreißen des
Layouts, nach 4–5 stimmt der Schnitt, nach 6 ist das Bild vollständig.

## Offen

**Entschieden:** Ein Tab bringt sein **eigenes Layout** mit; die Eigenschaften
leben darin in der Mitte. Der Tab ist damit nicht ein Fenster, sondern eine
Fläche mit eigener Aufteilung — was eine Ansicht an Bereichen braucht, bestimmt
sie selbst.
- **Kein Tab offen:** Workspace-Vorschau wie heute, oder leere Fläche?
- **Atlas-Perspektive:** Öffnet ein Doppelklick dort ebenfalls einen Tab (dann
  ist der Atlas ein Navigator wie der Explorer), oder bleibt es beim Laden in
  den Workspace?
- **Gespeichertes Layout:** Die `.wsp` hält Größen und Sichtbarkeiten je
  Perspektive. Mit Tab-abhängigen Panels braucht es eine Entscheidung, was
  davon zur Perspektive und was zur Ansicht gehört.
