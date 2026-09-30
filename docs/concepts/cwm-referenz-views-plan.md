# Plan: CWM-Referenz-Views, Shortcut-Bereich und Description-Ansicht

**Status (2026-09-29):** Entwurf aus der Besprechung vom 29.09.2026 (drei
Aufnahmen, Transkript unter
`~/Downloads/SteepMysteriesLinkRelatively_2026-09-29T16_20_47.450Z.transkript.txt`).
**Erste Phase sind Mocks** (Daten im Workspace `UDP_MIT_ORM`, Klick-Attrappen in
gene). Erst wenn die Mocks abgenommen sind, folgt die produktive Umsetzung.

**Betroffene Orte:**
- gene: `/mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/gene` (Branch-Vorschlag `feat/cwm-referenz-views`)
- Workspace: `/home/markus/doc/UDP_MIT_ORM` (kein Git! vor Änderungen kopieren, siehe 3.1)

---

## 1. Was besprochen wurde (Anforderungen)

Kurzfassung der drei Aufnahmen, gruppiert nach Thema. Die Nummern werden in
den Epics referenziert.

### A. Detail-Ansicht eines ModelElements

| # | Anforderung |
|---|---|
| A1 | Tree links (wie heute). Klick auf Table zeigt Detail-View der Table **mit eingebetteten Columns**; Klick auf eine Column zeigt deren Eigenschaften als Detail-im-Detail. |
| A2 | Descriptions der Table werden **eingebettet** angezeigt (nicht als Link rechts), erkennbar getrennt in "Description der Table" und "Descriptions der Columns". |
| A3 | Remarks-Descriptions (SQL `COMMENT`, kurz, wandert in die DB) werden optisch von der langen Dokumentation getrennt. |
| A4 | Was schon auf der Seite steht, erscheint **nicht** noch einmal rechts im Referenz-Bereich. |

### B. Shortcut-Bereich und Navigation

| # | Anforderung |
|---|---|
| B1 | Oben rechts ein Shortcut-Bereich mit Kurzfassungen (z. B. nur der Name) von Responsible Party, Documentation usw. |
| B2 | Klick auf einen Shortcut springt im Tree zum Objekt und öffnet dessen Detail-View. |
| B3 | **History**: Zurück führt wieder zu Table bzw. Column, beliebig weit zurück. |
| B4 | Rechter Bereich zeigt "wo bin ich noch referenziert" (nur Referenzen von **woanders**, vgl. A4). |

### C. Referenz-Tabs (Teil 2)

| # | Anforderung |
|---|---|
| C1 | Der Referenz-Bereich bekommt einen **Tab-Mechanismus**: Main-Tab plus ein Tab je Referenztyp (Responsible Party, Description, Document, Term, ChangeRequest, Measurement). |
| C2 | Jeder Tab zeigt **tabellenartig** alle referenzierten Objekte des selektierten Objekts **und aller Kinder**, jeweils mit dem Objekt, das sie referenzieren (z. B. "Responsible Party X → Column gkz"). |
| C3 | Angezeigt wird nur, was per **Cross-Referenz** (`modelElement`) verbunden ist, nicht was nur per Containment (`ownedElement`) darunter liegt. Ausnahme Description-Tab: Descriptions, die in der Table liegen **und** referenziert sind, erscheinen ebenfalls. |
| C4 | Jede Zeile hat das Icon des Typs (Terms haben verschiedene Icons) und ein paar Zusatzangaben je Typ. |
| C5 | Klick auf Responsible Party navigiert dorthin (B2); Klick auf das referenzierende Objekt ist nicht nötig (man kommt ja von dort). |
| C6 | Das gilt für **jedes ModelElement**, nicht nur Table/Column. Unterscheidung ModelElement vs. Namespace-Objekt (hat OwnedElement-Bereich). |
| C7 | Im Tree deutlicher zeigen, ob ein Objekt abstrakt bzw. Namespace ist (Icons sind dafür schon gestaltet). |

### D. Gilt für die ganze Hierarchie (Teil 3)

| # | Anforderung |
|---|---|
| D1 | Catalog → Schema → Table → Column: Klick auf Catalog zeigt Referenzen aller Kinder. |
| D2 | **Haken "nur bis zum nächsten Namespace"**: am Catalog nur bis Schema, nicht alles. |
| D3 | OwnedElement und Feature sind beide Containment; es gibt keine Nicht-Containment-Assoziation im Tree. Der Tree soll aber zeigen, **über welches Feature** ein Kind hängt. |
| D4 | Offen: Ansicht, die Referenzen zwischen Objekten sauber darstellt, filterbar nach Referenzart (kommt vorerst in den rechten Bereich, B4). |

### E. Descriptions als Hierarchie

