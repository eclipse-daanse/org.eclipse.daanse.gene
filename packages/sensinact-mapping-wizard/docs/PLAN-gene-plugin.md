# Plan: SensiNact-Mapping-Wizard als gene-Plugin (eigenes Repo)

Stand: 2026-08-10 · Status: abgestimmt (Architektur: gene-Plugin; Code: eigenes Repo;
Tickets: siehe [TICKETS.md](TICKETS.md))

## Kontext & Ziel

Der Mapping-Wizard (dieses Repo) erzeugt aus dem Ecore-Modell eines Sensors ein
**`ProviderMapping`-XMI** konform zu `sensinact-mapping.ecore`
(nsURI `https://fennec.eclipse.org/sensinact/core/mapping/1.0`, Quelle:
`emf.util/org.eclipse.fennec.sensinact.mapping`). Der Nutzer sieht keine
SensiNact-Interna, nur Fachdialoge. Kernlogik, Fassadenmodell, Transformer und
Wizard-UI existieren und sind getestet (12 Vitest-Tests, E2E-Durchlauf).

**Neue Anforderungen:**
1. **Modelatlas-Anbindung** — Sensormodelle kommen aus dem Modelatlas
   (REST, z. B. `http://localhost:8185/rest`), Datei-Upload bleibt Fallback.
2. **gene-UI-Bausteine** — insbesondere `ClassPickerDialog` für die Klassenauswahl;
   der Wizard läuft als **TSM-Plugin in der gene-Shell**
   (eclipse-daanse/org.eclipse.daanse.gene), entwickelt in **diesem eigenen Repo**
   und über ein TSM-Plugin-Repository in gene geladen.

## Ergebnisse der gene-Analyse (2026-08-10)

- **`packages/core` ist leer** (Legacy-Typ-Paket, 0 Byte Runtime) — irrelevant.
- **`storage-model-atlas`** enthält den isoliert nutzbaren `ModelAtlasClient`
  (reiner fetch-Client): `listScopes()`, `listSchemas(scope, stage)`,
  `searchSchemas(scope, {nsUri, name, …})`, `getSchemaContent(scope, stage, nsUri)`
  → roher `.ecore`-String. Auth: optionaler Bearer-Token. Stage-Default `release`.
  Achtung: `objectId` von Schemas ist Base64 der nsURI.
- **`atlas-browser`** (Browsing-UI) ist fest mit der gene-Shell verdrahtet
  (Perspectives/Panels/~15 Services) — wird NICHT wiederverwendet; wohl aber sein
  **Cascade-Resolver-Muster**: ein emf.ts-`URIConverter`, der unaufgelöste
  nsURIs per `getSchemaContent` aus dem Atlas nachlädt
  (`atlas-browser/src/composables/atlasURIConverter.ts`).
- **`ClassPickerDialog`** (`ui-model-browser`) + **`PickerDialog`** (`ui-search`) sind
  der sauberste Auswahl-Stack: Vue-only, kein PrimeVue in `PickerDialog`, framework-freie
  Kernlogik (`classPickerSource.ts`, unit-getestet). Bezug zur Laufzeit über den
  TSM-Service **`ui.model-browser.components`** (so macht es `instance-builder/EClassField.vue`).
- **TSM-Mechanik:** Plugins = `manifest.json` + ES-Modul mit `activate(context)`;
  Discovery über Repository-URL (`index.json` + `/<id>/manifest.json` + Modul).
  Shared Libs (`vue`, `primevue`, `@emfts/core`, `@emfts/vue-registry`,
  `@emfts/uimodel-composer`, …) stellt der gene-Host über die TSM-Runtime bereit;
  Plugin-Builds deklarieren sie als Externals (`tsm:`-Imports bzw.
  `createTsmExternals()` aus `@eclipse-daanse/tsm/vite`).
- **Kein gene-Paket ist auf npm publiziert** (Workspace-Links, `main: src/index.ts`).
  Ein externes Plugin-Repo bindet gene-Pakete daher NICHT buildseitig ein, sondern
  bezieht Funktionalität **zur Laufzeit** über TSM-Services/-Module.
- **gene registriert bereits**: das UIModel-Package (`http://uimodel/1.0`, via
  `ui-uimodel-forms`) und den uimodel-composer als Shared Lib — unsere
  Registrierungen müssen idempotent sein. `ui-uimodel-forms/WidgetBridge` hängt als
  Catch-all (Priorität 1) in der globalen `componentRegistry` — unsere Widgets
  registrieren mit Priorität 1000 und gewinnen.

## Architektur

