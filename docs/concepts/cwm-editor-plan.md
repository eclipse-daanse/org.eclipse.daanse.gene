# CWM-Editor — Plan

Stand: 2026-10-04. Branch `chore/tsm-0.1`, Plugin `packages/cwm-editor`.

## Ziel

Ein Editor für CWM-Modelle (Common Warehouse Metamodel 1.1: core, relational,
olap/rolap, businessinformation …), wie sie z. B. der Workspace `UDP_MIT_ORM`
in `instances/instances.xmi` enthält. Er entsteht in Etappen; jede Etappe ist
eine Ansicht auf dasselbe Dokument, das auch der Instanz-Editor lädt.

## Grundsatz

- **Ein Tab je Datei**, Tab-Id `cwm:<pfad>`. Das Dokument ist ein
  Instanz-Dokument (`instanzTabDokument`), geladen über denselben Weg wie der
  Instanz-Editor (`handleInstanceAdd(…, 'STANDALONE', { tabId, oeffne })`).
  Dadurch gelten Speichern, Validieren, Model Browser und „+“ unverändert —
  die Editor-Art meldet `replacesPerspective: 'model-editor'` und bekommt so
  dasselbe Menü.
- **Links der Instanzbaum** (alle Instanzen), **rechts die Modelle**, **in der
  Mitte die CWM-Ansicht**. Dock-Zonen wie beim Instanz-Editor, Größen unter
  `view-id="cwm"`.
- Erreichbar über **„Öffnen mit → CWM-Dokumentation“** (`priority: -5`); der
  Instanzbaum bleibt für `.xmi` der Standard.
- Alles liest das Modell über die generische EMF-API (`eClass()`, `eGet()`),
  kein generierter CWM-Code.

## Etappe 1 — Dokumentation (umgesetzt)

CWM hält Dokumentation als `businessinformation:Description`: ein `body`,
Kinder als `ownedElement` (eine Description ist ein Namespace), und
`modelElement` zeigt auf das Beschriebene. Ein Handbuch ist ein Baum von
Descriptions; eine Tabelle hat eine Description für sich und eine je Spalte.

- **Description gewählt:** Titel und Text (beides direkt editierbar, schreibt
  per `eSet` ins Modell und markiert das Dokument), darunter alle Kinder und
  Kindeskinder als Absätze, jede Ebene tiefer.
- **Ebenen als Streifen:** jede verschachtelte Sektion setzt links einen
  vertikalen Streifen; die Streifen neben einem Absatz zeigen seine Tiefe.
- **Tabellen:** beschreibt eine Description eine `relational:Table` (oder
  liegt in einer), erscheint die Tabelle als Tabelle: Spalte, Typ, Null,
  Schlüssel (PK, FK → Zieltabelle (Spalten)), Beschreibung der Spalte. Die
  Spalten-Descriptions stehen dann in der Tabelle, nicht noch einmal als
  Absätze.
- **Tabelle gewählt:** ihr eigener Text, die Tabelle, ihre weiteren
  Descriptions.
- **Paket/Schema/Klasse gewählt:** Überschrift und alles darunter, was
  Dokumentation hat; Leeres fällt weg.

Code: `composables/documentation.ts` (Sektionen bauen, Tabellenansicht),
`components/DocSection.vue` (rekursiv, Streifen), `CwmDocumentation.vue`,
`CwmEditorTab.vue`. Test: `__tests__/documentation.spec.ts`.

## Spaltentabelle nach PH-8 (2026-10-09)

Die Spalten einer Table zeigt `components/ColumnsTable.vue` nach dem
Pflichtenheft (`spec-driven/gene-cwm/cwm-editor.pflichtenheft.xmi`, PH-8):
Kopfspalten Name, Typ, PK, Null, Description; Fremdschlüssel als „→ Ziel“
hinter dem Namen. Spaltenname und FK-Ziel wählen das Objekt im Baum.
Test-IDs nach PH-C1: `cwm.Editor.ContextView.ObjectRow@<Klasse>-<Name>.Row.Body.Columns`,
je Zeile `….Row@<Spaltenname>`. Offen aus PH-8: Inline-Bearbeitung, Spalte
anlegen und duplizieren über das Aktionsmenü der Table.

## Kontextansicht nach Pflichtenheft, Schritt 1 (2026-10-09)

Die Mitte des Tabs ist jetzt die Kontextansicht (`CwmContextView`), nicht mehr
die Dokumentationsansicht:

- **PH-1:** eine `ObjectRow` je Objekt unter dem Kontextobjekt, Tiefensuche
  über `eContents()`. Columns einer Table und Descriptions, die die Table
  schon zeigt (ihre eigene und die ihrer Spalten), bekommen keine eigene Zeile.
  Das Kontextobjekt ist anfangs der Container des gewählten Objekts; liegt eine
  Auswahl außerhalb, wandert der Kontext zu deren Container.
