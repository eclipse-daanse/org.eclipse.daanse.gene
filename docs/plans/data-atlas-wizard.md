# Data-Atlas-Konfigurations-Wizard in `gene`

> **Status:** freigegeben, noch nicht begonnen. Umsetzung startet bei Schritt 1
> der Reihenfolge in Abschnitt 10.
>
> **Änderungen 2026-09-09:**
>
> 1. Das Ziel-XMI entsteht über EMF (`saveToString()` plus zwei
>    Serializer-Überschreibungen), nicht über einen String-Builder wie in den
>    beiden bestehenden Wizards. Am Golden-File `example/dataatlas.xmi`
>    verifiziert; betroffen sind die Abschnitte 3, 4, 6, 7, 8 und 10.
> 2. QVT-O kommt im nächsten Schritt und geht über **LSP** — neuer
>    Abschnitt 11. An Iteration 1 ändert das nichts.
>
> **Herkunft:** erarbeitet im Repo `data.atlas` (dem Java/OSGi-Gegenstück),
> Stand 2026-09-09. Alle Modell- und Verhaltensaussagen sind dort im Code
> verifiziert; die Pfade in Klammern nennen die jeweilige Quelldatei.
>
> **Zwei Repos, zwei Pfadwurzeln** — beim Lesen auseinanderhalten:
>
> | Pfadform | Repo | Wurzel |
> |---|---|---|
> | `packages/…`, `src/tsm/…`, `vite.config.ts`, `vitest.config.ts`, `docs/…` | **dieses** (`gene`) | `/mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/gene` |
> | `org.eclipse.fennec.data.atlas.*`, `example/…`, `docker/…`, `docs/user-guide.md` | `data.atlas` | `/mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/data.atlas` |
>
> `data.atlas` ist ein Geschwister-Checkout — dieselbe Lage, aus der
> `packages/eorm-wizard` per `sync:eorm-model` schon seine `.ecore`-Kopien
> zieht. Es wird **nur gelesen** (Metamodell, Beispiel-XMIs, Seed-Skript als
> Vorbild für den Publish-Flow); geändert wird ausschließlich `gene`.

## Context

Der **Fennec Data Atlas** wird vollständig durch ein EMF-Modell beschrieben
(`DataAtlasConfiguration`), das eine laufende Instanz per Diff ohne Restart
übernimmt — entweder aus einer gemounteten XMI-Datei (File-Modus) oder aus
einem Model-Atlas-Scope (Atlas-Modus). Geschrieben wird diese XMI heute von
Hand, mit zahlreichen Fallstricken: nsURI- vs. relative Hrefs je Modus,
`xsi:type` bei abstrakten Features, ID-Referenzen als bloße Strings,
override-else-default-Trias, die Regel „≥ 1 Export ersetzt die Defaults
vollständig".

`gene` ist der Browser-Editor derselben Projektfamilie und hat für genau diese
Aufgabe zwei erprobte Vorbilder: `eorm-wizard` (EMF-Modell → `.eorm`
JPA-Mapping) und `sensinact-mapping-wizard` (Sensor-Ecore →
`ProviderMapping`). Beide arbeiten auf einem fachsprachlichen
**Fassadenmodell** und erzeugen daraus per Transformer das konforme Ziel-XMI —
zum Download oder direkt in einen Model-Atlas-Scope publiziert. Ein
Data-Atlas-Pendant fehlt; `gene` kennt den Data Atlas bislang überhaupt nicht.

**Ziel:** ein neues Paket `packages/data-atlas-wizard`, das in fachsprachlichen
Schritten eine `DataAtlasConfiguration` für die Fälle *Datei→REST* und
*JPA→REST* zusammenstellt, client-seitig validiert und entweder als XMI
herunterlädt (File-Modus) oder in einen Model-Atlas-Scope publiziert
(Atlas-Modus, inkl. Stage-Transition).

**Nicht in dieser Iteration:** Transformation/Bridge (QVT-O), GeoJSON,
Query-DataSets, DCAT-Publication, XMLA/QGis/OData. Das Fassadenmodell wird so
geschnitten, dass sie als eigene Schritte nachwachsen können. QVT-O ist der
nächste — Abschnitt 11.

**QVT-O ist in Iteration 1 zurückgestellt** (Entscheidung 2026-09-09), und zwar
nicht aus Aufwandsgründen: `DataTransformation.transformation` verlangt den
**AST als Modell**, nicht QVT-O-Text. Bisher erzeugt ihn nur die Java-Engine
(`example/trafo/AstGen.java` über `QvtoEngines`), und `grep -rln "@Path"` über
das ganze `emf.m2x`-Repo findet keine REST-Ressource — es gibt also keinen
Compile-Dienst, den ein Browser aufrufen könnte.

**Der Weg dorthin ist LSP** (Entscheidung 2026-09-09) — Einzelheiten in
Abschnitt 11. Damit entfällt der Compile-Dienst als Voraussetzung, statt auf
ihn zu warten.

Das bestehende `packages/transformation` in `gene` ersetzt das nicht: es macht
QVT-**R** und erzeugt Quelltext als reine Textvorschau plus ein eigenes JSON
(`format: 'gene-qvtr'`). Seine UI-Bausteine (Feature-zu-Feature-Spalten,
`AutoMapDialog`, `OclMonacoEditor` + `useOclLanguageClient`) sind aber genau
die Vorlage für den nächsten Schritt.

---

## 1. Fassadenmodell `model/data-atlas-wizard.ecore`

nsURI `http://fennec/data/atlas/data-atlas-wizard/1.0`, nsPrefix
`dataatlaswizard`, Codegen-`prefix` `Dataatlaswizard`.

Die Fassade **vereinfacht** bewusst gegenüber `configuration.ecore`:

