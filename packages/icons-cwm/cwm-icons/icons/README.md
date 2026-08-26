# CWM · cwmx · daanse — Klassen-Icons

630 handgezeichnete SVG-Icons, eines je Klasse des Common Warehouse Metamodel
(OMG CWM 1.1) sowie der cwmx- und daanse-Erweiterungsmodelle, erzeugt aus den
Ecore-Modellen unter `model/cwm`, `model/cwmx` und `model/daanse`.

## Inhalt

```
index.html                  Übersicht aller Icons - einfach im Browser öffnen
svg/<paket>/<Klasse>.svg    630 Icons, Paketstruktur der Metamodelle gespiegelt
palette.md                  Farb-Tokens, Geometrie, Motivfamilien (Design-Referenz)
glyphs.json                 das Artwork (die gezeichneten Pfade)
assemble.py                 setzt den Rahmen um das Artwork
build_index.py              erzeugt index.html aus Modellen + Artwork
_head.html, _tail.html      Seiten-Chrome fuer build_index.py
```

## Ansehen

`index.html` im Browser öffnen — kein Server nötig, läuft direkt von der Platte.
Volltextsuche über Klassen- und Paketnamen, Größenschalter (16/24/32/48 px),
Hell/Dunkel-Umschaltung. Zeiger auf ein Icon zeigt den Beschreibungstext aus der
OMG-Spezifikation, ein Klick öffnet die zugehörige `.svg`-Datei.

## Systematik

Jedes Icon besteht aus genau zwei Teilen: einem **Rahmen** (abgerundetes Rechteck)
und einem **Glyph** in der Mitte. Der Rahmen trägt die Merkmale, die aus dem
Metamodell abgeleitet sind; der Glyph trägt die Bedeutung. Drei Kanäle sind kodiert:

| Kanal | Merkmal | Quelle |
|---|---|---|
| **Glyph** (Zeichnung in der Mitte) | *was* die Klasse ist | von Hand entworfen, `glyphs.json` |
| **Randfarbe** (auch Glyph-Tinte) | *aus welchem Paket* sie kommt | Paketpfad der Klasse |
| **Strichelung des Rahmens** | die Klasse ist **abstrakt** | `abstract="true"` im Ecore, beim Bauen geprüft |

Die Fläche bleibt transparent — das Paket lebt vollständig im Strich, deshalb
liegen die Icons auf jedem Hintergrund.

### Farben: Farbton = Zweig, Helligkeit = Unterpaket

Die Farbe folgt der Namespace-Hierarchie der Metamodelle. Jeder Zweig bekommt
einen Farbton; die Unterpakete eines Zweigs wandern eine Helligkeitsrampe
innerhalb dieses Farbtons entlang. Unterpakete **sollen** sich ähnlich sehen —
sie sind Geschwister. Die drei Modellfamilien sind als Farbwelten getrennt:
**cwm** behält Indigo/Cyan/Teal/Violett/Orange, **cwmx** ist Blau (analysis in
Sky), **daanse** ist Rosa/Rot (resource in Fuchsia, sql/etl in Pink,
governance in Rot).

