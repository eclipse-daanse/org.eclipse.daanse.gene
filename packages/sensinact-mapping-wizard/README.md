# sensinact-mapping-wizard

Web-Assistent, der aus dem **Ecore-Modell eines neuen Sensors** ein
**SensiNact-`ProviderMapping`-XMI** erzeugt (Metamodell
`https://fennec.eclipse.org/event.atlas/mapping/1.0` aus
`dim_xdp/event.atlas/org.eclipse.fennec.event.atlas.mapping`).

> **Metamodell-Umzug (2026-08-26):** Das Mapping-Metamodell lag früher in
> `emf.util/org.eclipse.fennec.sensinact.mapping` mit nsURI
> `…/sensinact/core/mapping/1.0`. Struktur unverändert, geändert haben sich nur
> nsURI und Java-Package (`org.eclipse.fennec.event.atlas.model`). Der
> Assistent **schreibt** das neue nsURI und **liest** beide (das alte ist als
> Alias registriert, siehe `src/emf/setup.ts`).

Der Nutzer sieht dabei **keine SensiNact-Interna** — nur Fragen in
Fachsprache („Wählen Sie das Feld mit dem Namen des Sensors", „Woher kommt
der Messzeitpunkt?"). Die UI arbeitet auf einem **Wizard-Fassadenmodell**
(`model/mapping-wizard.ecore`); ein Transformer erzeugt daraus am Ende das
konforme `ProviderMapping`-XMI, das die OSGi-Registry
(`ProviderMappingRegistryImpl`) direkt konsumieren kann.

> **Betrieb:** Der Assistent läuft ausschließlich als **TSM-Plugin in gene**.
> Die frühere Standalone-Ansicht (eigene index.html, `npm run dev`, eigenes
> Verbindungsformular) ist entfallen — Verbindungen werden im Atlas Browser
> gepflegt, der Assistent wählt nur aus.

## Architektur

```
Sensormodell (Modelatlas | Datei/Workspace) ──▶ EPackageRegistry (dynamisch)
                                   │
Wizard-UI (uimodel-composer) ──▶ SensorMappingSetup (Fassadenmodell)
                                   │  src/transform/
                                   ▼
              ProviderMapping (+ MappingProfile, Persistenz-Regeln)
                                   │
                    ┌──────────────┴──────────────┐
             XMI-Download                In den Modelatlas
                                         veröffentlichen ──▶ Runtime lädt
```

- **UI**: `@emfts/uimodel-composer` (npm) — die Dialoge sind deklarative
  UIModel-XMIs, neue Widgets (Feld-Auswahl) kommen über `@emfts/vue-registry`.
- **Fassadenmodell**: `model/mapping-wizard.ecore`, TS-Klassen generiert mit
  `@emfts/codegen` (`npm run generate`).
- **Mapping-Metamodell**: wird zur Laufzeit dynamisch geladen
  (`src/assets/event-atlas-mapping.ecore`, Kopie — siehe unten); Instanzen entstehen
  reflektiv, kein Codegen nötig.

## Werkzeugleiste der Perspective

Die Dokument-Aktionen liegen in der Menü-Toolbar (`gene.menu.registry`,
registriert in `src/plugin/index.ts` — Vorbild: metamodeler):

| Aktion | Wirkung | aktiv wenn |
|---|---|---|
| **Neues Mapping** | verwirft den Stand (nach Rückfrage) | immer |
| **Mapping öffnen** | öffnet den Dialog „Bestehendes Mapping öffnen" (Registry/Stage-Objektliste oder Datei) | immer |
| **Speichern** | schreibt alle Artefakte in den geöffneten Workspace-Ordner (`gene.filesystem`) | ein lokaler Ordner ist geöffnet und es gibt etwas zu speichern |
| **In den Modelatlas** | öffnet den Upload-Dialog (Registry/Stage, Artefakt-Liste, Fortschritt) | eine schreibfähige Verbindung besteht |

Die Artefakte selbst entstehen in `src/wizard/artifacts.ts` — dieselbe Quelle
für Menü, Upload-Dialog und die Vorschau in der Zusammenfassung.

## Schritt 1: Modell und Nachricht

Schritt 1 zeigt nur noch das gewählte Sensormodell und die Nachrichtenklasse;
alle Listen stecken in Dialogen (T23/#195, T24/#201):

- **Verbindung**: keine eigene Sektion mehr. Der Assistent übernimmt die aktive
  Verbindung des Atlas-Browser-Plugins (`gene.atlas.browser`: `connections` +
  `getClient(id)`, siehe `useAtlasConnection.ts`); in den Dialogen ist sie
  sichtbar und bei mehreren umschaltbar. Eingerichtet werden Verbindungen im
  Atlas Browser.
- **Modell wählen …**: Dialog mit Suche über die Schemas der Stage
  (`SchemaBrowser`) oder Datei/Workspace. Referenzierte Basis-Modelle (z. B. ein
  gemeinsames LoRaWAN-Modell) werden automatisch per nsURI nachgeladen
  (`src/atlas/cascadeLoader.ts`); fehlende Begleitdateien werden gemeldet.
- **Nachricht**: eigener Klassen-Dialog (`dialogs/ClassPickerDialog.vue`) über
  die Klassen des geladenen Modells; Wurzel-Kandidaten (nirgends
  Containment-Ziel) stehen oben und sind als „Nachricht" markiert.
Das Öffnen eines bestehenden Mappings liegt in der Werkzeugleiste („Mapping
öffnen") — siehe unten.

## Gemeinsamer Provider aus mehreren Nachrichtentypen

Liefert ein Gerät mehrere Uplink-Typen (z. B. Messwerte + Status), lassen sich
in der Zusammenfassung **weitere Nachrichtentypen zum selben Provider
hinzufügen**: Der Assistent erzeugt dann je Typ ein `ProviderMapping` plus ein
gemeinsames `MappingProfile` mit `providerStrategy="UNIFIED"` — die
SensiNact-Registry führt alle Mappings zu **einem** Provider zusammen.
Resources, die nicht jeder Typ liefert, werden im Profil `required="false"`.

Demo-Modelle für dieses Szenario liegen in [`test-data/`](test-data/)
(`multisensor-base/-measurement/-status.ecore`, per nsURI verknüpft —
funktioniert mit Upload wie mit Atlas-Bezug inkl. Cascade-Nachladen).

## Veröffentlichen im Modelatlas

Der Zusammenfassungs-Schritt kann die erzeugten Artefakte direkt in den
verbundenen Modelatlas hochladen (statt sie als Datei herunterzuladen). Die
SensiNact-Runtime liest sie von dort: eine
`org.eclipse.fennec.sensinact.mapping.atlas`-Konfiguration muss auf denselben
Scope und dieselbe Registry zeigen (Runtime-Default: `mappings`), dann
registriert sie die Mappings als OSGi-Services — siehe „Loading mappings from a
Model Atlas" im
[SensiNact-Mapping-User-Guide](../emf.util/docs/sensinact-mapping-user-guide.md).

- Ziel wählbar im Upload-Dialog: **Registry** (bevorzugt die Herkunft des
  Dokuments, sonst eine mit „mapping" im Namen) und **Stage** — angeboten werden
  nur schreibbare Stages, gelesen aus `GET /scopes/{scope}`.
- Upload-Reihenfolge: **Profil und Speicher-Regeln zuerst**, danach die
  Mappings, damit referenzierte Objekte bereits vorhanden sind.
- **objectId = Dateiname** (z. B. `mein-provider-profile.xmi`), damit die
  hrefs zwischen den Artefakten (`<datei>.xmi#<id>`) unverändert gültig
  bleiben. Ob die Runtime-Source solche Referenzen zwischen Atlas-Objekten
  auflöst, ist noch mit der Java-Seite abzustimmen (siehe Hinweis in der UI).
- Die Atlas-REST-API sendet **keine CORS-Header**, direkte Browser-Aufrufe auf
  `http://localhost:8086` werden blockiert (beim Veröffentlichen zusätzlich der
  Preflight `OPTIONS`). Statt CORS nachzurüsten geht der Weg über den
  **Vite-Dev-Proxy** wie in gene: `vite.config.ts` mappt `/atlas` 1:1 auf
  `http://localhost:8086` (der Context-Path des Atlas ist selbst `/atlas`) — als
  baseUrl der Verbindung also **`/atlas/rest`** eintragen, dann ist alles
  same-origin.

## Dokument-orientiertes Arbeiten

Der Assistent arbeitet auf **einem Mapping-Dokument**: Entweder ist eines
geöffnet — aus dem Modelatlas oder aus einer Datei — und wird bearbeitet und
gespeichert, oder man beginnt leer mit einem neuen. Die Kopfzeile zeigt immer,
was geöffnet ist („Neues Mapping" / „m5airq-airquality — Modelatlas" /
„mein-mapping.xmi — Datei") und bietet **Neues Mapping** an (fragt nach, wenn
Arbeit verloren ginge).

Öffnen:

- **Modelatlas** — Schritt 1, Umschalter „Bestehendes Mapping bearbeiten"
  (siehe unten), oder direkt aus dem **Atlas Browser** (Aktion „Im
  Mapping-Assistenten öffnen" am Objekt-Detail).
- **Datei / Workspace** — die Dropzone nimmt beides: ein `ProviderMapping`-XMI
  wird als Dokument geöffnet, `.ecore`-Dateien legen ein neues Mapping an.
  Profil und Speicher-Regeln daneben ablegen — sie werden als Nachbar-Artefakte
  übernommen. Fehlende Sensormodelle holt der Assistent aus dem verbundenen
  Atlas, sonst meldet er, welche Datei fehlt.

Speichern richtet sich nach der Herkunft: Ein Atlas-Dokument wird als **dasselbe
Objekt** aktualisiert (`override=true`), ein Datei-Dokument unter demselben
Dateinamen heruntergeladen — der jeweils andere Weg bleibt möglich.

## Bestehende Mappings bearbeiten

Schritt 1 kann statt eines Sensormodells auch ein **bereits veröffentlichtes
Mapping** öffnen (Umschalter „Bestehendes Mapping bearbeiten"): Der Assistent
listet die Objekte einer Registry-Stage, lädt das gewählte `ProviderMapping`
und rechnet es ins Fassadenmodell zurück (`src/transform/fromProviderMapping.ts`).
Beim Speichern in der Zusammenfassung wird **dasselbe Objekt überschrieben**
(gleiche objectId, `override=true`).

- Gelesen werden **beide Serialisierungen** von Referenzen: href-Kindelemente
  (so schreibt der Assistent, so stehen die Beispiele im User-Guide) und die
  Attribut-Kurzform `valueFeature="ecore:EAttribute nsURI#//X/y"`, die
  Java-EMF erzeugt — die Objekte im laufenden Modelatlas sehen so aus.
- Referenzierte Sensormodelle werden automatisch nachgeladen: per nsURI, und
  falls das Mapping — wie die handgeschriebenen emf.util-Beispiele — nur
  **Dateipfade** nennt, über die Klassifizierer-Suche des Atlas
  (`classifier=`), gefolgt von einer Fragment-Heuristik, die die Datei-hrefs
  auf nsURIs umschreibt.
- Nachbar-Artefakte (Profil, Speicher-Regeln) werden über ihren Dateinamen als
  objectId mitgeladen; Speicher-/Aufbewahrungs-Presets erkennt der Assistent
  auch dann, wenn nur der href vorliegt (stabile Regel-Ids).
- Was der Assistent fachlich nicht kennt (Java-Funktionen als Zeitquelle,
  `referencedResource`, temporäre Resources, eigene Persistenz-Regeln), wird
  beim Öffnen als **Hinweis** gemeldet — es geht beim Speichern verloren.
- Round-Trip-Garantie: unverändert geöffnet und neu erzeugt ergibt
  byte-identisches XMI (`test/fromProviderMapping.test.ts`).

## Modell-Synchronisation

`src/assets/event-atlas-mapping.ecore` ist eine **Kopie**; die Quelle der Wahrheit ist
`../../dim_xdp/event.atlas/org.eclipse.fennec.event.atlas.mapping/model/event-atlas-mapping.ecore`.
Die Test-Fixtures (`lorawan-uplink.ecore`, `em310udl-message.ecore`,
`dragino-message.ecore`, `em310udl-battery-mapping.xmi`) stammen aus demselben
Projekt bzw. aus `…mapping.tests/model/`.
Nach Änderungen am Metamodell:

```bash
npm run sync:mapping-model
```

`src/assets/atlas-management.ecore` / `atlas-workflow-api.ecore` sind Kopien der
Atlas-API-Metamodelle aus `gene/packages/storage-model-atlas/src/model/`.

## Betrieb in gene (TSM-Plugin)

Der Wizard läuft zusätzlich als TSM-Plugin in der gene-Shell
(eclipse-daanse/org.eclipse.daanse.gene) — als eigene Perspective
„SensiNact Mapping" mit dem Assistenten im Center-Panel.

```bash
npm run build:plugin    # baut dist/plugins/ (TSM-Repository: index.json + Modul)
npm run serve:plugin    # served das Repository auf http://localhost:5399 (CORS)
```

Nach `npm run build:plugin` das Modul im Browser neu laden:
`tsm.reload('sensinact-mapping-wizard')` in der Konsole — der Repository-Build
schreibt zwar `serve.json` mit `Cache-Control: no-store`, ältere Sitzungen halten
das Modul aber im TSM-Loader.

gene-seitig ist genau **ein** Eintrag nötig (`gene/src/tsm/repositories.config.ts`):

```ts
// repositories:
{ id: 'sensinact-mapping-wizard', name: 'SensiNact Mapping Wizard',
  url: 'http://localhost:5399', enabled: true, priority: 20 }
// startupModules: … , 'sensinact-mapping-wizard'
```

Im gene-Betrieb registriert das Plugin zusätzlich eine **Aktion im Atlas
Browser**: Am Detail eines `ProviderMapping`-Objekts erscheint „Im
Mapping-Assistenten öffnen" (Contribution-Point `gene.atlas.objectActions`, von
gene bereitgestellt — siehe `gene/packages/atlas-browser/src/objectActions.ts`).
`optionalDependencies` im Manifest sorgt dafür, dass der Atlas Browser vorher
aktiviert ist; kommt er später, fasst das Plugin kurz nach.

Technik: `manifest.json` deklariert die vom gene-Host bereitgestellten Shared
Libraries (`sharedDependencies` mit `versionRange`); der Build
(`scripts/build-plugin.mjs`) externalisiert sie (`__tsm__.require(…)`), bündelt
alle Assets (Metamodelle, UIModel-XMIs als `?raw` — **kein fetch**, in gene
liefert das die SPA-Seite) und injiziert das CSS zur Laufzeit.
`src/plugin/index.ts` registriert Perspective/Panel/Activity idempotent;
ist das TSM-Modul `storage-model-atlas` geladen, wird dessen
`ModelAtlasClient` verwendet, sonst der eigene Client
(`src/atlas/clientFactory.ts`).

## Entwicklung

```bash
npm install
npm run generate     # TS-Klassen aus model/mapping-wizard.ecore
npm run test:run     # Transformer-/Pfad-Tests (vitest)
npm run type-check   # vue-tsc
npm run build:plugin # TSM-Plugin bauen (dist/plugins)
```

Getestet wird headless (vitest) und in gene; eine eigene Standalone-App gibt es
nicht mehr.

Alle Abhängigkeiten kommen aus der npm-Registry (`@emfts/uimodel-composer`,
`@emfts/core`, `@emfts/vue-registry`) — ein lokaler Build des Composers ist
nicht mehr nötig. Zum Testen gegen einen unveröffentlichten Composer-Stand
temporär `npm install <pfad>/packages/uimodel-composer` verwenden.

Für lokale Tests ohne echten Atlas-Server:

```bash
npm run mock:atlas   # Mock-Modelatlas auf :8199 (Scope „sensors")
```

## Lizenz

[EPL-2.0](https://www.eclipse.org/legal/epl-2.0/)
