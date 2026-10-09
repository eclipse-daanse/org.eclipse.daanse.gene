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

Noch offen: PH-3 (Tree folgt dem Scrollen, `TreeItem`-Test-IDs), PH-4,
PH-7, PH-8 (bearbeiten), PH-9, PH-10.

## Offen / nächste Etappen

- **Relational:** Katalog → Schema → Tabelle → Spalte als Domänenbaum und
  Formulare (Spalten anlegen, Schlüssel zuordnen).
- **ROLAP:** Cube, Dimension, Hierarchie, Level, Measure; Quellen auf Tabellen.
- **Standard-Ansicht:** Soll die CWM-Ansicht für CWM-Dateien Standard werden?
  Der Wurzel-nsURI einer `xmi:XMI`-Datei ist `http://www.omg.org/XMI`, daher
  greift `nsURIs` dort nicht — bräuchte eine Erkennung über die genutzten
  Pakete.
- Descriptions **anlegen** (neue Kapitel/Absätze) direkt aus der Mitte heraus.
