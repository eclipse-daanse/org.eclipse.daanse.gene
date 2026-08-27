# GitHub-Tickets: SensiNact-Mapping-Wizard (Gesamtprozess)

**Übertragen am 2026-08-10** als Sub-Issues von
[DataInMotion/xdp#94](https://github.com/DataInMotion/xdp/issues/94)
(„Review SensiNact Mapping for UI"):

| Ticket | Issue | | Ticket | Issue |
|---|---|---|---|---|
| T1 | [#130](https://github.com/DataInMotion/xdp/issues/130) ✅ | | T11 | [#140](https://github.com/DataInMotion/xdp/issues/140) |
| T2 | [#131](https://github.com/DataInMotion/xdp/issues/131) ✅ | | T12 | [#141](https://github.com/DataInMotion/xdp/issues/141) |
| T3 | [#132](https://github.com/DataInMotion/xdp/issues/132) ✅ | | T13 | [#142](https://github.com/DataInMotion/xdp/issues/142) |
| T4 | [#133](https://github.com/DataInMotion/xdp/issues/133) ✅ | | T14 | [#143](https://github.com/DataInMotion/xdp/issues/143) |
| T5 | [#134](https://github.com/DataInMotion/xdp/issues/134) ✅ | | T15 | [#144](https://github.com/DataInMotion/xdp/issues/144) |
| T6 | [#135](https://github.com/DataInMotion/xdp/issues/135) ✅ | | T16 | [#145](https://github.com/DataInMotion/xdp/issues/145) |
| T7 | [#136](https://github.com/DataInMotion/xdp/issues/136) ✅ | | B1 | [#146](https://github.com/DataInMotion/xdp/issues/146) |
| T8 | [#137](https://github.com/DataInMotion/xdp/issues/137) ✅ | | B2 | [#147](https://github.com/DataInMotion/xdp/issues/147) |
| T9 | [#138](https://github.com/DataInMotion/xdp/issues/138) ✅ | | B3 | [#148](https://github.com/DataInMotion/xdp/issues/148) |
| T10 | [#139](https://github.com/DataInMotion/xdp/issues/139) | | B4 | [#149](https://github.com/DataInMotion/xdp/issues/149) |

Tickets **T1–T9 sind bereits umgesetzt** (Stand 2026-08-05/10) und als „completed"
geschlossen — die Historie ist damit in GitHub dokumentiert.
**T10–T16 sind offen** (Phase 2: Modelatlas + gene-Plugin), **B1–B4** Backlog.
Kontext-Dokument: [PLAN-gene-plugin.md](PLAN-gene-plugin.md).

---

# Phase 1 — Standalone-Wizard (UMGESETZT ✅)

## T1: Projektgerüst sensinact-mapping-wizard (Vite + Vue + emf.ts)

**Labels:** `setup` · **Status: erledigt**

### Kontext
Web-Assistent, der aus dem Ecore-Modell eines Sensors ein `ProviderMapping`-XMI
erzeugt (Metamodell `sensinact-mapping.ecore`, nsURI
`https://fennec.eclipse.org/sensinact/core/mapping/1.0`, aus
`emf.util/org.eclipse.fennec.sensinact.mapping`). Der Nutzer sieht keine
SensiNact-Interna, nur Fachdialoge („Wählen Sie das Feld mit dem Namen des Sensors").
Architektur-Entscheidung: UI arbeitet auf einem **Wizard-Fassadenmodell**; ein
Transformer erzeugt daraus das konforme XMI (Endprodukt, konsumiert von
`ProviderMappingRegistryImpl`).

### Umgesetzt
- [x] Vite+Vue+TS-Projekt mit `@emfts/core`, `@emfts/vue-registry`,
      `@emfts/uimodel-composer` (file:-Dependency auf den Composer-Workspace)
- [x] `vite-plugin-node-polyfills` für den XMI-Parser; vitest-Setup
- [x] **`resolve.dedupe`** für `vue`/`@emfts/core`/`@emfts/vue-registry` — ohne das
      entstehen durch die file:-Dependency zwei `EPackageRegistry`-Singletons
- [x] `src/emf/setup.ts`: Package-Registrierung; `sensinact-mapping.ecore` wird
      **dynamisch** geladen (reflektive Instanzen via `DynamicEObject`, kein Codegen
      fürs Mapping-Metamodell); Kopie + Sync-Script `npm run sync:mapping-model`

### Akzeptanz (erfüllt)
- `npm install`, `vue-tsc --noEmit`, `vitest` laufen sauber.

---

## T2: Wizard-Fassadenmodell (mapping-wizard.ecore) + TypeScript-Codegen

**Labels:** `model` · **Status: erledigt**

### Kontext
Die Mapping-Konzepte (`mid`, `featurePath`-Listen, `TimestampStrategy`) passen nicht
auf Nutzerfragen. Die UI bindet daher an ein Fassadenmodell in Fachsprache; nur der
Transformer kennt das SensiNact-Metamodell.

### Umgesetzt
- [x] `model/mapping-wizard.ecore` (nsURI `http://fennec/sensinact/mapping-wizard/1.0`):
      `SensorMappingSetup` (mappingId, sensorClass, namePath, nameFallback,
      friendlyNamePath, timestamp, location, measurements), `FeaturePath`
      (segments → `ecore:EStructuralFeature`, collectionIndex, label),
      `TimestampChoice` (+`TimestampSource` RECEIVE_TIME/DEVICE_TIME, formatHint),
      `LocationChoice` (+`LocationMode` NONE/STATIC/FROM_DATA),
      `Measurement` (selected, valuePath, label, unit, serviceGroup, targetType,
      `StoragePreset`, `RetentionPreset`)
- [x] `model/mapping-wizard.genconfig.xmi` + `npm run generate` (`@emfts/codegen`,
      Modus emf) → `src/generated/` (17 Dateien)
- [x] Erkenntnis dokumentiert: emf.ts kennt keine `E*Object`-Wrapper-Typen →
      im Modell primitive Typen (EDouble statt EDoubleObject)

### Akzeptanz (erfüllt)
- Generierte typisierte Klassen (`SensorMappingSetup` etc.) kompilieren und werden
  von UI und Transformer verwendet.

---

## T3: Feld-Pfad-Enumeration über das Sensormodell (featurePaths)

**Labels:** `core` · **Status: erledigt**

### Kontext
Herzstück aller „Wählen Sie das Feld …"-Dialoge: navigierbare Attribut-Pfade eines
Sensor-EClass, im Format, das das Mapping als `featurePath`/`valueFeature` erwartet.

### Umgesetzt
- [x] `src/emf/featurePaths.ts`: `enumerateFeaturePaths(root, {kinds, maxDepth})` —
      rekursiv über EReferences (Zyklus-Guard), Blätter = EAttribute; berücksichtigt
      **geerbte** Features und Cross-Resource-Referenzen (em310udl → lorawan)
- [x] Wertart-Klassifikation STRING/NUMERIC/BOOLEAN/TEMPORAL/OTHER
      (inkl. `java.time.Instant` via instanceClassName)
- [x] Metadaten-Vorbelegung aus Ecore-Annotationen: `sensinact.mapping`
      (`sensinact.mapping.unit`/`.description`) + GenModel-`documentation`
- [x] `suggestMeasurementPaths()` → Vorschlagsliste (NUMERIC/BOOLEAN) für den
      Messwerte-Schritt; `crossesCollection`-Markierung für Sammlungs-Pfade
- [x] Vitest gegen echte Fixtures (`em310udl-message.ecore`, `lorawan-uplink.ecore`)

### Akzeptanz (erfüllt)
- `object → battery` (NUMERIC), geerbtes `deduplicationId` (STRING),
  `rxInfo → rssi` (crossesCollection) werden korrekt geliefert.

---

## T4: Transformer Fassadenmodell → ProviderMapping-XMI (+ Persistenz-Regeln)

**Labels:** `core` · **Status: erledigt**

### Kontext
Das verbindliche Endprodukt ist ein XMI konform zu `sensinact-mapping.ecore`.
Designentscheidung: direkte XMI-Erzeugung (kein generischer Serializer), weil die
hrefs **nsURI-basiert** sein müssen (Auflösung über die EPackage-Registry der
Java-Seite — hochgeladene Modelle haben keinen stabilen Dateipfad) und
`featurePath`/`valueFeature`/`unitFeature`/`*Ref` zwingend
`xsi:type="ecore:EAttribute|EReference"` tragen (User-Guide).

### Umgesetzt
- [x] `src/transform/toProviderMapping.ts`: `buildProviderMappingXmi(setup)` →
      `{mappingXmi, mappingFileName, rulesXmi?, rulesFileName?, warnings}`
- [x] Abbildung: NameMapping (Feldpfad + statischer Fallback, collectionIndex),
      TimestampMapping (NOW/FEATURE + hint, Resources referenzieren `//@timestamp`),
      Services gruppiert nach `serviceGroup`, ResourceMapping (mid-Slugs, eType-
      Ableitung: explizit > Ecore-Quelltyp > kanonisch nach Wertart), AdminMapping
      (friendlyNameFeature, providerPackage, Standort statisch als Attribute oder
      als `*Ref`-Pfade), hrefs auf die **deklarierende** Klasse (geerbte Features!)
- [x] Storage-/Retention-Presets → separate `PersistenceRuleRegistry`-XMI
      (PercentageChangeRule 5 %, TimeThrottleChangeRule 10 min, DeletionRule 90 d/1 a),
      Resources referenzieren per `<datei>#<id>`
- [x] Warnungen (z. B. Messwert-Pfad durch Sammlung — `ResourceMapping` kennt kein
      collectionIndex, Engine nimmt Element 0)
- [x] Tests: Golden-Vergleich gegen
      `emf.util/.../examples/battery/em310udl-battery-mapping.xmi` (strukturell) +
      **Round-Trip** (erzeugtes XMI lädt ins dynamisch geladene Mapping-Package,
      alle Referenzen lösen sich auf)

### Akzeptanz (erfüllt)
- 9 Vitest-Tests grün; Round-Trip löst `valueFeature`-Ketten (`object`,`battery`) auf.

---

## T5: FeaturePathPicker-Widget + Ecore-Multi-Upload

**Labels:** `ui` · **Status: erledigt**

### Umgesetzt
- [x] `src/widgets/FeaturePathPicker.vue`: Auswahl enumerierter Pfade, Wertart-Filter
      je Einsatzzweck (namePath→STRING, timestamp→TEMPORAL/STRING/NUMERIC,
      location→NUMERIC, valuePath→NUMERIC/BOOLEAN), Beschreibung aus Annotationen
- [x] Registrierung über `@emfts/vue-registry` `registerForReference` mit
      `targetClass: FeaturePath` und Priorität 1000 — übernimmt automatisch **alle**
      FeaturePath-Features in UIModel-Formularen
- [x] `src/wizard/EcoreUploadStep.vue`: Multi-Datei-Upload (Basis-Modelle wie lorawan
      zusammen hochladen; Dateinamen als Resource-URIs für relative hrefs),
      Wurzelklassen-Heuristik (nirgends als Containment-Ziel → Vorauswahl)

### Akzeptanz (erfüllt)
- Upload von em310udl+lorawan → `EM310UDLUplink` vorausgewählt; Picker zeigt
  typgefilterte Pfade inkl. geerbter Felder.

---

## T6: Wizard-Flow — 6 Schritte, Dialoge deklarativ als UIModel-XMI

**Labels:** `ui` · **Status: erledigt**

### Kontext
Nutzeranforderung: uimodel-composer verwenden, Dialogtexte deklarativ. Das
Core-UIModel hat keinen Wizard-Baustein → App-eigener Stepper (`WizardShell`),
Formular-Schritte als UIModel-XMIs.

### Umgesetzt
- [x] `WizardShell.vue`: Schritte Sensormodell → Identifikation → Messzeitpunkt →
      Messwerte → Standort → Zusammenfassung; „Weiter" pro Schritt validiert
      (deutscher Sperr-Hinweis)
- [x] UIModel-XMIs (`public/wizard-ui/step-{identification,timestamp,location}.xmi`)
      via `UIModelComposer` gegen das Fassadenmodell; Sichtbarkeitsbedingungen als
      JS-Expressions (`self.source === 'DEVICE_TIME'`)
- [x] Messwerte-Schritt als Tabelle (Vorschläge aus T3, an/abwählen, Label/Einheit/
      Gruppe/Presets editierbar)
- [x] Zusammenfassung: Klartext-Review, Warnungen, XMI-Download (+ Regeln-Datei),
      XMI-Vorschau
- [x] `EnumChooser.vue` (Radio, deutsche Labels) ersetzt den Default-Enum-Editor —
      der schreibt numerische Werte, das Fassadenmodell erwartet Enum-Namen
- [x] Reaktivitäts-Brücke: EMF-Objekte sind nicht deep-reactive und
      `useVisibility` wertet nur beim Rendern aus → Versions-Zähler in
      `wizard/context.ts` (`touch()`), composed Steps per `:key` neu gerendert

### Akzeptanz (erfüllt)
- Kompletter Browser-Durchlauf erzeugt korrektes XMI (verifiziert via
  chrome-devtools-Automation).

---

## T7: Bugfix/Workaround — emfts-codegen lässt Attribut-eTypes und EEnums weg

**Labels:** `bug`, `workaround` · **Status: erledigt** (Upstream-Fix: siehe B4)

### Kontext
`@emfts/codegen` (emf-Modus) ruft `setEType()` nur für EReferences auf; EAttribute
bleiben typlos, EEnums werden nicht als Classifier registriert. Der
DataType-/Enum-Matcher der vue-registry findet dann keine Editoren — Formularfelder
verschwinden als leere Kommentar-Knoten. Gleicher Workaround existiert bereits im
uimodel-composer-Editor (`applyEcoreAttributeTypes.ts`, DOM-basiert).

### Umgesetzt
- [x] `src/emf/wizardPackageFixup.ts`: DOM-freier, expliziter Fixup (läuft auch in
      Node-Tests) — trägt Attribut-eTypes nach und registriert die vier Wizard-EEnums
      mit Literalen; wirft bei Modell-Drift (Test schlägt an)
- [x] Regressionstest `test/wizardUi.test.ts`: alle Felder der drei Schritt-XMIs
      lösen auf und erhalten eine Registry-Komponente

### Akzeptanz (erfüllt)
- Identifikations-/Zeitstempel-/Standort-Formulare rendern alle Felder.

---

## T8: Bugfix/Workaround — fehlende Ecore-Wrapper-Typen in emf.ts

**Labels:** `bug`, `workaround` · **Status: erledigt**

### Kontext
Reale Modelle (und `sensinact-mapping.ecore` selbst) referenzieren
`EDoubleObject`/`EIntegerObject`/… — emf.ts führt diese Ecore-Wrapper-Datentypen
nicht. Attribute verlieren ihren Typ (`eType=null`) und fallen z. B. aus der
Messwert-Erkennung (beobachtet mit einem realen Kunden-Modell im Live-Test).

### Umgesetzt
- [x] `ensureEcoreWrapperTypes()` in `src/emf/setup.ts`: ergänzt die acht
      Wrapper-Typen (`BasicEDataType` + instanceClassName) idempotent im
      Ecore-Package vor dem Laden von Modellen

### Akzeptanz (erfüllt)
- Modelle mit `E*Object`-Attributtypen liefern klassifizierte Pfade/Messwert-Vorschläge.

---

## T9: Verifikation Phase 1 — Tests + End-to-End-Durchlauf

**Labels:** `qa` · **Status: erledigt**

### Umgesetzt
- [x] 12 Vitest-Tests (Pfad-Enumeration, Transformer-Golden, Round-Trip,
      Persistenz-Regeln, Standort, Warnungen, UIModel-Widget-Auflösung)
- [x] `vue-tsc --noEmit` + Produktions-Build sauber
- [x] E2E im Browser: Fixtures hochladen → alle 6 Schritte → XMI-Download;
      Ergebnis strukturell äquivalent zum Golden-Beispiel

---

# Phase 2 — Modelatlas + gene-Plugin (OFFEN)

Architektur-Entscheidungen (abgestimmt): Wizard läuft als **TSM-Plugin in der
gene-Shell** (eclipse-daanse/org.eclipse.daanse.gene), entwickelt in **diesem
eigenen Repo**, geladen über ein TSM-Plugin-Repository. **Laufzeit-Kopplung statt
Build-Kopplung** (gene-Pakete sind nicht auf npm publiziert): `ClassPickerDialog`
über Service `ui.model-browser.components`, `ModelAtlasClient` über das TSM-Modul
`storage-model-atlas`; ohne gene greifen Fallbacks — der Wizard bleibt standalone
lauffähig. Details: [PLAN-gene-plugin.md](PLAN-gene-plugin.md).

## T10: Modelatlas als Modell-Quelle in Schritt 1 (mit Upload-Fallback)

**Labels:** `enhancement`, `atlas`

### Kontext
Der Modelatlas (REST, z. B. `http://localhost:8185/rest`) wird primäre Quelle.
Referenz: `gene/packages/storage-model-atlas/src/ModelAtlasClient.ts` (reiner
fetch-Client ohne TSM-Abhängigkeit). Relevante Endpunkte: `GET /scopes`,
`GET /{scope}/schema/stages/{stage}`, `GET /{scope}/schema/search?…`,
`GET /{scope}/schema/stages/{stage}/content?nsUri=…` → roher `.ecore`-String.
Stage-Default `release`, Auth optional Bearer-Token, Schema-`objectId` = Base64-nsURI.

### Aufgaben
- [ ] Minimalen Atlas-Client im Wizard-Repo (Read-only-Teilmenge, API-kompatibel zum
      gene-Client, damit im gene-Betrieb der Original-Client injizierbar ist)
- [ ] Schritt 1: zwei Quellen-Tabs — **Modelatlas** (Standard) und **Datei-Upload**
      (Fallback, bestehende Funktionalität)
- [ ] Atlas-Tab: Verbindungsformular (baseUrl/scope/stage/Token), Persistenz in
      `localStorage`, Schema-Liste + Namens-/nsURI-Suche, Auswahl →
      `getSchemaContent` → `registerEcoreFromString()`
- [ ] Fehlerbehandlung (Server weg/404/leerer Scope) mit deutschen Meldungen
- [ ] Vitest gegen gemockte fetch-Antworten

### Akzeptanzkriterien
- Mit laufendem Atlas: Schema suchen, laden, Wizard bis XMI-Download durchlaufen.
- Ohne Atlas: Upload-Pfad unverändert. Tests grün.

---

## T11: Referenzierte Modelle automatisch per nsURI nachladen (Cascade-Resolver)

**Labels:** `enhancement`, `atlas` · **Abhängig von:** T10

### Kontext
Sensormodelle referenzieren Basis-Modelle (em310udl → lorawan). Muster:
`gene/packages/atlas-browser/src/composables/atlasURIConverter.ts`
(emf.ts-`URIConverter`, löst unbekannte nsURIs per `getSchemaContent`;
gene ruft danach `resourceSet.resolveProxiesAsync`).

### Aufgaben
- [ ] Unaufgelöste Paket-nsURIs nach dem Laden erkennen (Proxy-Scan/URIConverter)
- [ ] Fehlende nsURIs im Atlas auflösen (`nsUriExact`-Suche/`getSchemaContent`),
      rekursiv mit Tiefenlimit; Bericht nicht auflösbarer nsURIs
- [ ] Upload-Pfad: gleiche Erkennung, Nutzerhinweis („Modell X referenziert Y …")
- [ ] Vitest: em310udl ohne lorawan → Mock-Atlas lädt lorawan nach; geerbte Felder
      erscheinen in der Enumeration

### Akzeptanzkriterien
- Auswahl von em310udl im Atlas genügt; `deviceInfo → deviceName` erscheint ohne
  manuelles Zutun. Unauflösbares erzeugt Warnung, keinen Absturz.

---

## T12: TSM-Plugin-Build (manifest.json, dist/tsm, Repository-Index)

**Labels:** `build`, `gene-integration`

### Kontext
TSM lädt Plugins über ein Repository (`index.json` + `/<id>/manifest.json` +
ES-Modul). Shared Libs stellt der gene-Host (`vue`, `primevue`, `@emfts/core`,
`@emfts/vue-registry`, `@emfts/uimodel-composer`). Vorbild:
`gene/scripts/build-plugins.js`, `createTsmExternals()`/`tsmPlugin()` aus
`@eclipse-daanse/tsm/vite`.

### Aufgaben
- [ ] `manifest.json` (id `sensinact-mapping-wizard`, entry, `dependencies:
      ["gene-app","ui-layout","ui-model-browser","storage-model-atlas"]`,
      `sharedDependencies`, `provides: ui.sensinact-wizard.open`)
- [ ] `vite.tsm.config.ts`: ES-Modul nach `dist/tsm/`, Externals für Shared Libs +
      gene-Module, CSS gebündelt
- [ ] Repository-Layout (`dist/plugins/index.json` + Modulordner) + Script
      `build:plugin` + Dev-Serve-Weg
- [ ] `@eclipse-daanse/tsm` als dev-/peerDependency
- [ ] Standalone-Build und Tests bleiben unberührt

### Akzeptanzkriterien
- `npm run build:plugin` erzeugt ladbares Repository; Bundle enthält weder `vue`
  noch `@emfts/*` (Externals-Check).

---

## T13: Plugin-Aktivierung — Perspective, Panel, idempotente Package-Registrierung

**Labels:** `enhancement`, `gene-integration` · **Abhängig von:** T12

### Kontext
Vorbild: `gene/packages/atlas-browser/src/index.ts` (~Z. 153 ff.):
`ui.registry.perspectives` / `ui.registry.panels` / `ui.registry.activities`.
gene registriert das UIModel-Package bereits (via `ui-uimodel-forms`); dessen
`WidgetBridge` hängt als Catch-all (Priorität 1) in der globalen Registry.

### Aufgaben
- [ ] `src/plugin/index.ts` mit `activate/deactivate`: Perspective
      `sensinact-mapping` („SensiNact Mapping", `requiresWorkspace: false`),
      Center-Panel `sensinact-wizard` (hostet `WizardShell`), Activity-Eintrag,
      Service `ui.sensinact-wizard.open`
- [ ] EPackage-Registrierung idempotent: Wizard-Modell (+ `wizardPackageFixup`),
      `sensinact-mapping.ecore` als `?raw`-Asset statt `fetch('/…')`;
      UIModel-Package nur wenn fehlend
- [ ] Widget-Registrierungen (Priorität 1000) gewinnen gegen WidgetBridge
- [ ] Atlas-Client-Bezug im gene-Betrieb via TSM-Modul `storage-model-atlas`
      (`context.getModule`), Fallback = eigener Client aus T10
- [ ] Sauberes `deactivate`

### Akzeptanzkriterien
- gene lädt das Plugin fehlerfrei; Wizard läuft im Center-Panel bis zum
  XMI-Download; keine Doppel-Registrierungs-Fehler.

---

## T14: Klassenauswahl über gene-ClassPickerDialog (mit Fallback)

**Labels:** `enhancement`, `ui`, `gene-integration` · **Abhängig von:** T13

### Kontext
gene bietet `ClassPickerDialog`
(`gene/packages/ui-model-browser/src/components/ClassPickerDialog.vue`; Props u. a.
`sourcePackages`, `includeAbstract`; Emit `select` → `ClassSelection`), zur Laufzeit
über den TSM-Service `ui.model-browser.components` (Vorbild:
`instance-builder/src/components/EClassField.vue`).

### Aufgaben
- [ ] Im gene-Betrieb: Dialog über `inject('tsm')`/Service beziehen;
      `sourcePackages` = geladene Sensor-Packages; `includeAbstract: false`
- [ ] Wurzelklassen-Heuristik als Vorauswahl beibehalten
- [ ] Standalone-Fallback: bestehendes `<select>`
- [ ] Optional bewerten: `PickerDialog`-Optik (ui-search) für den FeaturePathPicker
      (Suche + Gruppierung bei großen Modellen)

### Akzeptanzkriterien
- In gene öffnet die Klassenauswahl den ClassPickerDialog (Baum/Suche);
  Standalone unverändert.

---

## T15: gene-Upstream — Plugin-Repository-Eintrag + Betriebs-Doku

**Labels:** `documentation`, `gene-integration` · **Abhängig von:** T13

### Aufgaben
- [ ] PR gegen eclipse-daanse/org.eclipse.daanse.gene: Repository-Eintrag in
      `src/tsm/repositories.config.ts` (URL konfigurierbar; Default-Aktivierung mit
      Maintainern abstimmen)
- [ ] README dieses Repos: Kapitel „Betrieb in gene" (Build, Repository serven,
      gene-Konfiguration, benötigte Services, Shared-Lib-Versionskompatibilität)
- [ ] Alternative dokumentieren: manuelles Laden ohne gene-Änderung (TSM-DevTools)

### Akzeptanzkriterien
- Dritte können den Wizard nach README in einer lokalen gene-Instanz laden.

---

## T16: End-to-End-Verifikation im gene-Betrieb

**Labels:** `qa`, `gene-integration` · **Abhängig von:** T13, T14 (ideal T10, T11)

### Aufgaben
- [ ] Manuelle E2E: gene dev + Plugin-Repo + laufender Modelatlas → Schema wählen
      (inkl. nsURI-Nachladen), Wizard durchlaufen, XMI strukturell gegen
      `em310udl-battery-mapping.xmi`-Muster vergleichen
- [ ] Ergebnis-XMI im Standalone-Round-Trip-Test verifizieren
- [ ] Abweichungen als Folge-Issues erfassen

### Akzeptanzkriterien
- Dokumentierter erfolgreicher Durchlauf (Screenshots/Protokoll im Issue).

---

# Backlog (separat übertragen, niedrigere Priorität)

## B1: Profil-Slot-Filling (MappingProfile als Vorlage)
Wizard-Modus, der ein `MappingProfile` lädt und pro `ProfileResource` genau eine
Frage stellt („Feld für *Batterieladung* wählen", typkompatibel gefiltert);
Live-Validierung gegen `required`/`expectedType`/`expectedUnit`. Profile könnten aus
dem Modelatlas (Objekt-Registry) kommen.

## B2: collectionIndex-Auswahl im FeaturePathPicker
Durchquert ein Pfad eine Sammlung, Index wählbar machen
(`FeaturePath.collectionIndex` existiert; heute nur Warnung). Hinweis:
`ResourceMapping` kennt kein collectionIndex — wirksam nur für Name/Timestamp,
für Messwerte bleibt die Warnung.

## B3: JUnit-Konformitätstest in emf.util
Wizard-erzeugtes XMI in `org.eclipse.fennec.sensinact.mapping` laden und durch das
`ValueMapper`/`ProviderModelMapperTest`-Umfeld schicken — finale Konformitätsprüfung
gegen die Java-Referenz.

## B4: Upstream-Issue @emfts/codegen — fehlende Attribut-eTypes/EEnums
`emfts-codegen` (emf-Modus) setzt `setEType()` nur für EReferences; EAttribute
bleiben typlos, EEnums fehlen als Classifier. Workarounds existieren doppelt
(gene `applyEcoreAttributeTypes.ts`, Wizard `wizardPackageFixup.ts`, siehe T7) —
gehört upstream gefixt; Issue mit Minimalbeispiel im emfts-codegen-Repo.
