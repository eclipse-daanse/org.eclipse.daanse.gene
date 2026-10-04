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

## Stand

**1–3 erledigt.** Es gibt eine Arbeitsfläche, einmal gebaut. Die Panels gehören
der Anwendung; welches zu sehen ist, entscheidet der vordere Tab. Der
Tab-Layout-Dienst (`gene-app/src/layout/tabLayout.ts`) hält fest, welche Ansicht
einen Tab trägt, und wählt beim Wechsel die Panels, die sie unter
`EditorArt.panels` angemeldet hat — er baut nichts auf und räumt nichts ab.
Beim Öffnen einer Datei wird keine Perspektive mehr gewechselt.

**4 teilweise.** Aus den rund 520 Zeilen der beiden Perspektiv-Aufbauten sind
190 geworden, weil beide dasselbe taten. Was blieb, steht noch in `App.vue`
statt in einem Modul je Dateityp; der Model Browser ist jetzt einer statt zwei,
weil der Kontext des vorderen Tabs sagt, welches Modell darin steht.

**5 anders gelöst als geplant.** Die Perspektiven werden nicht entfernt, sondern
entmachtet: `setupPerspectiveLayout` räumt die Fläche nicht mehr ab, sondern
ergänzt sie. Eine Perspektive wählt den Navigator oben links; was sie in die
Mitte stellen wollte, wird ein Tab. Ihre Registrierung bleibt bestehen, weil sie
weiterhin beschreibt, welches Panel die Ansicht einer Dateiart ist — gezeigt
wird sie in der Leiste nicht mehr.

**Anmelden heißt nicht anzeigen.** Die untere Hälfte links und die rechte Seite
gehören der offenen Datei. Ein Panel dort zu registrieren zeigt es nicht: Die
Zone bleibt leer, bis ein Tab sie beansprucht, und wird wieder leer, wenn er
geht. Vorher fiel `activePrimaryBottomPanel` auf das erste Panel zurück und
`registerPanel` wählte rechts automatisch aus — deshalb standen in der
Explorer-Perspektive ein Instanzbaum und ein Model Browser, obwohl nichts offen
war.

**Ein Workspace zu öffnen wechselt keine Ansicht.** Der Explorer bleibt stehen;
was aus dem Workspace geöffnet wird, erscheint als Tab.

**6 erledigt, soweit es ohne Eingriff in die Plugins geht.** cocl, Transformation
und DMN öffnen einen Tab statt die Perspektive zu wechseln; eorm und SensiNact
landen über denselben Weg als Tab, weil ihr Öffner nichts mehr abräumt. Was
diese Tabs zeigen, kommt noch aus einem Dienst je Dateiart — zwei Tabs derselben
Art tragen also denselben Inhalt. Eigener Zustand je Tab ist Sache des jeweiligen
Plugins und bleibt offen.

## Entscheidung: Der Tab ist eine Fläche (Weg B)

**Stand 2026-10-02, nach dem Vorführen des UDP_MIT_ORM-Workspace.**

### Der Befund

Nach dem Umschalten von `behavioral.ecore` zurück auf `instances.xmi` stand
unten links die Überschrift INSTANCES — mit dem Inhalt des Metamodell-Baums.
Die Panel-Auswahl stimmte, der Kontext nicht.

Das ist kein Fehler an einer Stelle, sondern der Entwurf: Es gibt *einen*
Instanzbaum, *einen* Metamodell-Baum, *einen* Model Browser und *einen*
globalen `currentMode`. Die Panels fragen beim Rendern „wer liegt vorn?" und
holen sich daraus ihren Kontext. Der Tab besitzt nichts — er schaltet einen
gemeinsamen Zustand um. Bleibt eine Umschaltung aus oder kommt sie zu spät,
zeigt das Panel des einen Tabs den Inhalt des anderen. Dasselbe Muster an vier
Stellen:

| geteilt und umgeschaltet | wo |
|---|---|
| `currentMode`, `getCurrentContext()`, `activeTabByMode`, `activateTabContext` | `ui-instance-tree/context/editorContext.ts` |
| gemeinsames Dokument, `setSharedResource`, `useSharedInstanceTree` | `ui-instance-tree/composables/useInstanceTree.ts` |
| vorderes Dokument je Modus, `instanzTabNachVorn`, `zustand()` | `ui-instance-tree/composables/tabDokumente.ts`, `metamodeler/composables/tabDokumente.ts` |
| Panel-Auswahl je Tab, `tabLayout.activateTab` | `gene-app/layout/tabLayout.ts` |

