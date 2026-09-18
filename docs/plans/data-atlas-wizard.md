# Data-Atlas-Konfigurations-Wizard in `gene`

> **Status:** Iteration 1 umgesetzt (Abschnitt 10, Schritte 1–13), danach auf
> Datenwege umgebaut — s. Änderung (3). Offen: die End-to-end-Verifikation aus
> Abschnitt 9 gegen den Compose-Setup und der nächste Schritt QVT-O
> (Abschnitt 11).
>
> **Änderung 2026-09-18 (@emfts/core 0.3.0-next.1):** Vier der fünf gemeldeten
> Abweichungen sind behoben, eine Annahme ist dadurch weggefallen:
>
> - **#85/#87**: einwertige Cross-Document-Referenzen stehen jetzt als
>   `href`-Kindelement mit `xsi:type` — wie in Java EMF. Damit deklariert der
>   Serializer das `ecore`-Präfix von selbst, die `writeNamespaces()`-
>   Überschreibung und `extraNamespaces` sind entfallen.
> - **#86**: `getEAnnotations()` sieht die geladenen Annotationen am EPackage;
>   der Umweg über `eGet` in `annotationsOf()` ist entfallen.
> - **#95**: gesetzte Attribute werden geschrieben, auch wenn sie dem
>   Vorgabewert entsprechen. Der Endpunkt trägt seine Pagination-Namen also
>   sichtbar; nicht gesetzte Features (`batchSize`) bleiben weiter weg.
> - **#84** bleibt offen: `getURIFragment()` ignoriert `iD="true"`, die
>   Überschreibung bleibt.
> - **Neu nötig**: der **Href-Dialekt**. Mit #80 haben EClassifier jetzt eine
>   Resource, und der Serializer schreibt den Verweis relativ zum Dokument
>   (`model/person.ecore#//Person`). Der Assistent erzwingt den nsURI über
>   `getHref()` — s. Abschnitt 4a, das ist die Rückkehr der Überschreibung,
>   die mit der FILE-Entfernung wegfiel.
> - **Stolperstelle im Fixup**: `eClassifiers` setzt seit 0.3 den Container,
>   das Einhängen nimmt den Classifier also aus der Quellliste. Wer über die
>   Live-Liste iteriert, überspringt jedes zweite Element — `wizardPackageFixup`
>   läuft jetzt über eine Kopie.
>
> **Änderung 2026-09-10 (3):** Die Einheit der Fassade ist die **Kette**
> (`DataChain`), nicht mehr die einzelne Liste. Ein Weg trägt seine Quelle
> (`source` containment **oder** `sharedSource` Referenz), seine `datasets`
> und seine `exports`; `AtlasSetup.chains*` ersetzt `dataSources`, `datasets`
> und `exports`, und `DatasetConfig.sourceId`/`exportIds` sind entfallen — die
> Zuordnung steckt in der Verschachtelung. Grund: sobald Ketten aufeinander
> aufbauen (Transformation, `BridgeRepository`), ist eine Konfiguration je
> Kette die einzige, die sich noch lesen lässt. Ob eine Kette eine neue Quelle
> anlegt oder eine bestehende mitbenutzt, überlässt der Assistent dem Nutzer.
>
> Die Schritte 3, 4 und 6 sind damit **ein** Schritt (`ChainsStep.vue`);
> `SourcesStep.vue`, `DatasetsStep.vue` und `ExportsStep.vue` sind entfallen.
> Der Ablauf ist: Modell → Instanz → Datenwege → Endpunkt → Zusammenfassung.
> Der Transformer flacht die Wege in die Register des Zielmodells aus: eine
> geteilte Quelle wird ein `DataInput` (mit den Klassen aller Wege, jede
> einmal), gleiche Formatvorlagen werden ein Eintrag, und `dataInput`/
> `distributionExport` stehen am Service, solange alle Wege einig sind, sonst
> an jedem Datensatz.
>
> **Änderung 2026-09-10 (2):** Aus dem einen Dateneingang ist eine **Liste**
> geworden, und der **Datensatz** trug die Zuordnung: `DatasetConfig.sourceId`
> (Pflicht) und `exportIds*`. Sind sich alle Datensätze einig, schreibt der
> Transformer den Wert einmal am Service statt n-mal — das
> override-else-default des Zielmodells, aber vom Datensatz her gedacht. Ein
> `defaultSourceId` am Setup gibt es deshalb nicht.
> Die Entweder-oder-Frage „woher kommen die Daten?" in Schritt 2 gab es nur,
> weil die Fassade genau einen Eingang kannte — mit einer Transformation sind
> es immer mindestens zwei (`BridgeRepository` liest einen anderen Eingang).
> `FileSourceConfig`/`DatabaseSourceConfig` sind zu `DataSourceConfig` mit
> `kind` verschmolzen, Schritt 3 wurde handgeschrieben (`SourcesStep.vue`)
> statt UIModel-getrieben. *Überholt durch Änderung (3): die Listen hängen
> jetzt an der Kette.*
>
> **Änderung 2026-09-10:** `configMode` und `modelFiles` sind entfallen.
> Verweise auf Modellklassen entstehen immer über den nsURI; relative
> Datei-Verweise sind eine Deployment-Konvention, die keine der drei
> beteiligten Anwendungen herstellen kann (gene hat kein Dateisystem, der
> Model Atlas liefert Objekte statt Pfade). Wer sie braucht, schreibt das XMI
> von Hand. Betrifft die Abschnitte 1, 2, 3, 4, 6 und 8.
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
| Trias (`dataInput`/`transformation`/`distributionExport`) auf Service- **und** DataSet-Ebene | am Service, solange alle Datenwege einig sind, sonst am DataSet | override-else-default rechnet der Transformer aus; einig ist der Normalfall und liest sich wie die Vorlagen (`tests/fixtures/dataatlas-servicedefault.xmi`) |
| n `DataInput`s | n — **einer je Datenweg**, geteilte Quellen fallen zusammen | eine Transformation liest immer einen zweiten Eingang; die Kette ist die Einheit |
| `transformation` | nicht abgebildet | Iteration 2a, Abschnitt 11 |
| `DataSet.inputType ≠ outputType` | `inputType = outputType` | Abweichung braucht eine Transformation → spätere Iteration |
| `childDataSet`/`parentDataSet`, `query` | nicht abgebildet | spätere Iteration |
| `DistributionExport` frei | Enum `ExportKind` | vier real sinnvolle Kombinationen |