```
┌─ dieses Repo (sensinact-mapping-wizard) ────────────────────────┐
│ Fassadenmodell + Codegen · featurePaths · Transformer · Tests   │
│ Wizard-UI (Steps, FeaturePathPicker, EnumChooser)               │
│ ├── Standalone-App (Vite, bleibt als Dev-Harness + Upload-Pfad) │
│ └── TSM-Plugin-Build (NEU)                                      │
│     manifest.json + src/plugin/index.ts (activate)              │
│     vite.tsm.config.ts → dist/tsm/{index.js,…} + Repo-Index     │
└──────────────────────────────────────────────────────────────────┘
                 ▲ lädt über Plugin-Repository-URL
┌─ gene (eclipse-daanse) ──────────────────────────────────────────┐
│ TSM-Runtime, Shared Libs, Perspective/Panel-Registries           │
│ Services: ui.model-browser.components (ClassPickerDialog),       │
│           storage-model-atlas (ModelAtlasClient),                │
│           gene.package.registry (EPackageRegistry)               │
│ Änderung upstream: NUR Repository-Eintrag (+ Startup-Modul)      │
└──────────────────────────────────────────────────────────────────┘
                 ▲ REST
┌─ Modelatlas ─ /scopes · /{scope}/schema/stages/{stage}[/content] ┐
└──────────────────────────────────────────────────────────────────┘
```

Leitplanken:
- **Laufzeit-Kopplung statt Build-Kopplung**: `ClassPickerDialog` über den Service
  `ui.model-browser.components`, `ModelAtlasClient` über das TSM-Modul
  `storage-model-atlas`. Fehlen die Services (Standalone-Betrieb), greifen Fallbacks
  (eigenes `<select>`, eigener minimaler Atlas-REST-Client) — der Wizard bleibt
  auch außerhalb von gene lauffähig.
- **Ein Code-Stand für beide Betriebsarten**: Steps/Widgets importieren `vue` bare;
  der TSM-Build externalisiert es, der Standalone-Build bündelt es.
- Das erzeugte XMI bleibt unverändert das Endprodukt (nsURI-hrefs,
  `xsi:type`-Pflichten — durch bestehende Golden-/Round-Trip-Tests abgesichert).

## Arbeitspakete

→ als übertragbare GitHub-Tickets ausformuliert in [TICKETS.md](TICKETS.md).
Dort dokumentieren **T1–T9 die bereits umgesetzte Phase 1** (Standalone-Wizard,
zum Anlegen + direkten Schließen); Phase 2:

| # | Titel | Abhängig von |
|---|---|---|
| T10 | Atlas-Quelle in Schritt 1 (ModelAtlasClient, Liste/Suche, Upload-Fallback) | — |
| T11 | Automatisches Nachladen referenzierter nsURIs (Cascade-Resolver) | T10 |
| T12 | TSM-Plugin-Build + manifest (dist/tsm, Repo-Index, Externals) | — |
| T13 | Plugin-Aktivierung in gene (Perspective/Panel/Activity, idempotente EPackage-Registrierung) | T12 |
| T14 | Klassenauswahl über ClassPickerDialog (Service, mit Fallback) | T13 |
| T15 | gene-Integration dokumentieren + Repository-Eintrag (Upstream-PR) | T13 |
| T16 | E2E-Verifikation in gene + README | T13, T14, ideal T10–T11 |
| B1–B4 | Backlog: Profil-Slot-Filling · collectionIndex-UI · JUnit-Konformitätstest (emf.util) · Upstream-Issue emfts-codegen-eType-Lücke | — |

Empfohlene Reihenfolge: T10 → T11 (rein in diesem Repo, headless testbar) → T12 → T13 → T14 → T15 → T16.

## Verifikation

- Bestehende Vitest-Suite bleibt grün (Transformer/Pfade/Widget-Auflösung);
  neue Tests: Atlas-Client-Mocks (Liste/Suche/Content), nsURI-Nachladen.
- Standalone: `npm run dev` — Upload-Pfad unverändert.
- gene: Plugin-Repo bauen, gene mit Repository-Eintrag starten, Perspective
  „SensiNact Mapping" öffnen, Modell aus laufendem Modelatlas wählen,
  Wizard durchlaufen, XMI vergleichen (strukturell gegen
  `em310udl-battery-mapping.xmi`-Muster).

## Risiken / offene Punkte

- **TSM-Modul-Import aus fremdem Repo**: `storage-model-atlas` exportiert den Client
  als Modul-Export; Bezug via `context.getModule('storage-model-atlas')`. Falls die
  TSM-Version das nicht hergibt → Fallback-Client (Ticket 1 enthält ihn ohnehin).
- **Versionsdrift gene ↔ Plugin**: Shared-Lib-Versionen (vue/primevue/@emfts/core)
  müssen zum gene-Host passen; im manifest per `sharedDependencies` deklarieren.
- **Modelatlas-Verfügbarkeit** in Dev: Upload-Fallback deckt Offline-Arbeit ab.
- Client/Server-Abweichung bei `/validate`-Pfaden im Atlas (in gene beobachtet) —
  für den Wizard irrelevant (read-only Nutzung), aber nicht auf `validate()` bauen.