Alle Reparaturen der letzten Runden setzten an den Umschaltpunkten an. Das war
falsch; der Entwurf ist zu ändern.

### Das Ziel

**Ein Tab ist eine Fläche mit eigener Aufteilung und eigenem Kontext.** Baum,
Eigenschaften und Model Browser leben *in* ihm. Er erzeugt seinen
`EditorContext` einmal und reicht ihn mit `provide` an seine Kinder; die
nehmen ihn mit `inject`. Es gibt nichts Gemeinsames mehr, das man umschalten
könnte — und darum auch nichts, was wandern kann.

Was der Anwendung gehört und außerhalb der Tabs bleibt:

- die Aktivitätsleiste und der Navigator links (Explorer-Baum, Atlas-Baum),
  über die volle Höhe
- die Tab-Leiste
- Probleme und Jobs unten, Statusleiste
- die Menüzeile als Ort; was darin steht, liefert der vordere Tab

Was in den Tab wandert und dort bleibt:

```
┌─────────────────────────────────────────────────────┐
│ WORKSPACE │ INSTANCES.XMI × │ BEHAVIORAL.ECORE      │  Tab-Leiste (Rahmen)
├─────────────────────────────────────────────────────┤
│ [Menü des vorderen Tabs]                            │  Menüzeile (Rahmen)
├───────────┬─────────────────────────┬───────────────┤
│ Baum      │ Eigenschaften           │ Model Browser │  Fläche des Tabs
│ der Datei │ des gewählten Objekts   │ dieses Tabs   │  — provide/inject
│           │                         │               │
└───────────┴─────────────────────────┴───────────────┘
```

Die Zone links unten (`primary-bottom`) und die rechte Seite (`secondary`)
werden von Dateiansichten nicht mehr genutzt.

### Schnitt

**`ui-layout` — `EditorTabLayout.vue`.** Eine Komponente mit drei Bereichen
(`left`, `center`, `right`) als Slots, Splitter dazwischen, Bereiche einzeln
zuklappbar. Größen werden **je Ansicht** gemerkt (alle Instanz-Tabs teilen eine
Aufteilung), nicht je Tab. Kennt weder Dateien noch Kontexte.

**`ui-instance-tree` — `InstanceEditorTab.vue`.** Nimmt eine Tab-Id, holt sein
Dokument aus `tabDokumente`, baut daraus *einmal* seinen `EditorContext`,
`provide`t ihn, und füllt die drei Bereiche mit `InstanceTree`, `PropertiesPanel`,
`ModelBrowser`. Diese drei nehmen den Kontext ausschließlich per `inject` —
der Rückgriff auf `getCurrentContext()` entfällt.

**`metamodeler` — `MetamodelEditorTab.vue`.** Dasselbe für `.ecore`, mit
`MetamodelerTree` links.

**`gene-app`.** `oeffneInstanzTab` und `oeffneMetamodellTab` öffnen nur noch
einen Tab mit der jeweiligen Tab-Komponente und der Tab-Id als Prop. Kein
`registerTabContext`, kein `activateTabContext`, kein `selectPanel`. Die
`EditorArt` nennt statt `panels` ihre Tab-Komponente (`component`, das Feld
gibt es bereits).

**Was entfällt.** `tabLayout.ts` samt Dienst `gene.tab.layout`;
`EditorArt.panels`; die Registrierung von `instance-tree`, `metamodeler-tree`,
`model-browser` als Panels; `currentMode`, `setEditorMode`, `getCurrentContext`,
`activeTabByMode`, `registerTabContext`, `activateTabContext`,
`releaseTabContext`.

**Was bleibt und einen „vorderen Tab" braucht — aber als Befehl, nicht als
Panel.** Suche (Strg+Umschalt+F), Speichern, Validieren, „Problem anklicken →
Objekt zeigen", Veröffentlichen in den Atlas. Sie richten sich an die Datei,
die gerade vorn liegt. Dafür gibt es einen kleinen Dienst `gene.editor.front`:
*welcher Tab liegt vorn, welche Art, welches Dokument*. Panels fragen ihn nicht;
nur Befehle und die Menüzeile.

### Etappen

1. **Die Tab-Fläche.** `EditorTabLayout.vue`; `InstanceEditorTab.vue` und
   `MetamodelEditorTab.vue`; `InstanceTree`, `PropertiesPanel`, `ModelBrowser`
   nehmen den Kontext per `inject`; die Öffner in `App.vue` auf die
   Tab-Komponenten umgestellt; die drei globalen Panels nicht mehr registriert.
   *Danach kann nichts mehr wandern.* Der globale Modus existiert noch, wird
   aber von keinem Panel mehr gelesen.

