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
Assistent in Fachsprache: **welches Modell, woher die Daten, welche Klassen
werden Datensätze, unter welchem Pfad, in welchen Formaten.**

## Ablauf

| Schritt | Inhalt |
|---|---|
| Modell | Domänenmodell aus einem Model-Atlas-Scope oder als Datei laden |
| Instanz & Modus | Name, Beschreibung, Ablageort (Datei oder Atlas), Art der Datenquelle |
| Datenquelle | Datei: Pfad der XMI. Datenbank: DataSource-Filter und ob das JPA-Mapping abgeleitet oder importiert wird |
| Datensätze | Häkchen je Klasse, dazu id, Name, Pfad, Beschreibung, Batch-Grenzen |
| Endpunkt | Basis-Pfad, Namen, OpenAPI, Pagination-Parameter |
| Formate | JSON, XML, CSV, CSV-ZIP — leer heißt: die Vorgaben des Data Atlas |
| Zusammenfassung | Prüfliste, XMI-Vorschau, Download oder Veröffentlichen im Model Atlas |

## Der Ablageort bestimmt die Verweise

Das ist die Entscheidung mit den meisten Folgen im erzeugten Dokument:

| `configMode` | Verweise auf Modellklassen | Pfad der Datendatei |
|---|---|---|
| `FILE` | `model/person.ecore#//Person` | relativ (`data/person.xmi`) |
| `ATLAS` | `<nsURI>#//Person` | absolut (`/opt/dataatlas/runtime/data/…`) |

Im Datei-Modus braucht **jedes** referenzierte Package den Pfad seiner
`.ecore`; der Modell-Schritt trägt sie beim Laden ein. Fehlt einer, bricht das
Erzeugen mit einer Meldung ab — ein nsURI-Href in einer Datei-Konfiguration
sieht plausibel aus und löst beim Laden nicht auf.

## Erzeugt wird über EMF, nicht über Textbausteine

Anders als die beiden Geschwister-Assistenten
([eorm](../eorm-wizard), [sensinact](../sensinact-mapping-wizard)) baut dieser
Wizard das **Zielmodell** und lässt `saveToString()` schreiben. Escaping,
Namespaces, `xsi:type`, Elementreihenfolge und die Referenzformate macht damit
der Serializer.

Von Hand bleiben zwei Überschreibungen in `src/transform/dataAtlasResource.ts`,
beide weil emf.ts dort von Java EMF abweicht:

| Was | Warum | Ticket |
|---|---|---|
| `getHref()` | Der Datei-Dialekt kommt aus der Karte nsURI → Dateiname; EClassifier haben in emf.ts kein `eResource()` | [emf.ts#80](https://github.com/eclipse-fennec/emf.ts/issues/80) |
| `getURIFragment()` | `iD="true"` wird beim Speichern nicht ausgewertet — sonst stünde `dataInput="/0/0"` in der Datei | [emf.ts#84](https://github.com/eclipse-fennec/emf.ts/issues/84) |
| `writeNamespaces()` | Typpräfixe in Attributwerten werden geschrieben, das Präfix aber nicht deklariert | [emf.ts#87](https://github.com/eclipse-fennec/emf.ts/issues/87) |

Ebenso trägt `src/emf/wizardPackageFixup.ts` nach, was `emfts-codegen`
ausgelassen hat ([emf.ts#83](https://github.com/eclipse-fennec/emf.ts/issues/83)):
Attribut-Typen und die EEnums als Classifier. Ohne das käme aus einem
Round-Trip der String `"true"` statt eines Wahrheitswerts zurück. Die Typen
liest der Fixup aus derselben `.ecore`, aus der auch der Generator kommt — eine
Modelländerung ist damit gedeckt, ohne eine Tabelle nachzuziehen.

## Ableitungsregeln

Aus dem gewählten EPackage (`src/wizard/context.ts`):

- `instanceName` = Paketname, `slug` = kebab-case davon
- je **konkreter** Klasse ein Datensatz: `id` = lowerCamel, `name` = Title
  Case, `path` = `id`, Beschreibung aus der GenModel-Annotation
- `serviceId` = `<slug>-rest`, `urlContext` = `/<slug>`
- `fileSource.fileUri` = `data/<Paketname>.xmi`, im Atlas-Modus mit dem
  absoluten Präfix davor
- `databaseSource.dataSourceFilter` = `(dataSourceName=<slug>Ds)`
- `exports` bleibt leer → die Runtime-Vorgaben JSON und XML gelten

**Nicht pluralisiert:** Die Vorlagen im data.atlas-Repo nennen den Datensatz
einer Klasse `Person` „Persons"; eine Pluralregel für beliebige Modellnamen
wäre geraten. Abgeleitet wird `person`, in der Tabelle mit einem Klick zu
ändern.

## Validierung

Harte Fehler halten das Erzeugen auf (`src/transform/validate.ts`), weil das
Ergebnis sonst unbrauchbar wäre: leere Pflichtfelder (`name`, `description`
und `path` sind im Zielmodell `lowerBound=1`), kein ausgewählter Datensatz,
doppelte ids, relativer Datei-Pfad im Atlas-Modus, fehlender `.ecore`-Pfad im
Datei-Modus, `IMPORTED` ohne gültiges Mapping, und bei einer Datenbank
Klassen aus mehreren Packages.

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