| # | Anforderung |
|---|---|
| E1 | Description ist Namespace, kann Tochter-Descriptions haben → Buch/Kapitel/Abschnitt. |
| E2 | Anzeigetiefe nach Typ: z. B. nur Kapitel untereinander zeigen, erst im Kapitel weiter nach unten. Steuerung **nicht** über Description-Felder, sondern über **Tagged Value am Stereotype**. |
| E3 | Lesbare Fließtext-Ansicht: leicht eingerückt, Text beginnt immer an derselben Stelle, Puffer davor zeigt "ist Kind". Keine Kapitelnavigation, keine Schlagwortsuche (das machen Terms). |
| E4 | Flüssiges Anlegen: Name + Beschreibung, dann Typ, auf gleicher Ebene oder darunter, Markdown. |
| E5 | Zwei Bedeutungen unterscheiden: **abgelegt in** (Containment, "ist nur dort gespeichert") vs. **sagt etwas aus über** (Referenz `modelElement`). Beim Anlegen an einer Table soll man sehen, ob man im Bereich "Table", "Column X" oder "nur ablegen" ist. |
| E6 | Bestehende Descriptions (z. B. aus einem Anforderungsdokument) **referenzieren** statt neu anlegen: "+"-Menü im Referenz-Bereich öffnet Suche nach Typ und Volltext. Auch umgekehrt: von der Description-Hierarchie aus "häng dich an ...". |

### F. Feld-Defaults, Ausblenden, Vorlagen

| # | Anforderung |
|---|---|
| F1 | Felder standardmäßig belegen (Language = DE, Visibility = public) und in der Übersicht ausblenden; per Weiterklicken alles sehen. |
| F2 | Rendering-Optionen je Feld: Langtext / Editor / normal, Default, "in Standardansicht ausgeblendet", "in Extras". |
| F3 | Text-Templates je Feld (z. B. Description.body) zur Auswahl. |
| F4 | Später: Diagramme je Namespace (Catalog nur Schemas, Schema+Table, alles), editierbar. Nicht Teil dieses Plans. |

---

## 2. Ist-Stand (was schon da ist, was fehlt)

### 2.1 Metamodell und Daten (`UDP_MIT_ORM`)

- **CWM 1.1 als Ecore**, 23 Dateien unter `model/`, plus Daanse-Erweiterungen
  `rolap.mapping.ecore` und `orm.ecore`.
- `Description`, `ResponsibleParty`, `Document` sind **Namespaces**
  (`model/businessinformation.ecore:31,180,224`), liegen per `ownedElement`
  irgendwo und zeigen per **einseitiger** Cross-Referenz `modelElement`
  (0..*, **ohne eOpposite**, `:53`, `:212`, `:251`) auf ihre Ziele.
  `Term` (`businessnomenclature.ecore:203`), `Measurement` (1..1) und
  `ChangeRequest` (1..*) in `warehouseoperation.ecore:31,85` ebenso.
  → Von Table/Column aus gibt es **keine** navigierbare Referenz zurück
  (bestätigt die Vermutung aus Teil 1, 06:49–07:27).
- `Stereotype` (`core.ecore:377`) mit `requiredTag` (TaggedValue) und
  `extendedElement`; `TaggedValue` (`:428`, `tag`/`value`) hängt als
  Containment an jedem ModelElement (`:94`). → E2 ist mit Bordmitteln abbildbar.
- `instances/instances.xmi`: 186 Descriptions (179 `type="doc"`, 7 `inline`),
  176 davon mit `modelElement`. Sie liegen bereits als `ownedElement` in den
  Tables, z. B. `instances.xmi:768-784` (Table `gemschluessel`, Descriptions
  "Table atlas.tlvermgeo.gemschluessel" und "Column …gemschluessel.gkz").
  Handbuch-Hierarchie unter `cadastre/documentation` (`:370-391`).
  **Keine** ResponsibleParty, Document, Term, ChangeRequest, Measurement.
- `data.jena.de.wsp`: 18 IconMappings (`cwm-icon cwm-icon--…`, Zeilen 27–80),
  9 Tree-Views als Typ-Blacklists.
- `workspace-overrides.uimodel.xmi`: nur Textarea für Feature `body`.

### 2.2 gene