- **PH-2:** links je Vorfahr eine Linie (`Line@<slug>`, `data-level`), außen
  `Line@context` (`data-level -1`), außen kräftiger, innen heller; Hover nennt
  Klasse, Name, Ebene, Eltern. `Toggle` (+/−, `aria-expanded`) klappt den
  Teilbaum.
- **PH-5:** `Row.Body` mit `Fields` (gesetzte Attribute, nur lesend) und
  `TextView` (Text der Description bzw. der eigenen Description der Table),
  bei Tables dazu `Columns` (PH-8).
- **PH-6:** Kopfzeile mit hierarchischem Breadcrumb (setzt den Kontext),
  Ablauf-Breadcrumb der gewählten Objekte, Sprüngen oben/zurück/vor
  (Container bzw. Geschwister, auf oberster Ebene in der Resource) und
  „Als Kontextobjekt setzen“.
- **PH-4:** `Row.RightRail` mit `Validation` und `Actions` nur als Platzhalter.
- Test-IDs nach PH-C1 an allen Boxen, dazu `data-wire-kind` wie im Wireframe.


## Kontextansicht, Schritt 2: Zeileninhalt (2026-10-09)

`Row.Body` enthält jetzt in dieser Reihenfolge: `Diagram`, `Fields`,
`TextView`, `Columns` (nur Table), `References`.

- **PH-10 Diagram:** für Klassen aus der Registry `ui.cwm-editor.diagrams`
  (`composables/diagrams.ts`; Catalog, Schema, Table, View, Column, Index,
  Trigger, SQL-Datentypen, PrimaryKey, ForeignKey, Class, Association,
  Generalization). Erste Stufe nur der Name; `Diagram.Expand` vergrößert auf
  das ganze Fenster mit Werkzeugleiste.
- **PH-7 Fields (Teil 1):** alle einwertigen Attribute inline bearbeitbar –
  Text, Zahl, Ja/Nein, Enum-Literale. Ungesetzte erst nach „alle anzeigen“.
  Noch nicht: Vorschlagswerte, UI-Defaults und Ausblendungen aus einer
  Overlay-Resource.
- **FR-2.5/CON-2.5 TextView:** Text der Description (bzw. der eigenen
  Description einer Table), gerendert nach Typ – Markdown (marked +
  DOMPurify), README als Absätze, Mermaid als Diagramm (siehe unten).
  „Bearbeiten“ schaltet auf den Editor mit Typauswahl. Der Typ wird beim Speichern als
  TaggedValue `textType` an der Description abgelegt (CWM hat kein Attribut
  dafür; `type` ist schon mit doc/inline belegt).
- **PH-8 Columns:** Name, Typ (SQL-Datentypen des ResourceSets), PK (legt den
  PrimaryKey bei Bedarf an), Null, Description (legt eine Column-Description
  an, wenn keine da ist) inline bearbeitbar.
- **PH-9 References:** letzter Block mit Trennlinie, kleinere Schrift; je
  Description, Document, ResponsibleParty, Measurement, ChangeRequest, die per
  `modelElement` auf das Objekt zeigen, eine Zeile (Name, Pfad, Description,
  Typ), Tooltip mit den Daten, Klick wählt das Objekt. „+ Referenz“ öffnet ein
  Auswahlfenster (Filter, Mehrfachauswahl) und trägt das Objekt in
  `modelElement` ein. Der Rückwärtsindex wird je Modellversion einmal gebaut.
- Die alte Dokumentationsansicht (`CwmDocumentation`, `DocSection`) ist entfernt.


## Kontextansicht, Schritt 3: rechte Spalte (2026-10-09)

`Row.RightRail` hat genau zwei Kinder, `Validation` und `Actions` (PH-4; die
Referenzen stehen seit CR-1 im Body, PH-9).

- **Validation:** Badge „OCL ✓“, „OCL ! n“ (Warnungen) oder „OCL ✗ n“
  (Fehler) aus den Befunden des Dienstes `gene.problems` für dieses Objekt;
  Tooltip mit den Meldungen. Klick validiert das Objekt neu
  (`validateObject`); das Ergebnis ersetzt für dieses Objekt die Befunde.
- **Actions:** Menü aus der Registry `ui.cwm-editor.actions`
  (`composables/actions.ts`), je Aktion `appliesTo`, optional `enabled` und
  `confirm`. Eingebaut: Table – „Spalte hinzufügen“, „Spalte duplizieren“
  (die gewählte Spalte der Table, sonst die letzte; Werte und Typ werden
  kopiert, Name `<name>_kopie`); Description – „Sub-Description anlegen“,
  „Geschwister-Description anlegen“ (direkt dahinter); alle – „Validieren“,
  „Als Kontextobjekt setzen“ (mit Kindern), „Löschen“ (mit Rückfrage im Menü).
  Neue Objekte werden gewählt.
- **Anlegen:** `composables/creation.ts` – Fabrik des definierenden Pakets,
  Einfügen in die Containment-Liste (optional an Position), danach xmi:id
  über `assignXmiId` des Instanzbaums (keine für Klassen mit ID-Attribut).
  Auch PrimaryKey, Column-Description und TaggedValue aus Schritt 2 laufen
  jetzt darüber.