### Klassen

**`AtlasSetup`** (Root)

| Feature | Typ | Kard./Default | Entscheidung des Nutzers |
|---|---|---|---|
| `instanceName` | EString | 1 | Name der Data-Atlas-Instanz → `DataAtlasConfiguration.name` |
| `instanceDescription` | EString | | Beschreibung |
| `modelPackage` | `Ecore#//EPackage` | 1 | das Domänen-Modell |
| `chains` | `DataChain` | 0..* containment | die Datenwege |
| `serviceId`, `serviceName`, `serviceDescription` | EString | 1 | Identität des REST-Endpunkts |
| `urlContext` | EString | 1 | Basis-Pfad, z. B. `/example` |
| `openApi` | EBoolean | 1, `false` | OpenAPI-Beschreibung ausliefern |
| `paginationOffsetParameterName` | EString | 1, `offset` | Query-Parameter-Namen |
| `paginationSizeParameterName` | EString | 1, `limit` | |

**`DataChain`** — die Einheit der Fassade: eine Quelle, die Klassen, die
daraus veröffentlicht werden, und die Formate dafür.

| Feature | Typ | Kard./Default | Bedeutung |
|---|---|---|---|
| `id` | EString | 1 | benennt den Weg in der Oberfläche und in den Meldungen |
| `source` | `DataSourceConfig` | 0..1 containment | die **eigene** Quelle |
| `sharedSource` | `DataSourceConfig` | 0..1 Referenz | die Quelle eines **anderen** Wegs mitbenutzen |
| `datasets` | `DatasetConfig` | 0..* containment | welche Klassen werden Datensätze |
| `exports` | `ExportConfig` | 0..* containment | welche Formate |

`source` **xor** `sharedSource` — beides gesetzt ist ein harter Fehler, keines
auch. Kein `inputKindRef` und keine Zwischen-id: die Zuordnung steckt in der
Verschachtelung, und damit kann sie nicht ins Leere zeigen. Wird ein Weg
entfernt, erbt der erste Mitbenutzer die Quelle, die übrigen teilen sich
seine (`removeChain` in `context.ts`).

**`DataSourceConfig`** — `inputKind` + flache Felder statt abstrakter
Subklassen, weil `visibilityCondition language="JS"` im UIModel damit direkt
funktioniert und der handgeschriebene Schritt es ebenso einfach hat.