| Baustein | Stand | Relevanz |
|---|---|---|
| Detail-Ansicht | `packages/ui-properties-panel/src/components/PropertiesPanel.vue` (1800 Z.), rendert im Instanz-Modus per Flag über `ui-uimodel-forms/…/UimodelPropertiesView.vue` (uimodel-Composer). | Basis für A1–A4; Tabs/Embedding als UIModel-XMI beschreibbar. |
| uimodel.ecore | `TabView`, `SectionView`, `MasterDetail`, `ForEach`, `Conditional`, `ReferenceLinkWidget` vorhanden und im Composer registriert (`UimodelPropertiesView.vue:42-49`), **in keinem XMI benutzt**. | C1, A1 ohne Code, wenn ForEach/TabView funktionieren. Muss der Mock beweisen. |
| gene-Widgets | `packages/ui-uimodel-forms/model/gene-widgets.ecore` (`genew`): `CodeWidget`, `MarkdownWidget`, `RichTextWidget`. | E3/E4 (Markdown). Neue Widget-Klassen für Referenz-Tabellen kommen hier hinein (Entscheidung F4 des uimodel-Plans: kein Hack in gene, sondern Erweiterung als eigenes Paket). |
| Referenzen im Panel | `instance-builder/src/components/ReferenceField.vue`: Containment (Badge "C", "+ / Add…"), Nicht-Containment (Dropdown/Suche), Items als Link → `navigate` → `ctx.selectObject` (`PropertiesPanel.vue:1065-1076`). | Navigation ersetzt nur die Selektion. **Keine History**, kein Embedding. |
| Eingehende Referenzen | **Nicht vorhanden.** `@emfts/core` 0.3.0-next.2 hat nur ausgehendes `eCrossReferences()` (`dist/runtime/BasicEObject.js:340-360`), kein `ECrossReferenceAdapter`, kein `UsageCrossReferencer`. In gene nichts (`checkDanglingReferences` scannt nur Proxies). | Muss neu: Inverse-Index (Epic 2). Antwort auf die Prüf-Frage aus Teil 1, 07:31. |
| Tree | `ui-instance-tree/src/composables/useInstanceTree.ts:336-420`: eager, nur Containment-Kinder, `containmentRef` pro Kind gespeichert, keine Gruppierung nach Feature. Filter = Typ-Blacklist je View (`useViews.ts`). | D3 (Feature-Name anzeigen) ist klein: `containmentRef` ist schon am Knoten. |
| Icons | `packages/icons-cwm`: 630 SVGs, **Randfarbe = Paket, gestrichelt = abstrakt**. Zuordnung EClass→Icon **nur manuell** über `iconMappings` im `.wsp` (`iconRegistry.ts:224-278`). | C7: Auto-Mapping nach Klassenname fehlt; für Mocks reichen Einträge im `.wsp`. |
| Layout | Model-Editor-Perspektive in `packages/gene-app/src/App.vue:1773-1960` **fest verdrahtet**: links InstanceTree, rechts nur ModelBrowser, Mitte Properties als Editor-Tab. Aus der PanelRegistry werden nur Bottom-Panels übernommen (`:1945-1960`). | B1/B4: Ein rechtes Referenz-Panel braucht eine Erweiterung in App.vue (rechts aus Registry einlesen) oder direktes `layout.registerPanel({location:'secondary'})`. |
| Feld-Defaults | `fennecui.EditorConfig.featureRules` (`learn/fennec-generic-ui.ecore:1334`: visibility/readOnly/group/order/condition) **modelliert, aber nirgends ausgewertet**. `uiDefaults` ebenso. | F1/F2: Auswertung nachrüsten statt neues Konzept. |
| Suche | `openSearchDialog` von `gene.workspace.actions`, `packages/ui-search`. | E6 ("+"-Menü). |
| Plugin-Anlage | `manifest.json` + `src/index.ts` mit `activate`, Eintrag in `src/tsm/repositories.config.ts:65-91`; Vorlage `packages/ui-properties-panel`. | Neues Paket für Mocks und später für den Index. |

---

## 3. Phase 0: Mocks

Ziel: Das Konzept in gene **anklickbar** machen, mit echten CWM-Daten aus
`UDP_MIT_ORM`, bevor Index, History und App.vue-Umbau produktiv gebaut werden.
Alles in Phase 0 ist wegwerfbar oder rein deklarativ (XMI).

### 3.1 Daten-Mocks im Workspace `UDP_MIT_ORM`

**Vorab:** Der Workspace ist nicht unter Git. Vor dem ersten Schritt
`cp -r UDP_MIT_ORM UDP_MIT_ORM.bak-2026-09-29` **oder** `git init` im
Workspace (empfohlen, dann sind alle Mock-Schritte einzeln zurücknehmbar).

**M1 – Business-Information-Objekte anlegen.** Neue Datei
`instances/mock-businessinfo.xmi` als zweite `instanceSource` im `.wsp`
(Zeile 26 ergänzen). Inhalt: ein `core:Package` "mocks" mit

| Klasse | Anzahl | Beispiele, Referenzen (`modelElement`) auf bestehende IDs |
|---|---|---|
| `businessinformation:ResponsibleParty` | 3 | "Fachbereich Kataster" (responsibility=owner) → Table `gemschluessel`; "DBA Team" (responsibility=technical) → Columns `gkz`, `gname`; "Datenschutz" → Schema `kataster` |
| `businessinformation:Document` | 2 | "Anforderungsdokument Gemeindeschlüssel" (reference=URL, type=requirement) → Table; "Betriebshandbuch" → Catalog `atlas` |
| `businessnomenclature:Term` | 3 | "Amtlicher Gemeindeschlüssel" (definition, example) → Column `gkz`; "Landkreis" → Column `lkrcode`; "Gemeinde" mit `narrowerTerm` |
| `warehouseoperation:ChangeRequest` | 2 | status=open → Column `gname`; status=completed → Table |
| `warehouseoperation:Measurement` | 2 | value/unit "rows"/"1234" → Table; "nullRatio"/"0.02" → Column `lcode` |
| `businessinformation:Contact` | 1 | mit Email, an "Fachbereich Kataster" (`contact`) |