Bekannt: Gleichnamige Objekte derselben Klasse (z. B. zwei „Neue
Beschreibung“) bekommen nach PH-C1 dieselbe Test-ID.


## Kontextansicht, Schritt 4: Tree folgt dem Hauptbereich (2026-10-09)

- **PH-3:** Die Kontextansicht meldet beim Scrollen (je Frame höchstens
  einmal) das Objekt der obersten Zeile unterhalb der Kopfzeile
  (`top-object`). Der Tab reicht es an den Instanzbaum weiter.
- `InstanceTree` (ui-instance-tree) hat dafür zwei optionale Props, ohne
  CWM-Wissen: `nodeTestId(object)` setzt `data-testid` und `data-depth`
  (Containment-Tiefe) je Eintrag; `currentObject` markiert einen Eintrag
  ohne ihn zu wählen (`aria-current="true"`), klappt seine Vorfahren auf und
  scrollt ihn in Sicht. Blendet ein Ansichtsfilter das Objekt aus, wird der
  nächste sichtbare Vorfahr markiert.
- Test-IDs `cwm.Editor.Tree.TreeItem@<Klasse>-<Name>`; der Tree hat keine
  `.Line@`-Elemente.

Hinweis: Welche Typen der Tree zeigt, bestimmt weiterhin der Ansichtsfilter
des Workspace; PH-3.b (alle Objekttypen) gilt nur ohne Filter.


## Feldvorgaben als eigenes Modell (CR-2, 2026-10-09)

PH-7 nimmt Vorschlagswerte, UI-Defaults, Backend-Defaults und Ausblendungen
nicht aus einem UIModelOverlay, sondern aus einem eigenen, zum CWM
orthogonalen Metamodell (ChangeRequest CR-2 im Pflichtenheft):

- `packages/cwm-editor/model/fielddefaults.ecore`, nsURI
  `http://gene/cwm/fielddefaults/1.0`: `FieldDefaults` mit `FieldRule`s –
  `targetClass` (EClass, gilt auch für Unterklassen), `attribute` (EAttribute),
  `suggestions`, `uiDefault`, `backendDefault`, `hidden`. Registriert beim
  Aktivieren in der zentralen `EPackageRegistry`.
- Instanzen: alle `*.fielddefaults.xmi` des Workspace, geladen beim Aktivieren
  und bei `gene:workspace-loaded`; zusätzlich über den Service
  `ui.cwm-editor.fielddefaults` (`addFieldDefaultsFromXmi`). Abgleich über
  nsURI und Namen, auch bei nicht aufgelösten Proxys; die spezifischste Klasse
  gewinnt. Beispiel: `packages/cwm-editor/examples/cwm.fielddefaults.xmi`.
- Wirkung: `Fields` blendet `hidden`-Attribute bis „alle anzeigen“ aus (Marke ◌),
  zeigt ungesetzte Attribute mit `uiDefault` als Platzhalter (nie geschrieben)
  und bietet `suggestions` als Auswahlliste bei freier Eingabe. `createIn`
  schreibt die `backendDefault`s in jedes neue Objekt.

## Mermaid-Darstellung (2026-10-09)

- Abhängigkeit `mermaid` (^12.1.0) im Plugin `cwm-editor`; geladen erst beim
  ersten Mermaid-Text (`composables/mermaid.ts`).
- `securityLevel: 'strict'` (keine Skripte, keine Klicks, HTML-Labels
  kodiert), daher darf das SVG direkt in die Seite. Thema folgt dem Dark Mode
  von GenE (`dark-theme` an `<html>`).
- Fehler im Text: Meldung von Mermaid und der Quelltext; Reste eines
  fehlgeschlagenen Renderns werden aus dem DOM entfernt.
- Texttyp beim Bearbeiten (CON-2.5): Er folgt dem Text, solange er nicht
  bewusst gewählt ist – also wenn er nicht gespeichert ist oder dem erkannten
  Typ entspricht. Eine Auswahl im Editor hält ihn fest.

Offen: Daanse-Validierungen im Menü (sobald Daanse sie anbietet), ein Editor
für Feldregeln (bis dahin Instanz-Editor oder XMI).

## Offen / nächste Etappen

- **Relational:** Katalog → Schema → Tabelle → Spalte als Domänenbaum und
  Formulare (Spalten anlegen, Schlüssel zuordnen).
- **ROLAP:** Cube, Dimension, Hierarchie, Level, Measure; Quellen auf Tabellen.
- **Standard-Ansicht:** Soll die CWM-Ansicht für CWM-Dateien Standard werden?
  Der Wurzel-nsURI einer `xmi:XMI`-Datei ist `http://www.omg.org/XMI`, daher
  greift `nsURIs` dort nicht — bräuchte eine Erkennung über die genutzten
  Pakete.
- Descriptions **anlegen** (neue Kapitel/Absätze) direkt aus der Mitte heraus.