| Feature | Typ | Kard./Default | Bedeutung |
|---|---|---|---|
| `id` | EString | 1 | wird die id des `DataInput` |
| `kind` | `InputKind` | 1, `FILE` | XMI-Datei oder Datenbank |
| `fileUri` | EString | | bei `FILE`: **absoluter** Pfad (`/opt/dataatlas/runtime/data/data/persons.xmi`); die Validierung erzwingt das |
| `dataSourceId`, `dataSourceName` | EString | | bei `DATABASE`: die `JdbcDataSource` |
| `dataSourceFilter` | EString | | LDAP-Filter, z. B. `(dataSourceName=personsDs)` |
| `mappingKind` | `MappingKind` | 1, `DERIVED` | JPA-Mapping ableiten lassen oder importieren |
| `eormXmi` | EString | | das importierte `EntityMappings`-Dokument als Rohtext (s. Abschnitt 3) |

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

`InputKind { FILE, DATABASE }` · `MappingKind { DERIVED, IMPORTED }` ·
`ExportKind { JSON, XML, CSV, CSV_ZIP }`

`ExportKind` → Ziel: `JSON`/`XML` als plain `DistributionExport` mit
`mediaType`, `CSV`/`CSV_ZIP` als `CSVDistributionExport`
(`compressed="true"` beim ZIP).