| Zielmodell erlaubt | Fassade in Iteration 1 | Grund |
|---|---|---|
| n `DataService`s | **genau einen** `RestDataService` | Service-Felder liegen flach am Setup; ein zweiter Endpunkt ist ein zweiter Wizard-Durchlauf |
| Trias (`dataInput`/`transformation`/`distributionExport`) auf Service- **und** DataSet-Ebene | `dataInput` **nur am Service** (= Default für alle DataSets), `distributionExport` **nur am Service** | override-else-default ist der Fortgeschrittenen-Fall; die Fassade nutzt konsequent den Service-Default (Muster `tests/fixtures/dataatlas-servicedefault.xmi`) |
| n `DataInput`s | **einer** (Datei *oder* Datenbank) | mehr Inputs = mehrere Durchläufe |
| `DataSet.inputType ≠ outputType` | `inputType = outputType` | Abweichung braucht eine Transformation → spätere Iteration |
| `childDataSet`/`parentDataSet`, `query` | nicht abgebildet | spätere Iteration |
| `DistributionExport` frei | Enum `ExportKind` | vier real sinnvolle Kombinationen |

### Klassen

**`AtlasSetup`** (Root)

| Feature | Typ | Kard./Default | Entscheidung des Nutzers |
|---|---|---|---|
| `instanceName` | EString | 1 | Name der Data-Atlas-Instanz → `DataAtlasConfiguration.name` |
| `instanceDescription` | EString | | Beschreibung |
| `configMode` | `ConfigMode` | 1, `FILE` | „Wo liegt die Konfiguration später?" — steuert Href-Dialekt und URI-Absolutheit |
| `modelPackage` | `Ecore#//EPackage` | 1 | das Domänen-Modell |
| `modelFiles` | `ModelFileRef` | 0..* containment | nur `FILE`-Modus: unter welchem relativen Pfad liegt jede `.ecore` neben der Konfiguration |
| `inputKind` | `InputKind` | 1, `FILE` | „Woher kommen die Daten?" |
| `fileSource` | `FileSourceConfig` | 0..1 containment | sichtbar bei `inputKind = FILE` |
| `databaseSource` | `DatabaseSourceConfig` | 0..1 containment | sichtbar bei `inputKind = DATABASE` |
| `datasets` | `DatasetConfig` | 0..* containment | welche Klassen werden Datensätze |
| `exports` | `ExportConfig` | 0..* containment | welche Formate |
| `serviceId`, `serviceName`, `serviceDescription` | EString | 1 | Identität des REST-Endpunkts |
| `urlContext` | EString | 1 | Basis-Pfad, z. B. `/example` |
| `openApi` | EBoolean | 1, `false` | OpenAPI-Beschreibung ausliefern |
| `paginationOffsetParameterName` | EString | 1, `offset` | Query-Parameter-Namen |
| `paginationSizeParameterName` | EString | 1, `limit` | |

`inputKind` + zwei optionale Containments (statt abstrakter Subklassen), weil
`visibilityCondition language="JS" body="self.inputKind === 'FILE'"` im
UIModel damit direkt funktioniert.

**`ModelFileRef`**: `modelPackage` → `Ecore#//EPackage`(1), `fileName`(1, z. B.
`model/person.ecore`). Kein Gegenstück im Zielmodell — reiner
Serialisierungskontext für die Hrefs des `FILE`-Modus. Als Liste, weil
Cascade-Laden und Multi-File-Upload regelmäßig mehrere Packages einbringen;
fehlt im `FILE`-Modus der Eintrag zu einem referenzierten Package, ist das ein
harter Fehler (der Href würde sonst stillschweigend falsch).

**`FileSourceConfig`**: `id`(1), `fileUri`(1) — im `FILE`-Modus relativ
(`data/persons.xmi`), im `ATLAS`-Modus **absolut**
(`/opt/dataatlas/runtime/data/data/persons.xmi`); die Validierung erzwingt das.

**`DatabaseSourceConfig`**: `id`(1), `dataSourceId`(1), `dataSourceName`(1),
`dataSourceFilter`(1, LDAP, z. B. `(dataSourceName=personsDs)`),
`mappingKind`: `MappingKind`(1, `DERIVED`), `eormXmi`: EString (0..1 — das
importierte `EntityMappings`-Dokument als Rohtext, s. Abschnitt 3).

**`DatasetConfig`**: `selected`: EBoolean (default `true`), `targetClass`:
`Ecore#//EClass`(1) — **nicht** `eClass`, der Name kollidiert mit
`EObject.eClass()` und die generierte Impl liesse sich nicht mehr übersetzen
(gleiche Wahl wie im eorm-Wizard) —, `id`(1), `name`(1), `description`(1), `path`(1),
`batchSize`: EInt (default `-1`), `batchSizeLimit`: EInt (default `-1`).
`EInt` statt `EBigInteger` — der Transformer schreibt den Dezimalstring.

**`ExportConfig`**: `selected`: EBoolean (default `true`), `kind`:
`ExportKind`(1), `id`(1), `name`(1), `description`(1), `separator`: EString
(default `;`), `includeTypeHeader`: EBoolean (default `false`).

### Enums

`ConfigMode { FILE, ATLAS }` · `InputKind { FILE, DATABASE }` ·
`MappingKind { DERIVED, IMPORTED }` · `ExportKind { JSON, XML, CSV, CSV_ZIP }`

`ExportKind` → Ziel: `JSON`/`XML` als plain `DistributionExport` mit
`mediaType`, `CSV`/`CSV_ZIP` als `CSVDistributionExport`
(`compressed="true"` beim ZIP).

`model/data-atlas-wizard.genconfig.xmi` analog zu
`packages/eorm-wizard/model/eorm-wizard.genconfig.xmi`
(`ecorePackage` = nsURI + `#/`, `generation mode="emf" outputDir="src/generated"`).
Generierten Code **einchecken**; `src/emf/wizardPackageFixup.ts` mit den vier
Enums und allen EAttribut-Typen füllen.

