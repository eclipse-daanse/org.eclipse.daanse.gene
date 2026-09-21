# data-atlas-wizard

Web-Assistent, der aus einem **Domänenmodell** eine **DataAtlasConfiguration**
erzeugt — die vollständige Beschreibung einer Data-Atlas-Instanz (Metamodell
`configuration.ecore`, nsURI
`https://eclipse.org/fennec/data/atlas/configuration/1.0.0` aus
[`data.atlas`](../../../data.atlas)).

Diese XMI entstand bisher von Hand, mit reichlich Fallstricken: nsURI- gegen
relative Hrefs je nach Ablageort, `xsi:type` bei abstrakten Features,
ID-Referenzen als bloße Strings, die override-else-default-Trias und die Regel
„ein einziger Export ersetzt die Vorgaben vollständig". Genau das macht dieser
Assistent in Fachsprache: **welches Modell, je Datenweg woher die Daten und
welche Klassen, und je Endpunkt, wer davon wie ausgeliefert wird.**

## Ablauf

| Schritt | Inhalt |
|---|---|
| Modell | Domänenmodell aus einem Model-Atlas-Scope oder als Datei laden |
| Instanz | Name und Beschreibung |
| Datenwege | Beliebig viele Ketten, jede mit **einer** Quelle, **ihren** Datensätzen und **ihren** Formaten |
| Endpunkte | Beliebig viele Dienste; je Endpunkt Art, Basis-Pfad und welche Datenwege er veröffentlicht |
| Zusammenfassung | Prüfliste, XMI-Vorschau, Download oder Veröffentlichen im Model Atlas |

### Ein Datenweg ist die Einheit

Quelle, Datensätze und Formate gehören zusammen — die Zuordnung steckt in der
Verschachtelung, nicht in ids, die aufeinander zeigen. Ein Weg hat entweder
eine **eigene** Quelle (XMI-Datei mit absolutem Pfad oder Datenbank mit
DataSource-Filter und Mapping abgeleitet/importiert) oder benutzt die eines
anderen Wegs **mit** (`sharedSource`). Das ist die Wahl des Nutzers: bestehende
auswählen oder neu anlegen.

## Verweise entstehen immer über den nsURI

```xml
<supportedEClasses href="https://eclipse.org/fennec/data/atlas/example/person/1.0.0#//Person"/>
```

Relative Datei-Verweise (`model/person.ecore#//Person`) kennt der Assistent
nicht. Sie sind eine Deployment-Konvention, die keine der beteiligten
Anwendungen herstellen kann: gene hat kein Dateisystem, der Model Atlas
liefert Objekte statt Pfade. Wer sie wirklich braucht, schreibt das XMI von
Hand.

Aus dem gleichen Grund muss der Pfad der Datendatei **absolut** sein
(`/opt/dataatlas/runtime/data/…`) — die Konfiguration kommt über HTTP und
hätte für einen relativen Pfad keinen Bezugspunkt.

## Erzeugt wird über EMF, nicht über Textbausteine

Anders als die beiden Geschwister-Assistenten
([eorm](../eorm-wizard), [sensinact](../sensinact-mapping-wizard)) baut dieser
Wizard das **Zielmodell** und lässt `saveToString()` schreiben. Escaping,
Namespaces, `xsi:type`, Elementreihenfolge und die Referenzformate macht damit
der Serializer.

Von Hand bleiben zwei Überschreibungen in `src/transform/dataAtlasResource.ts`:

| Was | Warum | Ticket |
|---|---|---|
| `getURIFragment()` | `iD="true"` wird beim Speichern nicht ausgewertet — sonst stünde `dataInput="/0/0"` in der Datei | [emf.ts#84](https://github.com/eclipse-fennec/emf.ts/issues/84), offen |
| `getHref()` | Verweise auf Modellklassen müssen den nsURI tragen, nicht einen Pfad relativ zum Dokument | Absicht, kein Fehler |

Der Href-Dialekt war bis `@emfts/core` 0.2 geschenkt: EClassifier hatten kein
`eResource()` ([emf.ts#80](https://github.com/eclipse-fennec/emf.ts/issues/80)),
also blieb nur der nsURI. Seit 0.3 haben sie eins, und der Serializer schreibt
— wie Java EMF — einen Verweis relativ zum Dokument
(`model/person.ecore#//Person`). Für eine Datei neben dem Modell ist das
richtig; diese Konfiguration kommt aber über HTTP aus dem Model Atlas und hätte
dafür keinen Bezugspunkt. Deshalb erzwingt der Assistent den nsURI.

Entfallen mit 0.3: die `writeNamespaces()`-Überschreibung
([emf.ts#87](https://github.com/eclipse-fennec/emf.ts/issues/87)) — einwertige
Cross-Document-Referenzen stehen jetzt als `href`-Kindelement mit `xsi:type`
([emf.ts#85](https://github.com/eclipse-fennec/emf.ts/issues/85)), womit das
Präfix von selbst deklariert wird — und der Umweg über `eGet` für die
Annotationen eines geladenen EPackage
([emf.ts#86](https://github.com/eclipse-fennec/emf.ts/issues/86)).

Ebenso trägt `src/emf/wizardPackageFixup.ts` nach, was `emfts-codegen`
ausgelassen hat ([emf.ts#83](https://github.com/eclipse-fennec/emf.ts/issues/83)):
Attribut-Typen und die EEnums als Classifier. Ohne das käme aus einem
Round-Trip der String `"true"` statt eines Wahrheitswerts zurück. Die Typen
liest der Fixup aus derselben `.ecore`, aus der auch der Generator kommt — eine
Modelländerung ist damit gedeckt, ohne eine Tabelle nachzuziehen.

## Die Art des Endpunkts bestimmt seine Felder

Das Zielmodell kennt acht Dienstarten, und sie unterscheiden sich deutlich —
der Assistent zeigt je Art nur, was es dort gibt:

| Art | am Dienst | je Datensatz |
|---|---|---|
| REST | `openAPI`, Pagination | `path`, `batchSize`, `batchSizeLimit` |
| GeoJSON | Pagination | `path`, Batch-Grenzen, Feature-Namen für Länge/Breite/Höhe/Geometrie/id |
| XMLA | — | `mapping` (eine EClass, Pflicht) |
| QGis | — | `layer` (eine EClass, Pflicht) |
| GraphQL, OData | — | nur die Zuordnung zum Datensatz |
| OGC Features, OGC SensorThings | — | **keine** Konfiguration je Datensatz |

Was ein Dienst über einen einzelnen Datensatz sagt, hängt deshalb am
**Endpunkt-Eintrag**, nicht am Datensatz: derselbe Datensatz kann in zwei
Endpunkten unter verschiedenen Pfaden stehen — so führt es auch das Zielmodell
(`DataServiceConfiguration`).

Welche Wege ein Endpunkt veröffentlicht, wählt man an ihm; keine Auswahl heißt
alle.

## Der Datenweg trägt die Zuordnung

Das Zielmodell führt **Register** (`dataInputs`, `dataSets`, `exports`), in
denen alles einmal steht und mehrfach referenziert wird. Der Transformer
flacht die Wege dorthin aus:

- eine geteilte Quelle wird **ein** `DataInput`, seine `supportedEClasses`
  sammeln die Klassen aller Wege, die aus ihr lesen — jede einmal
- gleiche Formatvorlagen aus mehreren Wegen werden **ein** Eintrag
- `dataInput` und `distributionExport` stehen am Service, solange **seine**
  Wege einig sind, sonst an jedem Datensatz (override-else-default)

Damit ist der Weg die Wahrheit und der Service nur die Abkürzung.

## Ableitungsregeln

Aus dem gewählten EPackage (`src/wizard/context.ts`):

- `instanceName` = Paketname, `slug` = kebab-case davon
- je **konkreter** Klasse ein Datensatz: `id` = lowerCamel, `name` = Title
  Case, `path` = `id`, Beschreibung aus der GenModel-Annotation
- ein REST-Endpunkt `<slug>-rest` mit `urlContext` = `/<slug>`, der alle Wege
  veröffentlicht; sein Pfad je Datensatz folgt dessen id
- **ein** Datenweg `<slug>` mit einer Datei-Quelle `<slug>-file` auf
  `/opt/dataatlas/runtime/data/data/<Paketname>.xmi` und allen konkreten
  Klassen darin
- weitere Wege auf Knopfdruck, Datei oder Datenbank
  (`(dataSourceName=<slug>Ds)`); ihre Datensätze sind vorgeschlagen, aber
  nicht angehakt — welche Klassen aus diesem Weg kommen, entscheidet der
  Nutzer
- `exports` bleibt leer → die Runtime-Vorgaben JSON und XML gelten

**Nicht pluralisiert:** Die Vorlagen im data.atlas-Repo nennen den Datensatz
einer Klasse `Person` „Persons"; eine Pluralregel für beliebige Modellnamen
wäre geraten. Abgeleitet wird `person`, in der Tabelle mit einem Klick zu
ändern.

## Validierung

Harte Fehler halten das Erzeugen auf (`src/transform/validate.ts`), weil das
Ergebnis sonst unbrauchbar wäre: leere Pflichtfelder (`name`, `description`
und `path` sind im Zielmodell `lowerBound=1`), kein Datenweg, kein
ausgewählter Datensatz, doppelte ids, ein Weg ohne Quelle oder mit eigener
**und** geteilter, eine geteilte Quelle, die keinem Weg gehört, relativer Pfad
der Datendatei, `IMPORTED` ohne gültiges Mapping, und bei einer Datenbank
Klassen aus mehreren Packages — über alle Wege gezählt, die sich diese
Datenbank teilen.

Was der Assistent setzt, steht auch in der Datei — auch wenn es dem
Vorgabewert entspricht
([emf.ts#95](https://github.com/eclipse-fennec/emf.ts/issues/95): vorher fielen
so auch Pflichtfelder weg). Nicht gesetzte Features bleiben weg, etwa
`batchSize` ohne Grenze.

Warnungen halten nicht auf: nur CSV gewählt (ersetzt die Vorgaben vollständig,
alles andere wird mit 406 abgelehnt), abgeleitetes JPA-Mapping (Tabellenname
in Großbuchstaben, Spalten unquoted), `batchSizeLimit < batchSize`.

## Veröffentlichen

`src/atlas/publish.ts` folgt dem Seed-Skript des data.atlas-Repos:

1. Schemas sicherstellen — in **jeder** beteiligten Stage, weil jede gegen
   ihre eigene Package-Sicht auflöst.
2. Reihenfolge `eorm` → `configuration` → Domänenmodelle: der Verweis auf
   `eorm#//EntityMappings` bleibt sonst unaufgelöst.
3. Instanz hochladen, bei 5xx bis zu zehnmal wiederholen — die
   Stage-Package-Sicht holt asynchron auf. Ein 4xx wird nicht wiederholt.
4. Optional in die nächste Stage schieben; der Data Atlas liest die finale.

## Entwicklung

```bash
npm install
npm run generate      # TS-Klassen aus model/data-atlas-wizard.ecore
npm run dev           # Vite-Dev-Server (Port 5598)
npm run test:run      # Transformer, Ableitungsregeln, Verdrahtung (vitest)
npm run build         # Typprüfung + Produktions-Build
npm run build:plugin  # TSM-Plugin-Bundle für die gene-Shell
npm run mock:atlas    # Mock-Model-Atlas auf Port 8199
```

Die Tests vergleichen **semantisch** gegen die Vorlagen aus dem
data.atlas-Repo (`test/fixtures/`, Herkunft in der dortigen `README.md`):
erzeugtes XMI und Vorlage werden geladen und ihre Objektgraphen verglichen,
mit aufgelöster Trias. Ein Byte-Vergleich wäre unbrauchbar, weil EMF
Default-Werte weglässt und Kopfattribute anders ordnet.

Für den Handbetrieb ohne Docker:

```bash
npm run mock:atlas    # Scope „jena", Registry „configurations", draft/release
npm run dev           # baseUrl im Assistenten: http://localhost:8199/rest
```

## Modell-Synchronisation

`src/assets/configuration.ecore` und `eorm.ecore` sind **Kopien**; Quelle der
Wahrheit sind das data.atlas-Repo bzw. `emf.persistence-jpa`. Nach Änderungen:

```bash
npm run sync:data-atlas-model
```

## Betrieb in gene

Wie die beiden Geschwister läuft dieser Wizard auch als TSM-Plugin in der
gene-Shell (Perspective „Data-Atlas-Assistent"). Plugin-Repository auf
Port 5498:

```bash
npm run build:plugin && npm run serve:plugin
```

Damit die Perspektive erscheint, muss `data-atlas-wizard` in **beiden**
Startlisten stehen: `src/tsm/repositories.config.ts` und `public/config.xmi`.
`src/main.ts` nimmt die Liste aus der XMI und benutzt die TypeScript-Liste nur
als Fallback, wenn jene leer ist — `test/pluginIntegration.test.ts` hält das
fest.

## Noch nicht enthalten

Transformation (QVT-O), GeoJSON, Query-DataSets, DCAT-Publication und
XMLA/QGis/OData. Das Fassadenmodell ist so geschnitten, dass sie als eigene
Schritte nachwachsen können; QVT-O ist der nächste und geht über LSP — siehe
Abschnitt 11 in [`docs/plans/data-atlas-wizard.md`](../../docs/plans/data-atlas-wizard.md).

## Lizenz

[EPL-2.0](https://www.eclipse.org/legal/epl-2.0/)