Warum eigene Datei: Das ist genau der Fall aus E6 ("Description im
Anforderungsdokument existiert schon woanders"), und er prüft die
Cross-Resource-Auflösung von `modelElement`-Referenzen. **Rückfallposition**,
falls gene die Querverweise beim Laden oder Speichern nicht auflöst
(bekannte Crossref-Problematik, `uimodel-properties-plan.md` Abschnitt 4):
Package "mocks" direkt in `instances.xmi` unter `cadastre` einhängen.

**M2 – Description-Hierarchie mit Stereotype.** In `mock-businessinfo.xmi`:

- `core:Stereotype` "DescriptionKind" (baseClass=Description) mit
  `requiredTag` TaggedValue `tag="kind"`.
- Description "Handbuch Kataster" (kind=book) → enthält per `ownedElement`
  Description "Kapitel 1 Gemeindeschlüssel" (kind=chapter) → enthält
  "1.1 Aufbau" und "1.2 Pflege" (kind=section). Jede Section mit
  Markdown-`body` (Überschriften, Liste, Codeblock). "1.1 Aufbau" referenziert
  Table `gemschluessel`, "1.2 Pflege" referenziert Column `gkz`.
- An der Table `gemschluessel` **zusätzlich** eine Description mit
  `kind=remarks`, `body="Amtlicher Gemeindeschlüssel (AGS) Thüringen"`,
  `modelElement` = Table, um A3 zu zeigen. Dazu eine Remarks-Description an
  Column `gkz`.
- Beides parallel zum vorhandenen `type="doc"|"inline"`, damit die offene
  Entscheidung (Attribut `type` vs. TaggedValue) am Mock verglichen werden kann.

**M3 – Icon-Mappings ergänzen** (`data.jena.de.wsp`, nach Zeile 80, gleiches
Muster wie Zeile 57): ResponsibleParty, Contact, Document, Term, Concept,
Nomenclature, ChangeRequest, Measurement, Stereotype, TaggedValue.
Die SVGs existieren alle unter
`packages/icons-cwm/cwm-icons/icons/svg/foundation/businessinformation/…`,
`analysis/businessnomenclature/…`, `management/warehouseoperation/…`.

**M4 – Tree-View "Business Information"** im `.wsp` (analog "Dokumentation",
Zeile 82): blendet ROLAP/ORM/Datenmodell aus, lässt Catalog/Schema/Table/
Column, Description, ResponsibleParty, Document, Term, ChangeRequest,
Measurement sichtbar. Dient als Arbeits-Perspektive für die Mock-Abnahme.

**Akzeptanz M1–M4:** Workspace lädt ohne Fehler, alle Mock-Objekte im Tree
mit Icon, `modelElement`-Links im Properties-Panel der Mock-Objekte springen
auf Table/Column (bestehende Navigation). Speichern und Neuladen ohne
Proxy-Verlust (sonst Rückfallposition M1).

### 3.2 UI-Mocks in gene, Stufe 1: nur XMI (kein Code)

**M5 – Autoriertes UIModel für Table.** Datei
`UDP_MIT_ORM/uimodels/cwm-table.uimodel.xmi` (wird von
`reloadWorkspaceUiModels` gefunden, `uiModelRegistry.ts:170-198`), Vorlage
`test-data/uimodel-baseline/library.uimodel.xmi`:

```
UIModel targetClasses=[relational:Table] priority=20
└ TabView
  ├ Tab "Main"
  │ ├ FormView "Stammdaten": name, visibility (readOnly-Vorschau von F1)
  │ ├ FormView "Remarks": Conditional(kind=remarks) → InputWidget body
  │ ├ FormView "Columns": ForEach feature → SummaryView(name, type, isNullable)   ← A1
  │ └ FormView "Descriptions": ForEach ownedElement, Conditional(Description)
  │                            → MarkdownWidget body                              ← A2
  ├ Tab "Responsible Parties"  → Platzhalter-Text (kommt in Stufe 2)             ← C1
  └ Tab "Descriptions"         → Platzhalter-Text
```

Dasselbe für `relational:Column` (Main mit eingebetteter Description) und
für `businessinformation:Description` (E3: `MarkdownWidget` für `body` mit
Vorschau, darunter `ForEach ownedElement` für Kind-Descriptions, eingerückt
per `LayoutStyle`).

**Was der Mock beweist bzw. widerlegt:**
1. Funktionieren `TabView`, `ForEach`, `Conditional` im gene-Composer-Pfad
   überhaupt (sie sind registriert, aber ungenutzt)?
2. Reicht `ForEach` + `SummaryView` für "Columns eingebettet" (A1), oder
   braucht es ein eigenes `EmbeddedObjectWidget` in `gene-widgets.ecore`?
3. Kann `Conditional` auf TaggedValues (`self.taggedValue->exists(t | t.tag='kind' and t.value='remarks')`, OCL) filtern? Sonst ist E2/A3 per Attribut `type` einfacher.

**Akzeptanz M5:** Table `gemschluessel` selektieren → Tabs sichtbar, Columns
als Kurzzeilen eingebettet, Descriptions als gerenderter Markdown darunter,
Remarks in eigener Sektion. Nur XMI geändert, kein Build.

### 3.3 UI-Mocks in gene, Stufe 2: Wegwerf-Plugin `packages/ui-cwm-mock`

Ein einziges Plugin, **nicht** in `release-plugins.json`, nur in
`startupModules` (`src/tsm/repositories.config.ts`). Es enthält alles, was
sich nicht per XMI mocken lässt. Vorlage `packages/ui-properties-panel`.

**M6 – Rechtes Panel "Referenzen" mit Tabs (B1, B4, C1–C5).**
- Registrierung direkt über `layout.registerPanel({location:'secondary'})`
  nach dem Aufbau der Model-Editor-Perspektive (`App.vue` bleibt unangetastet;
  der saubere Weg kommt in Epic 3).
- Komponente `ReferencePanel.vue`: PrimeVue `TabView`, ein Tab je Referenztyp
  aus einer **festen Konfigurationsliste**
  (`{eClassUri, label, icon, columns:[…]}` für ResponsibleParty, Description,
  Document, Term, ChangeRequest, Measurement).
- Jeder Tab: PrimeVue `DataTable` mit Spalten Icon | Name | Zusatzangaben
  (C4: responsibility / kind+language / type+reference / definition /
  status / value+unit) | "referenziert" (Label des Ziel-Objekts).
- Oben ein Haken **"nur bis zum nächsten Namespace"** (D2) und ein
  "+"-Button, der `openSearchDialog` öffnet (E6, im Mock ohne Zuweisung).
- Datenquelle: **M8** (naiver Index), Abfrage
  `incoming(selected, {includeDescendants:true, stopAtNamespace:flag})`.
- Filter A4/C3: Zeilen, deren Objekt bereits per Containment unter dem
  selektierten Objekt liegt **und** nicht referenziert ist, werden
  ausgeblendet; Descriptions, die darunter liegen und referenziert sind,
  bleiben (Teil 2, 03:10–04:22).

**M7 – Shortcut-Leiste und History (B1–B3).**
- `ShortcutBar.vue` als `headerActions` des Referenz-Panels oder als
  schmaler Streifen oben im Panel: pro Referenztyp ein Chip "Icon + Anzahl",
  Klick wechselt den Tab; Chips mit Anzahl 0 ausgegraut.
- `useNavigationHistory.ts` (im Mock-Plugin): Stack über
  `ctx.selectObject`; beobachtet `ctx.selectedObject` und pusht jede Änderung.
  Buttons "◀ Zurück / Vor ▶" in der Panel-Kopfzeile; Zurück ruft
  `selectObject(stack[i-1])` ohne neuen Push.
- Zeilen-Klick in der Tabelle → `ctx.selectObject(obj)` (springt im Tree,
  öffnet Detail, B2).

**M8 – Naiver Inverse-Index (Vorstufe von Epic 2).**
- `useIncomingReferences.ts`: bei jeder Selektionsänderung alle Resources
  (`getSharedResources()`, `useInstanceTree.ts:1582`) per `eAllContents()`
  durchlaufen, für jedes Objekt `eCrossReferences()` und je nicht-containment
  `EReference` die Ziele sammeln → `Map<EObject, {source, reference}[]>`.
- Keine Invalidierung, kein Caching: Neuaufbau je Selektion. Für die
  748 Objekte + Mocks ist das problemlos (< 50 ms). Der Mock zeigt, ob das
  Ergebnis inhaltlich stimmt; Performance und Adapter kommen in Epic 2.

**M9 – Tree-Ergänzungen (C7, D3).**
- Option in den Tree-Einstellungen "Feature-Name anzeigen": Label-Suffix
  ` · ownedElement` bzw. ` · feature` aus dem vorhandenen `containmentRef`
  (`useInstanceTree.ts:336-405`). Im Mock hart eingeschaltet über den
  Mock-Plugin-Hook, falls der Tree einen Label-Provider anbietet; sonst
  Screenshot-Mock (siehe 3.4).
- Namespace-Marker: kleines Overlay-Symbol rechts am Icon, wenn
  `eClass.getEAllSuperTypes()` `core:Namespace` enthält. Prüfen, ob die
  vorhandene Glyph-Kodierung der cwm-icons (Namespace.svg vs. ModelElement.svg)
  schon ausreicht; dann entfällt der Marker.

**Akzeptanz M6–M9 (Abnahme-Szenario, entspricht Teil 2/3 der Besprechung):**
1. Catalog `atlas` selektieren, Tab "Responsible Parties": zeigt
   "Fachbereich Kataster → Table gemschluessel", "DBA Team → Column gkz",
   "DBA Team → Column gname". Haken "nur bis Namespace" an → Liste leer
   (Schema ist der nächste Namespace), Tab "Documents" zeigt "Betriebshandbuch
   → Catalog atlas".
2. Table `gemschluessel` selektieren, Tab "Descriptions": zeigt "1.1 Aufbau"
   (liegt im Handbuch, referenziert die Table) und die eigene Remarks-
   Description; **nicht** die 7 in der Table abgelegten, aber nicht auf sie
   zeigenden Column-Descriptions (die zeigen auf die Columns → erscheinen mit
   "→ Column …", weil Kinder eingeschlossen sind).
3. Klick auf "Fachbereich Kataster" → Tree springt, Detail zeigt die
   ResponsibleParty; "Zurück" → wieder Table `gemschluessel`; nochmal
   "Zurück" → Catalog `atlas`.
4. Tab "Terms": "Amtlicher Gemeindeschlüssel → Column gkz" mit Term-Icon.

### 3.4 Optional vor 3.3: statischer Klick-Dummy

Wenn vor dem Plugin-Mock eine Abstimmung mit dem Kollegen über das Layout
gewünscht ist: ein statisches HTML (Artifact) oder ein Figma-Frame mit
Tree | Detail (Tabs) | Referenz-Panel, befüllt mit den Mock-Daten aus 3.1.
Aufwand ein halber Tag, kann direkt aus diesem Plan abgeleitet werden.
Nicht nötig, wenn 3.3 schnell genug steht.

---

## 4. Produktive Umsetzung: Epics und Tickets

Reihenfolge nach Abhängigkeit. Jedes Epic ist unabhängig abnehmbar; die
Mocks aus Phase 0 werden dabei Stück für Stück ersetzt.

### Epic 1 – Detail-View per UIModel (A1–A4, E3, E4)

| Ticket | Inhalt |
|---|---|
| 1.1 | Befund aus M5 umsetzen: fehlende Composer-Fähigkeiten (ForEach mit SummaryView, Conditional auf OCL mit TaggedValue) im Composer-Projekt `emf.ts.ui` nachziehen **oder** `EmbeddedObjectWidget` (feature, summaryFields, expandable) in `gene-widgets.ecore` ergänzen und in `WidgetBridge.vue` rendern. |
| 1.2 | App-Default-UIModels für CWM ausliefern (`public/uimodels/cwm-*.uimodel.xmi`, Stufe "app" der Registry), damit der Workspace nichts autorieren muss; Workspace-Overrides bleiben möglich (E7 des uimodel-Plans). Klassen: Namespace (generisch), Table, Column, Description, ResponsibleParty. |
| 1.3 | Description-Ansicht (E3): `MarkdownWidget` mit Vorschau, Kinder eingerückt mit festem linken Puffer, Tiefe nach `kind` (E2) über `visibilityCondition`. |
| 1.4 | Flüssiges Anlegen (E4): Aktion "Kind-Description anlegen" / "Geschwister anlegen" in der Description-Ansicht, Fokus auf `name`, `kind` als Dropdown aus dem Stereotype. |
| 1.5 | Kontext beim Anlegen an einer Table (E5): Dialog "Bezieht sich auf: [Table ▾ | Column gkz | nur ablegen]" setzt `modelElement`. |

### Epic 2 – Inverse-Referenz-Index (B4, C2, C3, D1, D2)

| Ticket | Inhalt |
|---|---|
| 2.1 | Neues Paket `packages/model-index`, Service `gene.model.index`: `incoming(obj, opts)`, `incomingByType(obj, eClass, opts)`, `opts = {includeDescendants, stopAtNamespace, excludeContained}`. |
| 2.2 | Aufbau über `EContentAdapter` auf allen Resources; inkrementelle Pflege bei `SET/ADD/REMOVE` an Nicht-Containment-Referenzen; Fallback Vollscan bei Resource-Wechsel. Invalidierung an den Versions-Bump des Tree-Adapters koppeln. |
| 2.3 | Unit-Tests (vitest, inline-Ecore wie `containmentPreference.spec.ts`): einseitige Referenz, Cross-Resource, Descendants, Namespace-Stopp, Entfernen eines Ziels. |
| 2.4 | Prüfen, ob EMFTS ein `ECrossReferenceAdapter`-Äquivalent bekommen soll (Issue im EMFTs-Projekt); dann wird 2.2 dünner. |

### Epic 3 – Referenz-Panel, Shortcuts, History (B1–B4, C1–C6, E6)

| Ticket | Inhalt |
|---|---|
| 3.1 | `App.vue`: Model-Editor liest auch `getForLocation('model-editor','right')` aus der PanelRegistry (analog Bottom-Panels `:1945-1960`), damit Plugins rechts andocken können. |
| 3.2 | Paket `packages/ui-reference-panel` (aus M6/M7 herausgelöst): Tabs je Referenztyp aus einer **Konfiguration im Workspace** (`.wsp`: neue `referenceViews` in `fennec-generic-ui.ecore`, je Eintrag EClass, Spalten, Icon) statt fester Liste. |
| 3.3 | Zusatzspalten per `SummaryView` aus dem UIModel der Zielklasse (C4), damit dieselbe Definition Detail und Tabelle speist. |
| 3.4 | "+"-Menü (E6): `openSearchDialog` mit Typ-Vorauswahl und Volltext über `body`/`name`; Ergebnis setzt `modelElement` am gewählten Objekt (Rückrichtung: von der Description aus "an Objekt anhängen"). |
| 3.5 | History als Service `gene.navigation.history` in `ui-instance-tree` oder `gene-app` (aus M7), Tastenkürzel Alt+← / Alt+→, Breadcrumb bleibt. |
| 3.6 | Ausschluss A4/C3 verbindlich: Referenzen, die schon im Detail eingebettet sind, nicht im Panel. |

### Epic 4 – Tree (C7, D3)

| Ticket | Inhalt |
|---|---|
| 4.1 | Option "Containment-Feature anzeigen" (Suffix oder Gruppierungsknoten `ownedElement` / `feature`), persistiert im `.wsp` (`uiDefaults`). |
| 4.2 | Auto-Icon-Mapping für CWM: Regel "nsURI-Pfad + Klassenname → `cwm-icon--…`" als Provider-Default in `icons-cwm` (`CwmIconsProvider.ts`), sodass keine 400 manuellen `iconMappings` nötig sind. Manuelle Mappings behalten Vorrang (priority). |
| 4.3 | Namespace-Marker, falls M9 zeigt, dass die Glyphen allein nicht reichen. |

### Epic 5 – Feld-Defaults, Ausblenden, Vorlagen (F1–F3)

| Ticket | Inhalt |
|---|---|
| 5.1 | `featureRules` aus `fennecui.EditorConfig` (`learn/fennec-generic-ui.ecore:1334`) in `defaultUiModel.ts` / `WidgetBridge.vue` auswerten: visibility (hidden / extras), readOnly, group, order. |
| 5.2 | Defaults beim Anlegen: `uiDefaults` je EClass+Feature (Language=DE, visibility=vk_public) im Create-Pfad von `instance-builder` anwenden. |
| 5.3 | Text-Templates je Feature (F3): neue Klasse `TextTemplate` in `gene-widgets.ecore`, Auswahl-Popover am `MarkdownWidget`/`TextAreaWidget`; Pflege über `WorkspaceSettingsDialog` (Kategorie neben "widgets"). |
| 5.4 | Settings-Seite "Standardansicht" (F2): je Klasse Felder markieren als Standard / Extras / ausgeblendet; schreibt `featureRules`. |

### Epic 6 – Modellierung / Diagramme (F4) — nur Platzhalter

Nicht in diesem Plan. Bezug: `@vue-flow/*` ist bereits Dependency;
Diagramme je Namespace mit Detailgrad-Stufen werden in einer eigenen Session
geplant (Teil 3, 06:37–07:23).

---

## 5. Offene Entscheidungen

| # | Frage | Vorschlag |
|---|---|---|
| O1 | Description-Art über Attribut `type` (heute `doc`/`inline`) oder TaggedValue `kind` am Stereotype (E2, Teil 1 12:26)? | Mock M2 baut beides; entscheiden nach M5. Tendenz TaggedValue, weil filterbar per Stereotype und erweiterbar (book/chapter/section/remarks). Bestehende 186 Descriptions müssten dann migriert werden (Skript). |
| O2 | Mock-Daten in eigener Datei oder in `instances.xmi`? | Eigene Datei (prüft Cross-Resource); Rückfall in `instances.xmi`. |
| O3 | Referenz-Panel rechts (SecondarySidebar) oder als Tabs im Detail (Center)? | Rechts, wie besprochen (Teil 1, 00:55 und 18:24). Tabs im Detail nur für eingebettete Inhalte (Columns, Descriptions). |
| O4 | Composer erweitern (emf.ts.ui) oder gene-Widgets? | Generische Fähigkeiten (ForEach+Summary, OCL-Conditional) in emf.ts.ui; CWM-spezifische Referenz-Tabellen als gene-Panel, nicht als Widget. |
| O5 | Remarks-Description: eigene Klasse per Stereotype oder nur `kind=remarks`? | `kind=remarks` reicht; Export nach SQL `COMMENT` ist eine Transformation, kein UI-Thema. |
| O6 | Was zählt als "Namespace-Stopp" bei D2: Klasse `Namespace` (dann stoppt Table, weil Classifier ⊂ Namespace) oder nur `Package`-Subklassen (Catalog/Schema)? | Am Mock mit beiden Varianten prüfen; Erwartung aus Teil 3 (02:18) ist "Catalog → nur bis Schema", das spricht für `Package`. |

---

## 6. Reihenfolge und Aufwand (grob)

| Schritt | Aufwand | Ergebnis |
|---|---|---|
| 3.1 M1–M4 Daten-Mocks | 0,5 Tag | Workspace mit allen Referenztypen |
| 3.2 M5 UIModel-Mock | 0,5–1 Tag | Befund Composer-Fähigkeiten, Tabs+Embedding sichtbar |
| 3.3 M6–M9 Mock-Plugin | 2–3 Tage | Klickbares Referenz-Panel mit History, Abnahme-Szenario |
| Abnahme + Tickets schreiben | 0,5 Tag | Epics 1–5 als Issues |
| Epic 2 (Index) | 2–3 Tage | Produktiver Index mit Tests |
| Epic 3 (Panel/History) | 3–4 Tage | Ersetzt Mock-Plugin |
| Epic 1 (Detail-View) | 2–4 Tage, abhängig von O4 | CWM-Default-UIModels |
| Epic 4, 5 | je 2–3 Tage | Tree, Defaults |

Nächster konkreter Schritt: **M1** (Workspace sichern, `mock-businessinfo.xmi`
anlegen, `.wsp` ergänzen).

---

## 7. Befunde aus Mock-Stand 1 (2026-09-29)

Umgesetzt: M1–M3 (Workspace, Git-Commit `31da3b9` in `UDP_MIT_ORM`) und M5
(drei UI-Modelle unter `UDP_MIT_ORM/uimodels/`). Verifiziert in gene per
Playwright-Skript (`test-data/udp-mit-orm/verify-mock.mjs`, lädt Metamodelle,
beide Instanzdateien und die UI-Modelle über die TSM-Services wie
`e2e/uimodel-properties.spec.ts`). M4 (Tree-View) ist offen.

| # | Befund | Folge für Entscheidung / Ticket |
|---|---|---|
| B1 | **Cross-Resource-Referenzen funktionieren.** Alle 21 `modelElement`-hrefs aus `mock-businessinfo.xmi` auf `instances.xmi` sind nach dem Laden aufgelöst (kein Proxy), inkl. Tree-Darstellung und Link im Formular. Speichern-Roundtrip noch nicht geprüft. | **O2: eigene Datei bleibt.** Mock-Daten wandern nicht nach `instances.xmi`. |
| B2 | **OCL im Composer liefert nur boolesch.** `GeneOclValidator.evaluateExpression` (`ui-uimodel-forms/src/oclAdapter.ts:73`) ist der Adapter für `evaluateValue`; er antwortet asynchron und fail-open mit `true`. `ForEach.items` mit OCL ergibt deshalb `true` statt einer Collection (Konsole: "ForEach: Element ist kein EObject … true"). `allInstances()` damit unbenutzbar. | **O4:** Wert-Ausdrücke brauchen entweder einen synchronen OCL-Query-Pfad in gene (Ticket 1.1) oder bleiben bei JS. |
| B3 | **JS-Ausdrücke funktionieren synchron.** `self` ist ein Proxy des Composers (`evaluateExpression.js`, Feature-Zugriff `self.feature`, `self.ownedElement`), rohe EObjects erreicht man über `eContainer()`/`eContents()`. Damit rendern: Columns eingebettet (A1), Descriptions der Table als Markdown (A2), Remarks getrennt (A3), Kind-Descriptions eingebettet (E3), TaggedValues (O1 Variante B). | Ticket 1.1 konkretisiert: JS ist tragfähig für Mocks; für Produktiv-UIModels sollte der Composer eine `items`-Quelle ohne Skript bekommen (z. B. `feature`-gebundenes ForEach). |
| B4 | **Inverse-Lookup per naivem Scan in JS klappt** (alle Resources, `getAllContents()`, `modelElement` vergleichen), auch über die Dateigrenze: Column `gkz` zeigt die Description aus `instances.xmi` **und** "1.1 Stellen des Schlüssels" aus der Mock-Datei, dazu Term und Responsible Party. Vorbehalt: Vergleich läuft über Name+Klasse im Container, weil der Proxy die Identität verdeckt. | Epic 2 bestätigt; der Index sollte als Service statt als Skript im UIModel leben. |
| B5 | **TabView rendert keine Tabs.** `TabViewComposer.vue.js` des Composers erzeugt nur `div.uimodel-tab-view > div.uimodel-tab-panel[data-tab]`, gestapelt. | Ticket neu (Epic 1): gene registriert einen eigenen TabView-Composer mit PrimeVue Tabs in `UimodelPropertiesView.vue` (Registry-Map Zeile 42–49). Bis dahin: SectionView. |
| B6 | **Falsche Pflichtfeld-Fehler.** Jedes `body`-Feld zeigt "… is required", obwohl gefüllt: die OCL-Validierung `self.body <> null` scheitert im `OclService` mit `TypeError … reading 'getName'` (`useProblemsService.ts:676`) auf dynamischen CWM-Objekten hinter dem Composer-Proxy. | Eigenes Bug-Ticket (gene, unabhängig vom Plan); betrifft Epic 1 Validierung. |
| B7 | **Icons aus `iconMappings` greifen** für ResponsibleParty, Contact, Email, Document, Description (Tree-Screenshot). Term/ChangeRequest/Measurement/Stereotype liegen unterhalb des sichtbaren Bereichs, Mapping identisch aufgebaut. | M3 abgenommen; Ticket 4.2 (Auto-Mapping) bleibt sinnvoll. |
| B8 | Beim Laden der Instanzen meldet der XML-Parser einmal "Unbound namespace prefix xsi (Line 36, Col 42)", alle 780 Objekte laden trotzdem. Herkunft (Original- oder Mock-Datei) nicht abschließend geklärt; die Standalone-Prüfung scheiterte an Neuladen des Dev-Servers. | Kurz nachprüfen, bevor M1 als Vorlage für weitere Dateien dient. |
| B9 | Default-Ansicht (ohne autoriertes UIModel) für ResponsibleParty/Term zeigt `modelElement` als Link-Liste ("Model Element: gemschluessel") — die Hin-Richtung ist also schon nutzbar. | B2-Navigation (Sprung ins Objekt) existiert; History (B3) fehlt weiterhin. |

**Stand der Entscheidungen:** O2 entschieden (eigene Datei). O1 am Mock
vergleichbar (beide Varianten sichtbar), noch offen. O4 präzisiert (siehe
B2/B3/B5). O3, O5, O6 unverändert offen; O6 braucht das Mock-Plugin (M6),
weil die Kinder-Aggregation im XMI-Mock nicht abgebildet ist.

**Nächste Schritte:** M4 (Tree-View), M6–M9 (Mock-Plugin mit Referenz-Panel,
Haken, History), Speichern-Roundtrip der Mock-Datei, B8 klären.