## 2. Ableitungsregeln (`src/wizard/context.ts`)

Aus dem gewählten `EPackage`:

- `instanceName` = `pkg.getName()`; `slug` = kebab-case davon.
- je **konkreter** EClass (nicht abstrakt/Interface) ein `DatasetConfig`:
  `id` = lowerCamel(EClass-Name), `name` = Title Case, `path` = `id`,
  `description` = GenModel-`documentation`-Annotation der EClass, sonst
  `Alle <Name>-Objekte.` — dieselbe Annotation, die der Data Atlas
  serverseitig für DCAT-Beschreibungen heranzieht.
- `serviceId` = `${slug}-rest`, `serviceName` = `${instanceName} REST`,
  `urlContext` = `/${slug}`.
- `fileSource.id` = `${slug}-file`, `fileUri` = modusabhängig
  `data/${pkg.getName()}.xmi` bzw. der absolute Pfad darunter.
- `databaseSource.dataSourceId` = `${slug}-db`, `dataSourceFilter` =
  `(dataSourceName=${lowerCamel(slug)}Ds)`.
- `exports` bleibt leer → Runtime-Defaults JSON + XML.
- `supportedEClasses` des Inputs = die EClasses aller *selektierten* Datasets
  (wird erst im Transformer eingesetzt, nicht im Setup gespeichert).

Zustandsmuster wie in den Vorbildern: `shallowRef` + `version = ref(0)` +
`touch()`; jedes `computed` beginnt mit `void version.value;`.

## 3. Schrittfolge

| # | Schritt | Art | `blockReason` |
|---|---|---|---|
| 1 | **Modell** — Atlas-Tab (Verbindung/Suche/Cascade-Load) oder Upload-Tab | handgeschrieben, aus `eorm-wizard` kopiert (`ModelSourceStep.vue`, `AtlasSourceTab.vue`, `UploadSourceTab.vue`) | kein EPackage gewählt |
| 2 | **Instanz & Modus** — `instanceName`, `instanceDescription`, `configMode`, `inputKind` | UIModel `src/assets/wizard-ui/step-instance.xmi` | `instanceName` leer |
| 3 | **Datenquelle** — Datei: `fileUri`; Datenbank: `dataSourceName`, `dataSourceFilter`, `mappingKind` | UIModel `step-source.xmi` mit `visibilityCondition` auf `inputKind`/`mappingKind`, plus handgeschriebener Import-Knopf für `mappingKind = IMPORTED` | Pflichtfeld leer; `ATLAS` + relative `fileUri`; `IMPORTED` ohne Mapping |
| 4 | **Datensätze** — Häkchen je EClass, `id`/`name`/`description`/`path`/`batchSize` | handgeschriebene Tabelle `DatasetsStep.vue` (Vorbild `ColumnsStep.vue`) | kein Datensatz gewählt; doppelte `id`/`path`; Pflichtfeld leer |
| 5 | **Endpunkt** — `serviceId`, `serviceName`, `serviceDescription`, `urlContext`, `openApi`, Pagination-Parameter | UIModel `step-service.xmi` | `urlContext` oder `serviceId`/`serviceName` leer |
| 6 | **Formate** — Checkbox-Liste JSON/XML/CSV/CSV-ZIP + CSV-Optionen | handgeschrieben `ExportsStep.vue` | keiner (leer ist zulässig) — aber Warnung, s. u. |
| 7 | **Zusammenfassung** — Prüfliste, XMI-Vorschau, Download, Publish-Panel | handgeschrieben `SummaryStep.vue` | — |

### JPA-Mapping: Wiederverwendung statt Nachbau

`mappingKind` entscheidet:

- **`DERIVED`** (Standard): kein `persistenceConfig`, nur `supportedEClasses`.
  Der Wizard zeigt die abgeleiteten Namen und **warnt** über deren
  Asymmetrie — Tabelle = EClass-Name UPPER CASE, Spalten = Feature-Namen
  verbatim, beide unquoted (auf PostgreSQL liest ein `id`/`firstName`-Modell
  also `person(id, firstname, …)`). Zusätzliche harte Prüfung: alle
  selektierten EClasses müssen in **einem** EPackage liegen
  (`JPADataInputConfigurator:187-190`).
- **`IMPORTED`**: ein fertiges `.eorm` wird importiert — Datei-Upload oder aus
  dem Model Atlas. Die Spalten-UI wird **nicht** nachgebaut: dafür existiert
  `packages/eorm-wizard`. Der Import validiert per `newResourceSet()` gegen
  `src/assets/eorm.ecore` (Root muss `EntityMappings` sein) und legt den
  Rohtext in `eormXmi` ab. Im Transformer wird daraus das Containment
  `<persistenceConfig …>`, und zwar über EMF: das Dokument wird in dasselbe
  ResourceSet geladen und sein `EntityMappings`-Wurzelobjekt an
  `persistenceConfig` gehängt (Abschnitt 4). Namespaces, Root-Tag und die
  Hrefs im Inneren macht damit der Serializer — auch modusabhängig, weil
  dieselbe Dialekt-Karte greift: `FILE` schreibt
  `model/<datei>.ecore#//<X>`, `ATLAS` den nsURI. Belegt durch
  `example/dataatlas-history.xmi:33`
  (`<eclass href="model/sensinact-history.ecore#//NumericData"/>`) gegen den
  Atlas-Zwilling; Zielbild ist `example/dataatlas-history-atlas.xmi`.

Ergänzend im Schritt 3 ein Verweis auf den eorm-Wizard (im gene-Betrieb per
TSM-Service öffnen, sonst als Textlink) — die beiden Wizards greifen so
ineinander, ohne Code zu teilen.

## 4. Transformer `src/transform/toDataAtlasConfig.ts`

Signatur wie beim Vorbild:
`buildDataAtlasXmi(setup: AtlasSetup): { xmi: string; fileName: string; warnings: string[] }`.