2. **Die Umschaltung abbauen.** `currentMode` und alles, was daran hängt,
   entfernen; `gene.editor.front` für die Befehle; `tabLayout.ts` und
   `EditorArt.panels` weg. Menüzeile fragt `gene.editor.front`.

3. **Das vordere Dokument abbauen.** `loadInstancesFromXMI`,
   `loadResourceStandalone`, `setSharedResource` und die übrigen Modulfunktionen
   bekommen das Dokument als Parameter statt über `zustand()` das vordere zu
   nehmen. Dann gibt es auch in `tabDokumente` nichts Umgeschaltetes mehr.

4. **Die übrigen Ansichten.** cocl, Transformation, DMN, eorm, SensiNact
   bekommen je eine Tab-Komponente mit eigenem Zustand — heute teilen sie
   einen Dienst je Dateiart.

Nach 1 ist der gemeldete Fehler weg und kann nicht wiederkommen. 2 und 3 räumen
auf, was 1 überflüssig macht. 4 ist der Rest aus dem alten Schritt 6.

### Stand

**Etappe 1 erledigt (2026-10-03).** `EditorTabLayout` in ui-layout,
`InstanceEditorTab` in ui-instance-tree, `MetamodelEditorTab` im Metamodeler.
`InstanceTree`, `PropertiesPanel` und `ModelBrowser` nehmen den Kontext nur noch
als Prop oder per `inject` — kein Rückgriff auf einen globalen „aktuellen"
Kontext mehr. Die Öffner in `App.vue` legen nur noch den Tab an; `instance-tree`,
`metamodeler-tree` und `model-browser` werden nicht mehr als Panels registriert.
`tabLayout` und `EditorArt.panels` sind weg, an ihrer Stelle steht
`gene.editor.front` für Befehle und Menüzeile.

Geprüft im Browser: Ecore- und XMI-Tab nebeneinander, viermal hin und her —
links steht jedes Mal der Baum des Tabs, rechts sein Browser, die Auswahl zeigt
seine Eigenschaften. Der globale `currentMode` stand dabei durchgehend auf
`instance` und hat nichts mehr bewirkt; genau das war das Ziel.

**Etappe 2 erledigt (2026-10-03).** `currentMode`, `getCurrentContext`,
`getInstanceContext`/`getMetamodelContext`, die Kontext-Factories und
`registerTabContext`/`activateTabContext`/`releaseTabContext` sind weg — samt
ihren Aufrufern in `App.vue`, `ui-instance-tree` und dem Metamodeler. Der Dienst
`gene.editor.context` ist nur noch Registry der Ansichten plus
`createMetamodelContext`. Geprüft: Tabs wechseln, Auswahl bleibt je Tab erhalten,
Menüzeile folgt dem vorderen Tab.

**Etappe 3 erledigt (2026-10-03).** Kein „vorderes Dokument" mehr. Die
Modulfunktionen des Instanzbaums (`loadInstancesFromXMI`,
`loadResourceStandalone`, `setSharedResource`, `getSharedResource(s)`,
`getObjectByXmiId`, `generateMissingXmiIds`, `getInstanceLoadingState`)
nehmen das Dokument als Parameter; ohne eines meinen sie das gemeinsame, nicht
„das vordere". `instanzTabNachVorn`, `setActiveInstanceDocument` und die
Fassade im Instanzbaum sind weg. Auf der Metamodeller-Seite ersetzt ein
Resolver aus `gene.editor.front` die umgeschaltete `aktiveInstanz`; die Fassade
`useSharedMetamodeler()` dient nur noch Befehlen. In `App.vue` fragen Suche,
Validierung, „Instanz anlegen", „Problem → Objekt" und die Atlas-Veröffentlichung
ausdrücklich nach der vorderen Datei (`vorderesInstanzDokument()`,
`vorderesMetamodell()`); die Lader bekommen das Dokument des Tabs mit.

Geprüft: Ecore- und XMI-Tab, Wechsel hin und her, Auswahl je Tab erhalten;
„Instanz anlegen" aus dem Model Browser landet in der Resource des XMI-Tabs
(2 Objekte), das gemeinsame Dokument bleibt leer; die Fassade des Metamodellers
antwortet mit `probe`, wenn der Ecore-Tab vorn liegt, sonst mit nichts.

Nebenbei behoben: Der Import-Dialog hing an einem `v-if` mit
`tsm.getService(...)`, das nur beim Rendern ausgewertet wurde — mit weniger
Anlässen zum Neu-Rendern erschien er gar nicht mehr. Jetzt per `whenService`.