`model/data-atlas-wizard.genconfig.xmi` analog zu
`packages/eorm-wizard/model/eorm-wizard.genconfig.xmi`
(`ecorePackage` = nsURI + `#/`, `generation mode="emf" outputDir="src/generated"`).
Generierten Code **einchecken**; `src/emf/wizardPackageFixup.ts` trägt die
EEnums als Classifier und die fehlenden EAttribut-Typen nach — gelesen aus
derselben `.ecore`, aus der der Generator kommt, damit eine Modelländerung
keine Tabelle nachzuziehen verlangt (emf.ts#83).

## 2. Ableitungsregeln (`src/wizard/context.ts`)

Aus dem gewählten `EPackage`:

- `instanceName` = `pkg.getName()`; `slug` = kebab-case davon.
  `instanceDescription` = GenModel-`documentation` des Packages. Die ist nur
  über `eGet` zu bekommen — der typisierte `getEAnnotations()` sieht am
  EPackage nichts (emf.ts#86); `annotationsOf()` in `context.ts` geht beide
  Wege.
- je **konkreter** EClass (nicht abstrakt/Interface) ein `DatasetConfig`:
  `id` = lowerCamel(EClass-Name), `name` = Title Case, `path` = `id`,
  `description` = GenModel-`documentation`-Annotation der EClass, sonst
  `Alle <Name>-Objekte.` — dieselbe Annotation, die der Data Atlas
  serverseitig für DCAT-Beschreibungen heranzieht.
  **Nicht pluralisiert:** Die handgeschriebenen Vorlagen nennen den Datensatz
  einer EClass `Person` „Persons" mit id `persons`; eine Pluralregel für
  beliebige Modellnamen wäre geraten. Abgeleitet wird `person`/`Person`, in der
  Oberfläche mit einem Klick zu ändern — die Golden-Tests aus Abschnitt 8
  setzen id, name und path deshalb selbst, statt sich auf die Vorschläge zu
  verlassen.
- `serviceId` = `${slug}-rest`, `serviceName` = `${instanceName} REST`,
  `urlContext` = `/${slug}`.
- **ein** Datenweg `chains[0]` mit `id` = `slug`, einer eigenen Datei-Quelle
  `${slug}-file` auf `/opt/dataatlas/runtime/data/data/${pkg.getName()}.xmi`
  und einem `DatasetConfig` je konkreter Klasse, alle ausgewählt.
- Eine Datenbank-Quelle entsteht erst auf Wunsch (`buildDatabaseSource`):
  `id` = `${slug}-jpa` (so heißt der JPADataInput in
  `example/dataatlas-postgres.xmi`), `dataSourceId` = `${slug}-db`,
  `dataSourceName` = Title Case + „ DB", `dataSourceFilter` =
  `(dataSourceName=${lowerCamel(slug)}Ds)`.
- Ein **weiterer** Weg bekommt die Klassen des Modells als Vorschlag, aber
  **nichts angehakt**: welche Klassen aus dieser Quelle kommen, weiß nur der
  Nutzer. Statt einer eigenen Quelle kann er die eines anderen Wegs
  mitbenutzen.
- `exports` bleibt leer → Runtime-Defaults JSON + XML.
- `supportedEClasses` des Inputs = die EClasses aller *selektierten* Datasets
  **aller Wege, die aus ihm lesen** — jede einmal (wird erst im Transformer
  eingesetzt, nicht im Setup gespeichert).

Zustandsmuster wie in den Vorbildern: `shallowRef` + `version = ref(0)` +
`touch()`; jedes `computed` beginnt mit `void version.value;`.

## 3. Schrittfolge

Die beiden Quell-Tabs melden ein **Objekt** (`ModelSourcePayload`) statt
mehrerer Argumente: der Assistent braucht neben den Kandidaten auch alle
nachgeladenen Packages, weil ein Modell weitere nachziehen kann und die
Auswahl sonst unvollständig aufgelöst würde.

| # | Schritt | Art | `blockReason` |
|---|---|---|---|
| 1 | **Modell** — Atlas-Tab (Verbindung/Suche/Cascade-Load) oder Upload-Tab | handgeschrieben, aus `eorm-wizard` kopiert (`ModelSourceStep.vue`, `AtlasSourceTab.vue`, `UploadSourceTab.vue`) | kein EPackage gewählt |
| 2 | **Instanz** — `instanceName`, `instanceDescription` | UIModel `src/assets/wizard-ui/step-instance.xmi` | `instanceName` leer |
| 3 | **Datenwege** — je Weg: id, Quelle (eigene Datei/Datenbank oder eine fremde mitbenutzen), Datensatz-Tabelle, Formate mit CSV-Optionen | handgeschrieben `ChainsStep.vue` | kein Weg; Weg ohne Quelle; kein Datensatz gewählt; doppelte `id`/`path`; `IMPORTED` ohne Mapping; relative `fileUri` |
| 4 | **Endpunkt** — `serviceId`, `serviceName`, `serviceDescription`, `urlContext`, `openApi`, Pagination-Parameter | UIModel `step-service.xmi` | `urlContext` oder `serviceId`/`serviceName` leer |
| 5 | **Zusammenfassung** — Prüfliste, XMI-Vorschau, Download, Publish-Panel | handgeschrieben `SummaryStep.vue` | — |

Die Formate stehen bewusst **im** Weg und nicht in einem eigenen Schritt: sie
gehören zu den Datensätzen, die daneben in derselben Karte stehen. Ein
Format-Schritt am Ende hätte wieder die Frage aufgeworfen, auf welchen der
Wege er sich bezieht.

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

**a) Href über den nsURI** — `getHref()` überschreiben.
Bis `@emfts/core` 0.2 ergab sich der nsURI-Href von selbst, weil EClassifier
kein `eResource()` hatten (emf.ts#80). Seit 0.3 haben sie eins, und der
Serializer schreibt — wie Java EMF — einen gegen das Dokument aufgelösten
Verweis (`model/person.ecore#//Person`). Für eine Datei neben dem Modell ist
das richtig, für eine Konfiguration, die über HTTP aus dem Model Atlas kommt,
nicht: sie hat keinen Bezugspunkt. Die Überschreibung liefert deshalb für
EClassifier `nsURI#//Name` und für EStructuralFeature
`nsURI#//Klasse/Feature`; alles andere bleibt beim Serializer.

**b) ID-Fragmente** — `class DataAtlasResource extends XMIResource`,
`getURIFragment()` überschrieben: Wert des `iD="true"`-Attributs, sonst
`super`. emf.ts wertet `iD="true"` beim Speichern nicht aus (emf.ts#84); ohne die
Überschreibung entsteht `dataInput="/0/0"` statt `dataInput="persons-file"`.
Der Weg über `resource.setID()` wirkt auch, schreibt aber zusätzlich ein
`xmi:id`, das die Vorlagen nicht haben.

**c) Fehlende Namespace-Deklaration** — mit `@emfts/core` 0.3 **entfallen**.
Einwertige Cross-Document-Referenzen stehen jetzt als `href`-Kindelement mit
`xsi:type` (emf.ts#85), nicht mehr als Attributwert mit Typpräfix; damit zählt
der Serializer das `ecore`-Präfix selbst mit und deklariert es (emf.ts#87).

Das gilt auch für **Features**: ein eingebettetes eorm-Mapping verweist auf
`…#//Person/firstName`, und auch dort entsteht der nsURI-Href von selbst —
nur das Präfix muss deklariert werden, s. c).

### Was der Wizard weiter selbst prüft

Die Validierung gehört vor das Serialisieren, nicht in den Serializer.

- **Harte Fehler** (throw, im UI in einem `computed` gefangen): kein EPackage,
  kein Datenweg, kein selektierter Datensatz, leeres Pflichtfeld, ein Weg ohne
  Quelle oder mit eigener **und** geteilter, eine geteilte Quelle ohne
  Besitzer, `IMPORTED` ohne gültiges Mapping, relative `fileUri`, doppelte
  ids, und bei einer Datenbank Klassen aus mehreren Packages — über alle Wege
  gezählt, die sich diese Datenbank teilen. `name` und `description` sind an
  `DataProvider` und `DistributionExport` `lowerBound=1` — leer ist also ein
  harter Fehler, keine Warnung.
- **Warnungen**: CSV gewählt ohne JSON/XML (≥ 1 Export ersetzt die
  Runtime-Defaults **vollständig**, alles andere wird `406`); `DERIVED` bei
  JPA (Namens-Asymmetrie); `batchSizeLimit < batchSize`.

`RestDataServiceConfiguration.id` wird vollständig abgeleitet
(`<dataSetId>-config`) und nicht abgefragt: der Wert bedeutet fachlich nichts.
Die Vorlagen sind darin uneinig — die Ein-Datensatz-Beispiele schreiben
`<serviceId>-config` (`persons-rest-config`), das Mehr-Datensatz-Beispiel
`<dataSetId>-config` (`persons-csv-only-config`). Nur letzteres bleibt bei
mehreren Datensätzen eindeutig; im Golden-Vergleich bleibt dieses Feld deshalb
außen vor und wird eigens geprüft.

`path` wird **immer** geschrieben, obwohl es einen Default hat: greift der
nicht, gilt der **Name** des Datensatzes (`tests/fixtures/dataatlas-servicedefault.xmi`),
und der ist bei uns Title Case — als URL-Segment nicht gewollt.

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

**Wiederholt wird nur bei 5xx.** Ein 403 auf einer read-only Stage wird nicht
besser; zehn Versuche à drei Sekunden wären dort nur Wartezeit. `publish.ts`
prüft deshalb auf `HTTP 5xx` bzw. „de-serializing" im Fehlertext.

**Den Quelltext der Domänenmodelle** liefert die Resource, aus der sie geladen
wurden (`resource.saveToString()`, `requiredSchemas.ts`) — auch bei einem
Upload, wo die Datei selbst nicht aufbewahrt wird. Fehlt sie, bricht es mit
einer Aussage darüber ab, statt etwas Falsches hochzuladen.

**Die Ziel-Stage des Wechsels** ist die *nächste* Stage der gewählten Registry,
abgelesen aus `getScope` — nicht der feste Name „release".

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
├── src/assets/wizard-ui/step-{instance,service}.xmi
├── src/emf/{setup.ts,wizardPackageFixup.ts}
├── src/wizard/{WizardShell.vue,context.ts,uiModels.ts,
│              ModelSourceStep.vue,AtlasSourceTab.vue,UploadSourceTab.vue,
│              ChainsStep.vue,SummaryStep.vue}
├── src/transform/toDataAtlasConfig.ts Wege → Zielmodell → saveToString()
├── src/transform/{validate.ts,requiredSchemas.ts}
├── src/transform/dataAtlasResource.ts XMISave/XMIResource-Unterklassen:
│                                     Namespaces + iD-Fragmente
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
  trägt beides zur Laufzeit nach. Ohne den Fixup wird aus `openApi = true` beim
  Round-Trip der String `"true"` und aus `batchSize = 500` der String `"500"`.
  Anders als die Vorlagen in den beiden anderen Wizards pflegt der Fixup
  **keine Tabelle**, sondern liest die Typen aus derselben `.ecore`, aus der
  der Generator kommt — eine Modelländerung ist damit automatisch gedeckt.
- **Enums: der Loader liefert `EEnumLiteral`, der generierte Typ verspricht
  einen String** (Kommentar an emf.ts#83). Geschrieben wird der Name richtig;
  `quelle.kind === InputKind.FILE` ist nach einem Round-Trip aber immer falsch
  (`test/setup.test.ts` nagelt das fest).
  In Iteration 1 ohne Folgen, weil die Fassade nur in der Oberfläche entsteht —
  wer sie speichern und zurücklesen will, braucht eine Normalisierung.
- **emf.ts wertet `iD="true"` beim Speichern nicht aus** (emf.ts#84) →
  `getURIFragment()` überschreiben, sonst stehen Pfadfragmente (`/0/0`) statt
  der ids in den Referenzattributen. Betrifft nur das Schreiben; beim Laden löst
  `XMLHandler.resolveReference()` ID-Referenzen auf.
- **EClassifier haben in emf.ts kein `eResource()`** (emf.ts#80) → der
  nsURI-Href entsteht dadurch von selbst; ein relativer Datei-Href wäre nur
  über eine eigene Karte zu bekommen, und die gibt es nicht mehr.
- **Einwertige Cross-Document-Referenzen schreibt emf.ts als Attribut**, nicht
  als `href`-Element (emf.ts#85, `XMLSave.js:318` gegen `writeElements`
  Z. 711) — gegen den Java-Data-Atlas zu verifizieren, s. Abschnitt 4. Im
  eingebetteten eorm-Mapping heißt das
  `feature="ecore:EAttribute https://…/person/1.0.0#//Person/id"` statt
  `<feature href="…"/>`.
- **Typpräfixe in Attributwerten bleiben undeklariert** (emf.ts#87) →
  `writeNamespaces()` erweitern, sonst fehlt `xmlns:ecore` im Kopf.
- **Das ResourceSet braucht die Endung `eorm`**: ein importiertes Mapping ist
  XMI, trägt aber diese Endung. Ohne den Eintrag im
  `ExtensionToFactoryMap` kommt eine Resource ohne `loadFromString` zurück,
  und der Import scheitert mit „is not a function" statt mit einer Aussage
  über das Dokument.
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
- **Der Kandidaten-Filter im `ModelSourceStep` der Vorlage wirft zu viel weg**:
  `nsURI.includes('/atlas/')` soll die Atlas-API-Metamodelle ausschließen,
  trifft aber genau die Modelle dieses Assistenten
  (`https://eclipse.org/fennec/data/atlas/example/person/1.0.0`). Geprüft wird
  deshalb der Präfix `http://eclipse.org/fennec/model/atlas/`.


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
und der `xsi:type`-Attribute, damit sie sichtbar festgenagelt sind.

| Datei | prüft |
|---|---|
| `test/toDataAtlasConfig.test.ts` | Graphgleichheit gegen `dataatlas-atlas.xmi`, **`dataatlas-postgres-atlas.xmi`** (JPA + CSV/JSON), `dataatlas-pagination.xmi` (nur die Endpunkte), `dataatlas-csv.xmi` (nur der `<exports>`-Block). Dazu **mehrere Datenwege**: jede Quelle ein `DataInput`, eine geteilte Quelle genau einer (mit den Klassen beider Wege, jede einmal), gleiche Formate ein Eintrag, und die Trias am Service nur, solange die Wege einig sind. Und der **Round-Trip**: erzeugtes XMI in ein ResourceSet laden, in dem `configuration.ecore`/`eorm.ecore` registriert sind und `person.ecore` unter der URI `model/person.ecore` liegt; geprüft werden `services[0].dataInput`, `configuration[0].dataSet` und `distributionExport` als **Objekte**. Bekanntes Rauschen: `configuration.ecore` verweist auf die nicht mitgelieferten Packages `query`, `eorm` und `qvtoperational` → „Forward ref UNRESOLVED" für `DataSet.query`, `JPADataInput.persistenceConfig` und `DataTransformation.transformation`; bewusst ignorieren, Iteration 1 emittiert nur `persistenceConfig` und lädt `eorm.ecore` dafür mit |
| `test/dataAtlasResource.test.ts` | die zwei Überschreibungen einzeln: `writeNamespaces()` deklariert das Ecore-Präfix nur bei eingebettetem Mapping; `getURIFragment()` liefert den `iD`-Wert und schreibt **kein** `xmi:id` |
| `test/persistenceConfig.test.ts` | das importierte `EntityMappings` landet als `persistenceConfig`-Containment, die inneren Hrefs entstehen über den nsURI; Zielbild `dataatlas-history-atlas.xmi` |
| `test/context.test.ts` | Ableitungsregeln: ids, `path`, `description` aus GenModel-`documentation`, absolute `fileUri`, und die Wege-Operationen (`addChain` nummeriert, `shareSource`/`ownSource`, `removeChain` vererbt die Quelle) |
| `test/validation.test.ts` | jede harte Regel und jede Warnung aus Abschnitt 4 einmal, dazu die Grundannahme: was `initSetup` liefert, ist ohne Zutun schreibbar |
| `test/wizardUi.test.ts` | jedes `feature=`-Href der Schritt-XMIs löst auf und findet eine Registry-Komponente (fängt Umbenennungen im Fassadenmodell und den Codegen-Bug) |
| `test/facade.test.ts` | Namen, Kardinalitäten und Vorgaben des Fassadenmodells — die Namen tauchen in den Schritt-XMIs, im Fixup und im Transformer wieder auf, ohne dass der Compiler sie verbindet |
| `test/stepsWiring.test.ts` | die Kette Klick → Fassadenmodell → `touch()` in den handgeschriebenen Schritten, samt Wege-Bedienung (zweiter Weg, Quelle mitbenutzen, letzten Weg nicht entfernbar). Braucht `// @vitest-environment jsdom` in der ersten Zeile, weil das Paket sonst auf `node` steht. Genau diese Verdrahtung war in gene schon mehrfach kaputt, ohne dass ein Unit-Test es sah |
| `test/publish.test.ts` | gegen einen Stellvertreter: Reihenfolge eorm→configuration→Domäne in **beiden** Stages, Retry auf 5xx und **keiner** auf 4xx, Abbruch bei fehlendem Schema, Fortschrittsmeldungen, `requiredSchemas` samt Fehlerfall |
| `test/publishHttp.test.ts` | derselbe Flow durch den **echten** Client gegen einen HTTP-Server im Test: Pfade, Query-Parameter, Content-Types (`application/xml` fürs Schema, `application/xmi` für Objekt und Transition) und der `StageTransitionRequest`-Rumpf. Genau daran scheitert es gegen den echten Atlas, und ein Stellvertreter merkt es nie |
| `test/pluginIntegration.test.ts` | `startupModules` in **beiden** Listen, Manifest-Angaben, und dass `activate()` Perspektive, Panel, Activity und den Opener registriert |


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
7. `npm run test:unit` (alle vitest-Projekte) und `npm run type-check`.

**Ohne Docker so weit gekommen** (Stand 2026-09-10): Schritte 1 und 5 brauchen
den Compose-Setup und sind offen. Alles andere ist abgedeckt —
`test/publishHttp.test.ts` fährt den Publish-Flow durch den echten Client
gegen einen HTTP-Server im Test, `npm run mock:atlas` stellt für den
Handbetrieb einen Scope „jena" mit Registry `configurations` und den Stages
draft/release bereit. Was der Mock nicht kann: prüfen, ob der **Java**-Atlas
die Dokumente annimmt — insbesondere die einwertigen Cross-Document-Referenzen
als Attribut (emf.ts#85).

## 10. Umsetzungsreihenfolge

| Schritt | fertig, wenn |
|---|---|
| 1. Paketgerüst | `packages/data-atlas-wizard` mit `package.json`, `manifest.json`, `vitest.config.ts`, Standalone-`main.ts`; `npm run dev` zeigt eine leere Shell |
| 2. Fassadenmodell + Codegen | `model/data-atlas-wizard.ecore` + genconfig, `npm run generate` erzeugt `src/generated`, eingecheckt |
| 3. EMF-Setup | `setup.ts` + `wizardPackageFixup.ts`; ein Smoke-Test registriert Fassade, `configuration.ecore` und `eorm.ecore` ohne Fehler, und der Round-Trip behält Wahrheitswerte und Zahlen (Gegenprobe: ohne Fixup fällt er um) |
| 4. Ableitungsregeln | `context.ts` + `test/context.test.ts` grün |
| 5. Serializer-Unterklassen | `dataAtlasResource.ts` + `test/dataAtlasResource.test.ts` grün: nsURI-Href, Namespace-Deklaration nur bei eingebettetem Mapping, `iD`-Fragment ohne `xmi:id` |
| 6. Transformer Grundfall | `test/toDataAtlasConfig.test.ts` grün gegen `dataatlas-atlas.xmi` — Graphgleichheit plus Href-Vergleich, nicht zeichenweise (Abschnitt 8); der Round-Trip löst alle Referenzen zu Objekten auf |
| 7. Transformer JPA | `dataatlas-postgres-atlas.xmi` reproduziert; `persistenceConfig.test.ts` grün |
| 8. UI-Schritte | alle fünf Schritte durchklickbar, `blockReason` je Schritt greift, `wizardUi.test.ts` und `stepsWiring.test.ts` grün |
| 9. Download | XMI-Datei landet im Browser-Download, Vorschau im Summary |
| 10. Publish | `publish.ts` + `test/publish.test.ts` grün; das Panel im Summary lädt hoch und schiebt weiter (Verdrahtungstest gegen einen Stellvertreter). Der Lauf gegen `mock-atlas.mjs` bzw. den echten Atlas gehört zu Schritt 12 |
| 11. Plugin-Integration | `startupModules`-Eintrag in **beiden** Listen, `build:plugin` läuft ohne Externals-Warnung (572 kB, davon 279 kB die beiden eingebetteten Metamodelle), `pluginIntegration.test.ts` grün |
| 12. End-to-end | Verifikation aus Abschnitt 9 durchlaufen — Schritte 1 und 5 brauchen den Compose-Setup |
| 13. Doku | `packages/data-atlas-wizard/README.md`; der Absatz für `data.atlas/docs/user-guide.md` ist vorbereitet, aber nicht eingetragen (fremdes Repo) |

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

### Die offene Frage ist beantwortet (2026-09-10)

Weder inline noch als Objekt im Scope: der AST ist ein **eigenes Dokument**,
auf das die Konfiguration per URI verweist.

| Modus | Verweis |
|---|---|
| `FILE` | `<transformation href="trafo/person-to-public.xmi#//@unit"/>` |
| `ATLAS` | `<transformation href="file:///DATA/trafo/person-to-public-atlas.xmi#//@unit"/>` |

Im Atlas-Modus also eine **absolute Datei-URI**, die die Runtime lokal auflöst
— „like every FileDataInput in this mode" (Kommentar in
`tests/fixtures/dataatlas-trafo-atlas.xmi`). Der Publish-Flow lädt somit
**kein** weiteres Objekt hoch; das AST-Dokument liegt beim Deployment. Die
Modell-Doku an `DataTransformation` spricht von einem „dedicated EObject
registry of the scope" — das ist die Absicht, die Fixtures zeigen den heutigen
Stand.

### Was im AST-Dokument steckt

Es ist kein nackter `OperationalTransformation`, sondern eine **`CompiledUnit`**
(`http://www.eclipse.org/fennec/m2x/compiled/1.0`) mit

- einem `manifest`: `producedBy="org.eclipse.fennec.m2x.unit"`, `language="qvto"`,
  `qualifiedName`, **`unitFingerprint`** und **`sourceFingerprint`**
  (`m2x1:<sha256>`), `dependencyMode="pin"`, dazu je benutztes Package ein
  `packageEntry` mit eigenem `fingerprint` (`fp1:<sha256>`) und
  `role="embedded"`,
- dem `unit` — darauf zeigt das Fragment `#//@unit`,
- `satellite`-Einträgen mit den eingebetteten Package-Kopien.

Erzeugt wird das von `engine.compile(source, name)` im Java-Bundle
`org.eclipse.fennec.m2x.unit` (`example/trafo/AstGen.java`), und zwar
**zweimal**: einmal mit datei-relativen, einmal mit nsURI-basierten Verweisen —
derselbe Dialekt-Unterschied wie bei der Konfiguration selbst.

**Das vergrößert den LSP-Schritt.** Eine Langium-Grammatik, die den AST
aufbaut, reicht nicht: `dependencyMode="pin"` heißt, dass die Fingerprints
stimmen müssen. Ein Browser-Erzeuger müsste das Fingerprint-Schema (`m2x1:`,
`fp1:`) mitliefern, sonst nimmt die Runtime das Dokument nicht an — oder löst
gegen die falsche Package-Version auf.

### Daraus zwei Iterationen statt einer

**2a — ein bestehendes AST-Dokument referenzieren.** Braucht nichts von oben
und ist genau das, was die Runtime heute konsumiert: Der Assistent fragt Pfad
bzw. URI des `CompiledUnit`-Dokuments, Quell- und Ergebnisklasse, und erzeugt
daraus den `<transformations>`-Eintrag, ein `BridgeRepository` als Dateneingang
(`source` = der ursprüngliche Input, `dataTrafo` = die Transformation) und
Datensätze auf der **Ergebnisklasse**. Vorbild:
`example/dataatlas-transformation.xmi`.

Verifiziert (2026-09-10), dass das **ohne** die m2x-Metamodelle geht: ein
DynamicEObject mit `eSetProxyURI('trafo/x.xmi#//@unit')` genügt, `XMLSave`
schreibt den Verweis aus der Proxy-URI. Lädt man das Dokument zusätzlich hoch,
kann der Assistent aus dem `manifest` sogar prüfen, ob die gepinnten Packages
zum geladenen Modell passen.

**2b — QVT-O im Browser verfassen.** Sprachdienst als Web Worker, wie bei OCL
und FEEL, plus die Erzeugung der `CompiledUnit` samt Manifest und
Fingerprints. Das ist der große Teil und liegt in EMFTs/m2x.

---

**Nebenbefunde, unabhängig von allem oben:** `data.atlas/README.md`,
`docs/README.md` und `CLAUDE.md` verlinken `docs/roadmap.md`; die Datei wurde
in Commit `6173a43` nach `DataInMotion/xdp` verschoben, die Links sind tot.
Ebenso ist `gene/ARCHITECTURE.md` (April 2026) veraltet: die Paketstruktur ist
inzwischen flach (`packages/ui-*`), und atlas-browser, storage-model-atlas,
dmn-editor, model-editing, die beiden Wizards, `ui-actions` und `ui-search`
fehlen dort. Beides bei Gelegenheit korrigieren — nicht Teil dieser Arbeit.