**Über EMF, nicht über einen String-Builder** — Entscheidung 2026-09-09, am
Golden-File `example/dataatlas.xmi` im Spike verifiziert. Der Transformer baut
das Zielmodell und lässt emf.ts serialisieren:

1. `configuration.ecore` (und bei `IMPORTED` `eorm.ecore`) im
   `EPackageRegistry` registrieren — das macht `src/emf/setup.ts`.
2. Instanzen über `cfgPkg.getEFactoryInstance().create(eClass)` erzeugen und
   die Features setzen. Querverweise als **Objekte** setzen
   (`dataSet.eSet(dataInputRef, inputObjekt)`), nicht als ID-Strings.
3. Wurzel in eine `DataAtlasResource` hängen, `saveToString()`.

Escaping, Namespace-Deklarationen, `xsi:type` bei abstrakten Features,
ID-Referenzen und space-separierte Referenzlisten macht damit der Serializer;
`XMLSave` hat sie alle (`escapeXml` Z. 971, `getTypePrefixedHref` Z. 495,
`sameDocHrefs.join(' ')` Z. 360). Auch die Elementreihenfolge kommt von selbst
richtig heraus: sie folgt der Feature-Reihenfolge im Metamodell, und die ist
`dataSources` → `dataInputs` → `dataSets` → `services` → `exports`.

### Die zwei Überschreibungen: `src/transform/dataAtlasResource.ts`

Von Hand bleiben genau zwei Stellen, beide weil emf.ts dort von Java EMF
abweicht. `XMLResource` bietet die Erweiterungspunkte, die Java EMF auch hat
(`protected createXMLSave()`, `getURIFragment()`) — zusammen rund 40 Zeilen.