**Etappe 4 erledigt, soweit es Dateieditoren sind (2026-10-03).** C-OCL,
Transformation und DMN haben je einen Dokument-Speicher je Tab
(`composables/tabDocuments.ts` im jeweiligen Plugin) und eine Tab-Komponente
(`CoclEditorTab`, `TransformationEditorTab`, `DmnEditorTab`), die ihrem Editor
das Dokument als Prop gibt. Die Dienste `gene.cocl.data`,
`gene.transformation.data` und `gene.dmn.data` gibt es nicht mehr — mit ihnen
überschrieb die zweite Datei einer Art die erste, und der Transformations-Editor
fragte den Dienst alle 500 ms ab. `App.vue` öffnet die drei über
`oeffneAnsichtTab`; `oeffnePerspektivTab` ist weg.

Geprüft: zwei `.qvtr` nebeneinander, jede mit eigenem Dokument; die Titelzeile
folgt dem vorderen Tab (Alpha / Beta / Alpha), kein Panel einer Datei im Rahmen.

**Was bewusst nicht umgebaut ist:**
- **DMN** lädt sein Dokument je Tab, das *Modell* ist aber weiter das geteilte
  (`useSharedDmnEditor`, von Baum, Tabelle und Executor gemeinsam genutzt). Zwei
  DMN-Tabs zeigen also dasselbe Modell, geladen vom zuletzt vorn liegenden. Das
  Plugin ist in den Startmodulen ohnehin auskommentiert.
- **eorm- und SensiNact-Wizard** sind keine Dateieditoren, sondern Assistenten
  mit eigenem Zustand im Plugin; `open()` zeigt den Wizard, die Datei wird nicht
  übergeben. Sie bleiben, wie sie sind: Mitte-Panel als Tab über die Perspektive.
- **Datengenerator** hat kein `open()`.

Der Dokument-Speicher ist dreimal gleich geschrieben (25 Zeilen), weil ein
Plugin kein anderes importiert und `gene-contracts` kein Verhalten trägt.

### Nachtrag: Dock-Zonen (2026-10-04)

Der geteilte Baum links unten war praktisch — er kommt zurück, ohne dass etwas
geteilt wird. Die Zone gehört dem Rahmen, der **Inhalt** dem Tab:

- `ui-layout` hat zwei Dock-Zonen, `primary-bottom` und `secondary`.
  `layout.dock(zone, { title, icon, undock })` lässt die Zone erscheinen (mit
  Kopfzeile und Knopf „Zurück in den Tab"), `undock(zone)` lässt sie
  verschwinden. Die Sidebars melden ihr Host-Element mit `setDockHost`.
- `EditorTabLayout` nimmt je Seite eine Zone (`left-dock`, `right-dock`).
  Angedockt wird der Slot-Inhalt per `<Teleport>` in den Host gerendert — er
  bleibt Kind der Tab-Komponente, behält also deren Kontext (`provide`) und
  geht mit dem Tab. Angedockt oder im Tab ist je **Ansicht** gemerkt, wie die
  Größen; Vorgabe: beide angedockt.
- Instanz- und Metamodell-Tab nennen nur die Zonen.

Wechselt der Tab, verschwindet sein Inhalt aus der Zone und der nächste dockt
seinen an — oder keinen, dann ist die Zone leer (Workspace-Vorschau).

Weg sind dafür `activePrimaryBottomPanelId`, `primaryBottomPanels`,
`activePrimaryBottomPanel` und `'primary-bottom'` als `PanelLocation`: Die Zone
kennt nur noch das Andocken.

Stolperstein beim Bauen: `dockHosts` lag zuerst *in* `useLayoutState()`, das
jede Komponente neu aufruft — die Sidebar meldete ihren Host an ein Exemplar,
das der Tab nie las; die Zone zeigte nur die Überschrift. Jetzt auf Modulebene.

Geprüft: beide Zonen zeigen Baum und Browser des vorderen Tabs; Auswahl im
angedockten Baum zeigt die Eigenschaften in der Tab-Mitte; Abdocken holt den
Baum in den Tab, Andocken bringt ihn zurück; Tab-Wechsel tauscht den Inhalt,
die Vorschau leert die Zonen. Keine Teleport-Warnungen.

### Nachtrag: Tab-Leiste, Problemfläche, Bezug zur Datei (2026-10-04)

- **Tab-Leiste** scrollt nur noch waagerecht. `overflow-x: auto` allein ließ den
  Browser den Überlauf auch senkrecht scrollen; als Flex-Kind ohne
  `min-width: 0` wuchs sie mit ihren Tabs statt zu scrollen; und der 10 px hohe
  Scrollbalken ließ 29 px für 32 px hohe Tabs. Jetzt `overflow-y: hidden`,
  `min-width: 0`, Tabs ohne Schrumpfen, kein Balken — das Mausrad scrollt
  seitwärts.
- **Problemfläche** ist ein Wunsch, kein Gesetz: Ihre gemerkte Höhe kann aus
  einem höheren Fenster stammen. Als Flex-Basis mit Obergrenze (70 %) gibt sie
  nach, der Editorbereich behält mindestens 160 px — vorher blieben ihm bei
  650 px Fensterhöhe 41 px.
- **Bezug zur geöffneten Datei:** Der vordere Tab nennt seine Datei
  (`gene.editor.front.frontFilePath()`); daraus setzt der Rahmen die Titelzeile
  und wählt die Datei im Explorer (`selectedFile`, der Explorer klappt Quelle
  und Ordner dazu auf). Die Editoren löschen den Titel beim Abbau nicht mehr —
  das löschte den Titel des *nächsten* Tabs.

- **Ansichten des Instanz-Editors** (die `view-*`-Perspektiven aus den
  `treeViews` der `.wsp`) stehen nur noch in der Leiste, solange ein
  Instanz-Tab vorn liegt. Eine Perspektive kann mit `editorId` sagen, zu welchem
  Editor sie gehört; die Leiste fragt den vorderen Tab (`gene.editor.front`).

### Nachtrag: Model Atlas als ein Tab, Navigator folgt dem Tab (2026-10-04)

- **Model Atlas** ist ein Tab (`model-atlas`) mit drei Abschnitten hinter einer
  Abschnittswahl: Transitions, Schemas, Schema-Explorer. Vorher waren es drei
  Mitte-Panels, jedes ein eigener Tab. Welcher Abschnitt offen ist, liegt in
  `useAtlasSection` — der Atlas-Baum schaltet bei einer Schema-Auswahl auf
  „Schemas", und die Wahl überlebt den Tab-Wechsel.
- **Der Navigator folgt dem vorderen Tab:** Atlas-Tab → Atlas-Baum, Datei oder
  Workspace-Vorschau → Explorer. Ein Klick in der Leiste holt zusätzlich den
  Tab der Perspektive nach vorn; ein Tab-Wechsel ändert nur den Navigator.
- **Die Bäume behalten ihren Zustand** beim Wechsel Explorer ↔ Atlas: Die
  Sidebar hält jedes bisher gezeigte Navigator-Panel montiert und blendet nur
  aus (`v-show`). Ein `KeepAlive` war der erste Versuch — es ließ das Update
  der Sidebar beim Öffnen eines Workspace scheitern (`reading 'parentNode' of
  null`), und mit ihm jedes weitere: die Dock-Zone erschien nie.

### Nachtrag: Tabs umsortieren (2026-10-04)

- Ein Tab lässt sich **in der Leiste verschieben** (`moveEditorTab`), und nur
  dort. Das Ziehen lief vorher über das Panel-Drag-and-Drop aus der Zeit, als
  Tabs Panels waren — dadurch waren die Seitenleisten Ablageziele, ein Tab
  ließ sich in den Baum werfen. Die Tab-Leiste hat jetzt ihr eigenes Ziehen
  mit eigenem Datentyp (`application/x-editor-tab`); die Leisten nehmen
  weiter nur Panels.

### Nachtrag: XML-Editor (2026-10-04)

- Neues Plugin `xml-editor`: der Text einer `.xmi`/`.ecore`/`.xml` in Monaco
  (XML-Highlighting, Zeilennummern, Faltung), von Hand editierbar. Als
  Editor-Art `xml` („XML-Editor“, `priority: -10`) nie der Standard — erreichbar
  über „Öffnen mit“; die strukturierten Ansichten bleiben vorn.
- Ein Tab je Datei (`xml:<pfad>`), Text liegt im Tab-Dokument des Plugins;
  Speichern per Strg+S oder Menüleiste (`xml:save`) schreibt über
  `gene.filesystem` in die Datei zurück. Der Tab zeigt den Dirty-Punkt.
- Der alte `ui-xmi-viewer` (nur lesen, eigener Highlighter) bleibt unberührt
  und wird weiterhin nicht geladen.

### Was dabei an Verhalten wegfällt

- Die Zone links unten ist für Dateiansichten nicht mehr da. Der Navigator
  links läuft über die volle Höhe.
- Der Model Browser rechts außen gibt es nicht mehr; er ist rechts *im Tab*.
- Größen der drei Bereiche werden je Ansicht gemerkt, nicht in der `.wsp`.

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