| Zweig | Paket | Strich (hell) | Strich (dunkel) |
|---|---|---|---|
| cwm objectmodel (Indigo) | `objectmodel/core` | `#3730A3` | `#C7D2FE` |
| | `objectmodel/behavioral` | `#4338CA` | `#A5B4FC` |
| | `objectmodel/instance` | `#4F46E5` | `#818CF8` |
| | `objectmodel/relationships` | `#6366F1` | `#6366F1` |
| cwm foundation (Cyan) | `foundation/businessinformation` | `#155E75` | `#A5F3FC` |
| | `foundation/softwaredeployment` | `#0E7490` | `#67E8F9` |
| | `foundation/keysindexes` | `#0891B2` | `#22D3EE` |
| | `foundation/datatypes` | `#06B6D4` | `#06B6D4` |
| | `foundation/expressions` | `#164E63` | `#CFFAFE` |
| | `foundation/typemapping` | `#0369A1` | `#7DD3FC` |
| cwm resource (Teal/Smaragd) | `resource/relational` | `#115E59` | `#99F6E4` |
| | `resource/record` | `#0F766E` | `#5EEAD4` |
| | `resource/multidimensional` | `#0D9488` | `#2DD4BF` |
| | `resource/xml` | `#047857` | `#6EE7B7` |
| cwm analysis (Violett) | `analysis/olap` | `#5B21B6` | `#DDD6FE` |
| | `analysis/businessnomenclature` | `#6D28D9` | `#C4B5FD` |
| | `analysis/transformation` | `#7C3AED` | `#A78BFA` |
| | `analysis/datamining` (alle Unterpakete) | `#7E22CE` | `#D8B4FE` |
| | `analysis/informationvisualization` | `#A855F7` | `#E9D5FF` |
| cwm management (Orange) | `management/warehouseprocess` | `#9A3412` | `#FED7AA` |
| | `management/warehouseprocess/events` | `#C2410C` | `#FDBA74` |
| | `management/warehouseoperation` | `#EA580C` | `#FB923C` |
| cwmx (Blau; analysis = Sky) | `cwmx/analysis/informationreporting` | `#0C4A6E` | `#BAE6FD` |
| | `cwmx/analysis/informationset` | `#075985` | `#7DD3FC` |
| | `cwmx/foundation/er` | `#0284C7` | `#38BDF8` |
| | `cwmx/resource/cobol` | `#1E3A8A` | `#BFDBFE` |
| | `cwmx/resource/dmsii` | `#1E40AF` | `#93C5FD` |
| | `cwmx/resource/essbase` | `#1D4ED8` | `#60A5FA` |
| | `cwmx/resource/express` | `#2563EB` | `#3B82F6` |
| | `cwmx/resource/ims` | `#172554` | `#DBEAFE` |
| daanse (Rosa/Rot) | `daanse/dcat` | `#9F1239` | `#FDA4AF` |
| | `daanse/orm` | `#BE123C` | `#FB7185` |
| | `daanse/orm/map` | `#E11D48` | `#FECDD3` |
| | `daanse/sql` | `#831843` | `#F9A8D4` |
| | `daanse/sql/select` | `#9D174D` | `#F472B6` |
| | `daanse/tabular` | `#A21CAF` | `#E879F9` |
| | `daanse/etl/flow` | `#DB2777` | `#F9A8D4` |
| | `daanse/etl/status` | `#EC4899` | `#FBCFE8` |
| | `daanse/governance/criticality` | `#B91C1C` | `#FCA5A5` |
| | `daanse/governance/gdpr` (beide Unterpakete) | `#991B1B` | `#F87171` |
| | `daanse/governance/transparency` | `#7F1D1D` | `#FECACA` |
| | `daanse/resource/calc` | `#C026D3` | `#F0ABFC` |
| | `daanse/resource/json` | `#86198F` | `#D946EF` |
| | `daanse/resource/r` | `#701A75` | `#F5D0FE` |
| | `daanse/resource/relational/privilege` | `#4A044E` | `#F0ABFC` |

Unterpakete ohne eigenen Eintrag erben die Farbe ihres Elternpakets
(laengster-Praefix-Abgleich in `assemble.py`).

> **Bekannter Kompromiss:** `resource/relational` und `resource/record`
> unterscheiden sich nur in der Helligkeit, ebenso `analysis/olap` und
> `analysis/businessnomenclature`. Liest sich das zu schwach, bekommt das
> Unterpaket einen eigenen Farbton — dann entfällt aber das Zweig-Signal.

### Rahmen: gestrichelt = abstrakt

Abstrakte Klassen (`abstract="true"` im Ecore) tragen `stroke-dasharray="3 2"`
am Rahmen, konkrete einen durchgezogenen Strich. Das ist kein redaktionelles
Urteil, sondern wird von `assemble.py` beim Bauen aus dem Ecore gelesen —
Zeichnung und Modell können hier nicht auseinanderlaufen.

### Vererbung: kein eigener Kanal, sondern geteilte Konstruktion

Verwandtschaft war beim Entwurf **berücksichtigt und bewusst nicht als eigener
Kanal kodiert**: ein separates Familien-Abzeichen hätte jeden Glyph aus der Mitte
gedrängt, für ein Signal, das nur ein Nice-to-have war. Stattdessen reitet
Vererbung auf geteilter Zeichnungs-Konstruktion — verwandte Klassen benutzen
dasselbe Grundmotiv mit Varianten:

| Grundmotiv | geteilt von |
|---|---|
| **Ordner** | `Package` → Model, Catalog, Schema, RecordFile, Extent, ProcessPackage, BusinessDomain, DeploymentGroup … |
| **Notizkarte** | `Instance` → Object, DataValue, Row, Record, ColumnValue, FieldValue |
| **Marker + Balken** | `Feature` → StructuralFeature (hohler Marker) → Attribute (voller Marker) → Column, Field, Measure |
| **Sechseck** | `BehavioralFeature` → Method (voller Kern), Operation (hohler Kern), Procedure (Play-Dreieck) |
| **Schlüssel** | `UniqueKey` (hohler Bart) → UniqueConstraint, PrimaryKey (voller Bart), ForeignKey (Ring) |
| **Typ-Etikett** | `DataType` → TypeAlias, SQLDataType, SQLSimpleType, SQLDistinctType, SQLStructuredType |
| **Raster** | `ColumnSet` → NamedColumnSet, Table (voller Kopf), View (gestrichelter Körper), Column, Row |
| **Stern/Burst** | `Event` → WarehouseEvent → ExternalEvent, InternalEvent → CascadeEvent, RetryEvent |
| **Uhr** | `ScheduleEvent` → PointInTimeEvent, IntervalEvent, RecurringPointInTimeEvent |
| **Würfel** | `Cube` → CubeRegion, CubeDeployment, CubeDimensionAssociation |
| **Klammern** | `Constraint` → CheckConstraint |
| **Buch** | `Nomenclature` → Glossary, Taxonomy |

Die Erweiterungszweige führen dieselbe Logik mit eigenen Grundmotiven fort:

| Grundmotiv | geteilt von |
|---|---|
| **Schieberegler** | `MiningFunctionSettings` → alle *FunctionSettings (Variante = Funktionsmotiv in der unteren Zeile), ModelCapabilities, PersistenceUnitDefaults |
| **Klemmbrett** | `MiningTask` → Build (Play), Apply (Pfeil), Test (Haken); DPIA-, Risk-, Transparency-Assessments; DataProcessingRecord |
| **Achse + Diagramm** | `MiningResult` → TestResults, LiftAnalysis, DimensionScore |
| **Entscheidungsraute** | `ComparisonPredicate` → alle SQL-Prädikate (Variante = Operator in der Raute), Risk |
| **Klammern + Operator** | `Expression` → alle SQL-Ausdrücke, ExpressionNode-Familie, ScalarSubquery |
| **Mini-Raster** | `TableReference` → Named/Derived/Explicit/Unresolved, QuerySpecification (Lupe), VALUES (Punktzeilen), Join (Venn) |
| **Zylinder** | `PhysicalData` → Database (dmsii/essbase/express/ims-Varianten: Hash, Index-Pfeil, Blitz, gestrichelt), Dataset (dcat) |
| **Band-Box** | `Section` (COBOL) → File/WorkingStorage/Linkage/ReportWriter (Variante = Inhalt im Band) |
| **Knoten-Box** | `Segment` (IMS) → Complex (doppelt), Logical (gestrichelt), Sen* (markiert) |
| **Stift (Override)** | dmsii *Override, orm *Override, ChangeAssessment |
| **Pre/Post-Pfeil** | orm-Lifecycle-Callbacks: Pfeil vor dem Symbol = Pre, Symbol vor dem Pfeil = Post |
| **Ausweis** | `Privilege` → Table (Raster), Procedure (Sechseck), Role (Person) |
| **Schild** | RegimeProfile, AuditEvent, DPIA, ResponsibilityDPIA |
| **Auge** | Perspective → PerspectiveTable, Transparency-Familie |

Einige Paare sind absichtlich identisch gezeichnet und nur durch die Farbe
getrennt — `Index`/`SQLIndex`, `Parameter`/`SQLParameter`,
`IndexedFeature`/`SQLIndexColumn`, `DataType`/`SQLDataType`. Es ist derselbe
Begriff in einer anderen Ressourcenschicht; das ist gewollt, keine Kollision.

### Was das Modell noch hergibt — und was davon (nicht) kodiert ist

Das Metamodell kennt weitere Eigenschaften je Klasse. Der Vollständigkeit halber,
mit ihrem Status beim Entwurf:

| Modell-Eigenschaft | Status im Icon |
|---|---|
| Paketzugehörigkeit | **kodiert** (Randfarbe) |
| `abstract` | **kodiert** (Strichelung), generiert aus dem Ecore |
| Vererbung / Familienzugehörigkeit | **bewusst nicht kodiert** — stattdessen geteilte Glyph-Konstruktion (siehe oben) |
| **Namespace-Eigenschaft** (Klasse erbt von `Namespace`, kann also Elemente besitzen: Package, Model, Schema, Catalog, Class …) | **nicht kodiert und beim Entwurf nicht als Kanal berücksichtigt.** Indirekt sichtbar, wo das Motiv ohnehin ein Behälter ist (Ordner-Familie), aber z. B. `Class` oder `Table` sind Namespaces, ohne dass man es dem Icon ansieht. Nachrüstbar am Rahmen (z. B. doppelter Rand oder Ecken-Lasche), aus dem Ecore ableitbar wie das Abstract-Flag. |
| Rollen wie `Classifier` / `Feature` / `Instance` | **nicht als Kanal kodiert**, aber faktisch über die Motivfamilien lesbar (Marker+Balken = Feature, Notizkarte = Instance …) |
| Multiplizitäten, Sichtbarkeit, Attribute/Referenzen der Klasse | **nicht kodiert** — ein 24-px-Icon trägt das nicht; dafür sind die Diagramme da |

### Geometrie

* `viewBox="0 0 24 24"`; Rahmen: abgerundetes Rechteck, Einzug 1.5, Radius 4, Strichstärke 1.5.
* Jeder Glyph ist auf (12,12) zentriert, im Feld `x 6..18, y 6..18`; Strichstärke 1.5, runde Kappen und Ecken.
* Beliebig skalierbar; 48×48 ist ein exaktes 2×.
* Die Zentrierung ist **gemessen, nicht behauptet**: `check_center.py` parst jeden Pfad
  (inkl. Bögen und Béziers), berechnet die Bounding-Box und schlägt fehl, wenn ein Glyph
  mehr als 0.45 Einheiten von der Mitte abweicht oder das Feld verlässt.

### Hell/Dunkel

Jede Datei bedient beide Themes selbst über `prefers-color-scheme`:

```svg
<style>
  :root { --stroke: #115E59 }
  @media (prefers-color-scheme: dark) { :root { --stroke: #99F6E4 } }
</style>
```

## Einbinden

Als Bild funktioniert es überall, ohne Vorbereitung:

```html
<img src="svg/resource/relational/Table.svg" width="24" alt="Table">
```

> **Achtung beim direkten Inline-Einbetten.** Jede Datei deklariert ihre Farbe als
> `:root { --stroke: … }` in einem eigenen `<style>`-Block. Standalone, per `<img>`,
> `<object>` oder als CSS-Hintergrund ist das korrekt. Kopierst du dagegen mehrere
> SVGs **direkt in dieselbe HTML-Seite**, zielen alle `:root`-Regeln auf dasselbe
> Dokument und die zuletzt eingefügte Farbe gewinnt für alle.
> Für diesen Fall den `<style>`-Block entfernen und die Farbe je Element setzen,
> z. B. `style="--stroke: light-dark(#115E59, #99F6E4)"`.

## Neu erzeugen

```bash
python3 assemble.py
```

Liest `glyphs.json` und holt `abstract="true"` direkt aus den Ecores; bricht ab,
wenn ein Glyph eine Klasse benennt, die es in den Metamodellen nicht gibt.

`assemble.py` liest alle Einzel-Ecores unter `model/cwm/*/model/`,
`model/cwmx/*/model/` und `model/daanse/**/model/` und meldet Klassen, die noch
keinen Glyph haben (derzeit: keine). `python3 build_index.py` erzeugt danach die
Uebersichtsseite neu; die Beschreibungstexte kommen aus den
documentation-Annotationen der Ecores, ersatzweise aus der Design-Notiz in
`glyphs.json`.

## Lizenz / Herkunft

Die Klassennamen und Beschreibungstexte der cwm-Pakete stammen aus der
OMG-Spezifikation Common Warehouse Metamodel 1.1, die der cwmx-Pakete aus den
CWM-Extension-Modellen, die der daanse-Pakete aus den Daanse-Modellen dieses
Repositories. Die Zeichnungen sind für Eclipse Daanse entstanden.