**a) Href-Dialekt** — `class DataAtlasSave extends XMISave`, `getHref()`
überschrieben. `XMLSave.getHref` liefert für einen EClassifier den nsURI-Href,
weil EClassifier in emf.ts kein `eResource()` haben (emf.ts#80); der
`ATLAS`-Fall stimmt damit bereits. Im `FILE`-Modus schlägt die Überschreibung
zuerst in der Karte nsURI → Dateiname nach, die aus `setup.modelFiles`
entsteht, und liefert `model/person.ecore#//Person`. Fehlt dort der Eintrag zu
einem referenzierten Package, wirft sie — das ist der harte Fehler aus
Abschnitt 1, und dies ist der einzige Ort, an dem beide Informationen
zusammenkommen.

**b) ID-Fragmente** — `class DataAtlasResource extends XMIResource`,
`getURIFragment()` überschrieben: Wert des `iD="true"`-Attributs, sonst
`super`. emf.ts wertet `iD="true"` beim Speichern nicht aus (emf.ts#84); ohne die
Überschreibung entsteht `dataInput="/0/0"` statt `dataInput="persons-file"`.
Der Weg über `resource.setID()` wirkt auch, schreibt aber zusätzlich ein
`xmi:id`, das die Vorlagen nicht haben.

`configMode` steuert damit keine Zeichenketten mehr, sondern nur noch die
Dialekt-Karte — der Modus liegt an einer Stelle statt an jeder Href-Stelle.

### Was der Wizard weiter selbst prüft

Die Validierung gehört vor das Serialisieren, nicht in den Serializer.

- **Harte Fehler** (throw, im UI in einem `computed` gefangen): kein EPackage,
  kein selektierter Datensatz, leeres Pflichtfeld, `IMPORTED` ohne gültiges
  Mapping, `ATLAS` + relative `fileUri`, doppelte ids, im `FILE`-Modus ein
  referenziertes Package ohne `modelFiles`-Eintrag. `name` und `description`
  sind an `DataProvider` und `DistributionExport` `lowerBound=1` — leer ist
  also ein harter Fehler, keine Warnung.
- **Warnungen**: CSV gewählt ohne JSON/XML (≥ 1 Export ersetzt die
  Runtime-Defaults **vollständig**, alles andere wird `406`); `DERIVED` bei
  JPA (Namens-Asymmetrie); `batchSizeLimit < batchSize`.

`RestDataServiceConfiguration.id` wird vollständig abgeleitet
(`<dataSetId>-config`) und nicht abgefragt: der Wert bedeutet fachlich nichts.

### Was der Serializer anders macht als die Vorlagen

Drei Abweichungen, alle im Spike gemessen:

| Abweichung | Bewertung |
|---|---|
| Default-Werte fehlen (`openAPI="false"`) | EMF lässt sie weg, die Vorlagen sind handgeschrieben. Semantisch identisch — `path`, `batchSize`/`batchSizeLimit` und die Pagination-Namen sollten ohnehin nur bei Abweichung geschrieben werden, das erledigt sich damit |
| Attributreihenfolge und Umbrüche im Dokumentkopf | kosmetisch |
| einwertige Cross-Document-Referenz als Attribut (`inputType="model/person.ecore#//Person"`) statt als `<inputType href="…"/>` | offen, s. u. |

Der dritte Punkt ist ein Befund in emf.ts (#85): `XMLSave.js:318` schreibt
einwertige Nicht-Containment-Referenzen **immer** als Attribut,
`writeElements` (Z. 711) schreibt nur **mehrwertige** Cross-Document-Referenzen
als `href`-Element. Java EMF entscheidet nach dem Ort des Ziels, nicht nach der
Kardinalität — deshalb ist die Ausgabe gemischt: `supportedEClasses`
(mehrwertig) wird Element, `inputType` (einwertig) Attribut. Die Attributform
ist gültiges EMF — `.ecore` schreibt `eType="ecore:EDataType
http://www.eclipse.org/emf/2002/Ecore#//EString"` genauso — und emf.ts lädt sie
zurück (Round-Trip im Spike: `dataInput` → `persons-file`, `inputType` →
`Person`). Ob der Java-Data-Atlas sie annimmt, entscheidet Schritt 5 aus
Abschnitt 9. Schlägt es dort fehl, hängt es an emf.ts#85, nicht am Wizard.

### eorm-Mapping einbetten

`src/transform/embedEormMapping.ts` **entfällt**. Statt Textchirurgie am fremden
Dokument — Root-Tag umbenennen, `xmi:version` verwerfen, `xmlns:*` in den
Dokumentkopf hochziehen, die Hrefs im Inneren auf den Modus umschreiben — wird
das importierte `EntityMappings`-XMI in dasselbe ResourceSet geladen und sein
Wurzelobjekt an `persistenceConfig` gehängt. Namespaces und die inneren Hrefs
macht der Serializer, den Modus eingeschlossen, weil dieselbe Dialekt-Karte
greift.

Ein `persistenceConfig` ist im Atlas-Modus **nicht** erforderlich:
`example/dataatlas-postgres-atlas.xmi` fährt dort mit abgeleitetem Mapping.
Die Regel gilt nur andersherum — *wenn* eines existiert, muss es inline sein.

Der Spike liegt als `docs/plans/spike-emf-save.mjs` daneben — lauffähig aus dem
Repo-Wurzelverzeichnis (`node docs/plans/spike-emf-save.mjs`, liest
`configuration.ecore` und `person.ecore` aus dem `data.atlas`-Checkout) und
Keimzelle von `test/toDataAtlasConfig.test.ts`.


## 5. Publish-Flow `src/atlas/publish.ts`

Der Wizard-lokale `AtlasReadClient` (`src/atlas/clientFactory.ts`) muss
gegenüber der `eorm-wizard`-Kopie um zwei optionale Methoden wachsen, die der
gene-Client `packages/storage-model-atlas/src/ModelAtlasClient.ts` bereits
implementiert: `uploadSchema()` und `transitionObject()`. In
`AtlasModelSource` (`src/atlas/atlasSource.ts`) durchreichen, wie
`publishObject()` es vormacht.

Ablauf, Vorbild `data.atlas/docker/dockercompose/seed/seed.sh`:

1. Ziel wählen: `getScope(scope)` → echte Registry- und Stage-Namen
   (Referenz-Setup: Registry `configurations`, Stages `draft` → `release`,
   Objekt-Key `dataatlas`). Namen **nie annehmen**.
2. Schemas sicherstellen — je Stage (**`draft` und `release`**, jede Stage löst
   gegen ihre eigene Package-Sicht auf; ein nachgelagerter Schema-Transition-
   Weg ist nicht verlässlich, weil das Referenz-Setup
   `delete.after.transition: true` fährt), Reihenfolge **`eorm` zuerst**, dann
   `configuration.ecore`, dann die Domänen-Schemas: per `searchSchemas`/
   `getSchema` prüfen, nur Fehlende per `uploadSchema` hochladen
   (`?nsUri=<enc>&name=…&version=1.0.0`).
3. Instanz per `uploadObject(scope, registry, stage, objectId, xmi,
   {name, override: true})`, Content-Type `application/xmi`. Auf HTTP 5xx
   („Error de-serializing incoming data") **retryen**, 10× à 3 s — die
   Stage-Package-Sicht holt asynchron auf.
4. Optional `transitionObject(...)` nach `release`, weil der Data Atlas die
   finale Stage liest. Body ist handgebautes XMI
   (`<rest:StageTransitionRequest xmlns:rest="http://eclipse.org/fennec/model/atlas/rest/1.0" …/>`);
   JSON scheitert mit 500.

Fortschritt als Liste im `SummaryStep.vue` (je Schema/Instanz/Transition eine
Zeile mit Zustand), Fehler mit Status und Server-Antwort. Fehlt das
`configuration`-Schema im Scope und ist der Upload nicht gewünscht oder
abgelehnt (403 read-only Stage), bricht der Flow **vor** dem Instanz-Upload ab
und benennt das fehlende Schema.

`baseUrl` ist `/atlas/rest` über den Same-Origin-Proxy — der Model Atlas sendet
keine CORS-Header. Damit der Proxy auch auf eine Compose-Instanz zeigen kann,
`gene/vite.config.ts` einzeilig aufbohren:
`target: process.env.MODEL_ATLAS_URL ?? 'http://localhost:8086'`.

## 6. Dateiliste

```
packages/data-atlas-wizard/
├── manifest.json                     TSM-Plugin: entry src/plugin/index.ts,
│                                     dependencies [gene-app, ui-layout],
│                                     optionalDependencies [atlas-browser,
│                                     storage-model-atlas], provides
│                                     ui.data-atlas-wizard.open
├── package.json                      dev-Port 5598, serve:plugin 5498,
│                                     generate, sync:data-atlas-model, test
├── vitest.config.ts                  environment 'node', test/**/*.test.ts
├── index.html, src/main.ts, src/App.vue    Standalone-Betrieb
├── model/data-atlas-wizard.{ecore,genconfig.xmi}
├── src/generated/**                  emfts-codegen, eingecheckt
├── src/assets/configuration.ecore    Kopie (sync)
├── src/assets/eorm.ecore             Kopie (sync)
├── src/assets/wizard-ui/step-{instance,source,service}.xmi
├── src/emf/{setup.ts,wizardPackageFixup.ts}
├── src/wizard/{WizardShell.vue,context.ts,uiModels.ts,
│              ModelSourceStep.vue,AtlasSourceTab.vue,UploadSourceTab.vue,
│              SourceStep.vue,DatasetsStep.vue,ServiceStep.vue,
│              ExportsStep.vue,SummaryStep.vue}
├── src/transform/toDataAtlasConfig.ts Fassade → Zielmodell → saveToString()
├── src/transform/dataAtlasResource.ts XMISave/XMIResource-Unterklassen:
│                                     Href-Dialekt + iD-Fragmente
├── src/atlas/{ModelAtlasClient.ts,clientFactory.ts,atlasSource.ts,
│              cascadeLoader.ts,publish.ts}
├── src/widgets/{register.ts,InputFieldWidget.vue,EnumChooser.vue}
├── src/plugin/index.ts
├── scripts/{build-plugin.mjs,mock-atlas.mjs}
└── test/**                           s. Abschnitt 7
```

Zentrale Einträge außerhalb des Pakets (der Dev-Server und
`scripts/build-plugins.js` scannen `packages/*/manifest.json` selbst, brauchen
also **keinen** Eintrag):

| Ort | Was |
|---|---|
| `src/tsm/repositories.config.ts` → `startupModules` | `'data-atlas-wizard'` — verpflichtend |
| `public/config.xmi` → `<startupModules>` | **ebenfalls verpflichtend.** `src/main.ts:105` nimmt die Liste aus `config.xmi` und benutzt `repositories.config.ts` nur als Fallback, wenn jene **leer** ist — es wird nicht gemergt. Nebenbefund: in `config.xmi` fehlen `icons-cwm`, `eorm-wizard` und `sensinact-mapping-wizard`, die in `repositories.config.ts` stehen (`dmn-editor` ist dort auskommentiert). Die laufen heute nur, weil die XMI-Liste offenbar nicht greift — unabhängig vom Wizard zu klären |
| `vitest.config.ts` → `test.projects` | `'packages/data-atlas-wizard'`; das gene-Projekt exkludiert `packages/*-wizard/**`, deshalb muss der Paketname auf `-wizard` enden |
| `vite.config.ts` | Proxy-Ziel per `MODEL_ATLAS_URL` (optional, s. o.) |
| `release-plugins.json` | optional, fürs Release-Bundle |

## 7. Infrastruktur aus der Blaupause

Kopiervorlagen — jeweils von der **besseren** Quelle:

| Baustein | Quelle |
|---|---|
| `src/emf/setup.ts` | `sensinact-mapping-wizard` |
| `src/emf/wizardPackageFixup.ts` | beide identisch, Tabellen neu füllen |
| `src/atlas/*` | `eorm-wizard` (dort mit `clientFactory` am saubersten) |
| `scripts/build-plugin.mjs`, `scripts/mock-atlas.mjs` | `eorm-wizard` |
| UIModel-Schritte + `uiModels.ts` + `wizardUi`-Test | `sensinact-mapping-wizard` |

**Nicht** aus den Wizards übernommen wird der Transformer-Aufbau: `toEorm.ts`
und `toProviderMapping.ts` bauen ihr XMI als Text, dieser Wizard geht über EMF
(Abschnitt 4). Die dortigen Helfer `escapeXml()`/`eClassHref()` sind ohnehin
modulprivat und nicht importierbar, und `eClassHref` kennt nur den
nsURI-Dialekt.

`src/emf/featurePaths.ts` wird **nicht** gebraucht (kein Feld-Pfad-Picker in
Iteration 1) — falls später doch, die sensinact-Version nehmen, die
eorm-Kopie ist unbenutzt und veraltet.

Bekannte Fallen:

- **Codegen-Bug in `emfts-codegen`** (emf.ts#83): EAttribut-`eType`s fehlen,
  EEnums werden nicht als Classifier registriert → `wizardPackageFixup.ts`
  trägt beides zur Laufzeit nach und ist **bei jeder Modelländerung
  mitzupflegen**; der `wizardUi`-Test fängt Verstöße. Ohne den Fixup wird aus
  `openApi = true` beim Round-Trip der String `"true"` und aus `batchSize = 500`
  der String `"500"`.
- **emf.ts wertet `iD="true"` beim Speichern nicht aus** (emf.ts#84) →
  `getURIFragment()` überschreiben, sonst stehen Pfadfragmente (`/0/0`) statt
  der ids in den Referenzattributen. Betrifft nur das Schreiben; beim Laden löst
  `XMLHandler.resolveReference()` ID-Referenzen auf.
- **EClassifier haben in emf.ts kein `eResource()`** (emf.ts#80) → der
  `FILE`-Href-Dialekt fällt *nicht* aus der Resource-Lage heraus, sondern muss
  über die `modelFiles`-Karte kommen.
- **Einwertige Cross-Document-Referenzen schreibt emf.ts als Attribut**, nicht
  als `href`-Element (emf.ts#85, `XMLSave.js:318` gegen `writeElements`
  Z. 711) — gegen den Java-Data-Atlas zu verifizieren, s. Abschnitt 4.
- **EMF-Objekte sind nicht deep-reaktiv** → `shallowRef` + `version` +
  `touch()`, `void version.value;` in jedem `computed`.
- **Widget-Prioritäten ≥ 900**: der Host hängt über
  `ui-uimodel-forms/WidgetBridge` einen Catch-all mit Priorität 1 in die
  globale `componentRegistry`.
- **`EnumChooser` statt Default-`EEnumEditor`**: der Default schreibt
  numerische Werte, das generierte Modell erwartet Enum-Namen.
- **`.ecore`-Assets sind eingecheckte Kopien**, per `sync:*-model` (`cp`)
  aktualisiert; Quelle der Wahrheit bleibt das jeweilige Java-Repo.
- **Perspective-Wechsel nur über den Manager** aus `ui.registry.perspectives`.
- **`STORAGE_KEY`** in `atlasSource.ts` umbenennen — `eorm-wizard` teilt sich
  versehentlich den `localStorage`-Key von `sensinact-mapping-wizard`
  (`packages/eorm-wizard/src/atlas/atlasSource.ts:58`). Der Fehler dort bleibt
  bestehen, bis ihn jemand eigens behebt.


## 8. Tests

Eigene `vitest.config.ts` (`environment: 'node'`), Golden-Fixtures aus dem
data.atlas-Repo (`org.eclipse.fennec.data.atlas.configuration.model/example/`,
`org.eclipse.fennec.data.atlas.tests/fixtures/`) als Kopien unter
`test/fixtures/`.

**Verglichen wird semantisch, nicht zeichenweise.** Der Serializer lässt
Default-Werte weg und ordnet Kopfattribute anders als die handgeschriebenen
Vorlagen (Abschnitt 4); ein Byte-Vergleich würde also an Belanglosigkeiten
scheitern. Der Prüfstein ist stattdessen: erzeugtes XMI **und** Vorlage in je
ein ResourceSet laden und die Objektgraphen vergleichen — Typen, Attributwerte,
und die Referenzen als aufgelöste Objekte. Das prüft mehr als ein Textvergleich,
weil es die Hrefs mitprüft. Zusätzlich ein Textvergleich der `href="…"`-Werte
und der `xsi:type`-Attribute, denn genau die sind modusabhängig und sollen
sichtbar festgenagelt sein.

| Datei | prüft |
|---|---|
| `test/toDataAtlasConfig.test.ts` | Graphgleichheit gegen `dataatlas.xmi` (File-Modus), `dataatlas-atlas.xmi` (Atlas-Dialekt), **`dataatlas-postgres.xmi`** (JPA + CSV/JSON — bewusst der File-Zwilling, weil die Atlas-Variante `publication`/`<publications>` trägt, was Iteration 1 nicht erzeugt), `dataatlas-pagination.xmi`, `dataatlas-csv.xmi` (nur der `<exports>`-Block). Dazu der **Round-Trip**: erzeugtes XMI in ein ResourceSet laden, in dem `configuration.ecore`/`eorm.ecore` registriert sind und `person.ecore` unter der URI `model/person.ecore` liegt; geprüft werden `services[0].dataInput`, `configuration[0].dataSet` und `distributionExport` als **Objekte**. Bekanntes Rauschen: `configuration.ecore` verweist auf die nicht mitgelieferten Packages `query`, `eorm` und `qvtoperational` → „Forward ref UNRESOLVED" für `DataSet.query`, `JPADataInput.persistenceConfig` und `DataTransformation.transformation`; bewusst ignorieren, Iteration 1 emittiert nur `persistenceConfig` und lädt `eorm.ecore` dafür mit |
| `test/dataAtlasResource.test.ts` | die zwei Überschreibungen einzeln: `getHref()` liefert je Modus den richtigen Dialekt und **wirft**, wenn im `FILE`-Modus der `modelFiles`-Eintrag fehlt; `getURIFragment()` liefert den `iD`-Wert und schreibt **kein** `xmi:id` |
| `test/persistenceConfig.test.ts` | das importierte `EntityMappings` landet als `persistenceConfig`-Containment, die inneren Hrefs folgen dem Modus; Zielbild `dataatlas-history-atlas.xmi` (ersetzt den früheren `embedEormMapping`-Test) |
| `test/context.test.ts` | Ableitungsregeln: ids, `path`, `description` aus GenModel-`documentation`, Modus-abhängige `fileUri` |
| `test/validation.test.ts` | jede harte Regel und jede Warnung aus Abschnitt 4 einmal |
| `test/wizardUi.test.ts` | jedes `feature=`-Href der Schritt-XMIs löst auf und findet eine Registry-Komponente (fängt Umbenennungen im Fassadenmodell und den Codegen-Bug) |
| `test/publish.test.ts` | gegen Mock-`fetch`: Reihenfolge eorm→configuration→Domäne in **beiden** Stages, Retry auf 5xx, Transition-Payload als XMI, Abbruch bei fehlendem Schema |


## 9. Verifikation end-to-end

Der data.atlas-Compose-Setup ist die reale Gegenprobe
(`data.atlas/docker/dockercompose/docker-compose-atlas.yml`: Model Atlas
`localhost:8080/atlas/rest`, Data Atlas im Atlas-Modus `localhost:8082`):

1. `docker compose -f docker-compose-atlas.yml up` mit
   `DATA_ATLAS_REFRESH_INTERVAL=10000` (dieselbe Env-Variable koppelt
   `cache.ttl.ms`, sonst sieht der Poll ewig dieselbe gecachte Instanz) und
   dem Model-Atlas-Port auf `8086` gemappt bzw. `MODEL_ATLAS_URL` gesetzt.
   Der Seeder legt Scope, Registry und die Basis-Schemas bereits an.
2. `npm run dev` in `gene`, Wizard-Perspektive öffnen, Modell `person.ecore`
   aus dem Atlas laden, Datei-Grundfall durchklicken, Modus `ATLAS`.
3. XMI-Vorschau gegen `example/dataatlas-atlas.xmi` vergleichen; Download
   prüfen.
4. Publish nach `dataatlas`/`configurations`/`draft`, Transition nach
   `release`.
5. Nach ≤ 10 s muss `curl http://localhost:8082/rest/<urlContext>/<path>`
   die Daten liefern; im Data-Atlas-Log darf keine `WARNING`/`ERROR`-Zeile des
   `ConfigurationRegistrar` stehen.
6. Gegenprobe JPA: `docker-compose-postgres.yml`-Setup, Wizard mit
   `inputKind = DATABASE`, `DERIVED`, Filter `(dataSourceName=personsDs)` →
   Ergebnis muss dem `dataSources`/`dataInputs`/`services`-Teil von `example/dataatlas-postgres.xmi` entsprechen.
7. `npm run test:unit` (beide vitest-Projekte) und `npm run type-check`.

## 10. Umsetzungsreihenfolge

| Schritt | fertig, wenn |
|---|---|
| 1. Paketgerüst | `packages/data-atlas-wizard` mit `package.json`, `manifest.json`, `vitest.config.ts`, Standalone-`main.ts`; `npm run dev` zeigt eine leere Shell |
| 2. Fassadenmodell + Codegen | `model/data-atlas-wizard.ecore` + genconfig, `npm run generate` erzeugt `src/generated`, eingecheckt |
| 3. EMF-Setup | `setup.ts` + `wizardPackageFixup.ts`; ein Smoke-Test registriert Fassade, `configuration.ecore` und `eorm.ecore` ohne Fehler |
| 4. Ableitungsregeln | `context.ts` + `test/context.test.ts` grün |
| 5. Serializer-Unterklassen | `dataAtlasResource.ts` + `test/dataAtlasResource.test.ts` grün: beide Href-Dialekte, Wurf bei fehlendem `modelFiles`-Eintrag, `iD`-Fragment ohne `xmi:id` |
| 6. Transformer Datei-Grundfall | `test/toDataAtlasConfig.test.ts` grün gegen `dataatlas.xmi` und `dataatlas-atlas.xmi` — Graphgleichheit plus Href-Vergleich, nicht zeichenweise (Abschnitt 8); der Round-Trip löst alle Referenzen zu Objekten auf |
| 7. Transformer JPA | `dataatlas-postgres.xmi` reproduziert; `persistenceConfig.test.ts` grün |
| 8. UI-Schritte | alle sieben Schritte durchklickbar, `blockReason` je Schritt greift, `wizardUi.test.ts` grün |
| 9. Download | XMI-Datei landet im Browser-Download, Vorschau im Summary |
| 10. Publish | `publish.ts` + `test/publish.test.ts` grün, Publish gegen `mock-atlas.mjs` erfolgreich |
| 11. Plugin-Integration | `startupModules`-Eintrag, Perspektive/Panel/Activity erscheinen in `npm run dev`, `build:plugin` läuft ohne Externals-Warnung |
| 12. End-to-end | Verifikation aus Abschnitt 9 durchlaufen |
| 13. Doku | `packages/data-atlas-wizard/README.md` im Stil von `eorm-wizard/README.md`; in `data.atlas/docs/user-guide.md` ein Absatz „Konfiguration im Browser erstellen" |

## 11. Nächster Schritt: QVT-O über LSP

Nicht Teil von Iteration 1, aber die Richtung ist entschieden (2026-09-09), und
das Fassadenmodell ist in Abschnitt 1 so geschnitten, dass die
Transformation als eigener Schritt nachwachsen kann
(`DataSet.inputType ≠ outputType` wird dann erlaubt).

**Warum LSP den Blocker auflöst.** Der Data Atlas braucht kein Textformat und
keinen Compile-Endpunkt, wenn der Sprachdienst den AST selbst baut. Genau das
tut der OCL-Stack heute schon: `EMFTs/ocl-langium` parst, `EMFTs/ocl-model`
hält das Ergebnis als EMF-Modell, `EMFTs/ocl-lsp-worker` spricht LSP darüber.
Für QVT-O existiert das Ziel-Metamodell bereits als Ecore —
`emf.m2x/org.eclipse.fennec.m2x.qvto.model/model/{qvtoperational,imperativeocl,trace}.ecore`,
24 EClasses in `qvtoperational` —, und `gene` kann ein EMF-Modell serialisieren
und in den Model Atlas publizieren; genau das macht dieser Wizard schon für die
Konfiguration. Die Kette schließt sich also im Browser, ohne Java-Aufruf.

**Was in `gene` dafür bereitsteht.** Der Sprachdienst läuft als **Web Worker**,
nicht als Server: `packages/transformation/src/workers/ocl-lsp-worker.ts` ist
ein Vier-Zeiler auf `@emfts/ocl.lsp.worker`, und
`useOclLanguageClient.ts:96` spricht JSON-RPC per `postMessage` dagegen
(`completion`, `hover`, `diagnostics`). Dasselbe Muster ein zweites Mal in
`packages/dmn-editor/src/composables/useFeelLanguageClient.ts` für FEEL — die
Vorlage ist also zweifach erprobt. Für QVT-O kommt ein dritter Client
derselben Bauart hinzu, plus der Editor aus `OclMonacoEditor.vue`.

**Was oben fehlt** (EMFTs/m2x, nicht `gene`):

| Baustein | Stand |
|---|---|
| `EMFTs/emfts-qvto` | existiert, v1.0.0 — aber als **Engine** („QVT Operational (imperative) transformation engine for EMFTs", `src/{api,runtime,decorators}`), ohne Parser |
| Langium-Grammatik | fehlt für QVT-O. Für QVT-**R** existiert eine: `EMFTs/emfts-qvtr/src/grammar/qvtr.langium` — die Vorlage |
| `qvto-lsp-worker` | fehlt; Vorbild `EMFTs/ocl-lsp-worker` |
| AST → `qvtoperational`-Modell | offen: die Grammatik muss den AST als EMF-Modell aufbauen, so wie `ocl-model` es für OCL tut. Das ist das eigentliche Stück Arbeit |

**Offene Frage für den Anfang:** Ob der Data Atlas den AST als eigenständiges
Dokument im Scope erwartet oder inline in der Konfiguration — `AstGen.java` und
`example/dataatlas-transformation.xmi` bzw. `tests/fixtures/dataatlas-trafo-atlas.xmi`
sagen es; das ist vor dem ersten Handgriff zu klären, weil davon abhängt, ob
der Publish-Flow aus Abschnitt 5 ein weiteres Objekt hochladen muss.

---

**Nebenbefunde, unabhängig von allem oben:** `data.atlas/README.md`,
`docs/README.md` und `CLAUDE.md` verlinken `docs/roadmap.md`; die Datei wurde
in Commit `6173a43` nach `DataInMotion/xdp` verschoben, die Links sind tot.
Ebenso ist `gene/ARCHITECTURE.md` (April 2026) veraltet: die Paketstruktur ist
inzwischen flach (`packages/ui-*`), und atlas-browser, storage-model-atlas,
dmn-editor, model-editing, die beiden Wizards, `ui-actions` und `ui-search`
fehlen dort. Beides bei Gelegenheit korrigieren — nicht Teil dieser Arbeit.
