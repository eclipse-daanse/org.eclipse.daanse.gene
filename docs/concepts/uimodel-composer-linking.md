# @emfts/uimodel-composer in gene

Der Composer ist seit dem Monorepo-Umbau von `emf.ts.ui` **auf npm
veröffentlicht** und wird als reguläre Dependency eingebunden — kein
`npm link`, keine `file:`-Pfade mehr.

| Paket | Version | in gene |
|---|---|---|
| `@emfts/uimodel-composer` | `^0.0.2-next.1` | ja (Kern) |
| `@emfts/uimodel-vega` | `0.0.1-next.1` | nein |
| `@emfts/uimodel-maps` | `0.0.1-next.1` | nein |
| `@emfts/uimodel-diagram` | `0.0.1-next.1` | nein |
| `@emfts/tsrouter` | `0.1.0` | nein |

Mit `0.0.2-next.1` sind Vega-, Maps- und Diagram-Renderer aus dem Kern in
eigene Pakete gewandert (Breaking Change). gene ist davon **nicht** betroffen:
`UimodelPropertiesView` registriert nur FormView/Section/Tab/Summary/Table/
MasterDetail — Vega/Map/Diagram wurden nie registriert. Nebeneffekt: die
OpenLayers-Abhängigkeit (`ol`), die früher über `MapViewComposer` in den Build
gezogen wurde, entfällt.

Eingetragen ist die Dependency an zwei Stellen, weil beide importieren:

- `package.json` (App: `src/main.ts` registriert Paket + Shared-Lib)
- `packages/ui-uimodel-forms/package.json` (Plugin)

## Warum dedupe/exclude in vite.config.ts?

Auch als reguläre Dependency bringt der Composer eigene Abhängigkeiten auf
`vue`, `@emfts/core` und `@emfts/vue-registry` mit. Löst Vite diese Imports auf
eine zweite Kopie auf, gibt es eine **zweite `@emfts/core`-Instanz** — mit
kaputten Singletons als Folge (`EPackageRegistry.INSTANCE`, `eClass`-
Identitäten, provide/inject über die Vue-Grenze). Deshalb in `vite.config.ts`:

- `resolve.dedupe: ['vue', '@emfts/core', '@emfts/vue-registry']`
- `optimizeDeps.exclude: ['@emfts/core', '@emfts/uimodel-composer', '@emfts/vue-registry']`

Das Vorbündeln (`optimizeDeps`) würde sonst eigene Kopien erzeugen: der
ausgeschlossene Composer lädt die rohe dist-Datei, App und Plugins bekämen die
vorgebündelte — zwei `componentRegistry`-Singletons, die Widget-Bridge wäre
unsichtbar (`injection Symbol(componentRegistry) not found`).

Der Composer-Build hält diese Pakete als `external`, sonst wäre dedupe
wirkungslos.

## Registrierung in gene

- `src/main.ts` registriert den Composer als TSM-Shared-Lib
  (`tsmRuntime.register('@emfts/uimodel-composer', …)`) und trägt
  `UimodelPackage` (nsURI `http://uimodel/1.0`) in die zentrale
  `EPackageRegistry` (TSM-Service `gene.package.registry`) ein.
  `void UimodelFactory.eINSTANCE` verdrahtet die Factory mit dem Paket —
  ohne das liefert das XMI-Laden generische `DynamicEObject`s statt der
  generierten Impls mit Property-Zugriff.
- Die gene-eigene Widget-Erweiterung (`CodeWidget`/`MarkdownWidget`/
  `RichTextWidget`) ist ein **separates EPackage**, siehe
  `uimodel-properties-plan.md` Abschnitt 10.
- Smoke-Test: `src/__tests__/uimodel-composer-link.spec.ts`
  (`npx vitest run src/__tests__/uimodel-composer-link.spec.ts`) — prüft
  nsURI, Factory-Verdrahtung und dass **eine** core-Instanz verwendet wird.

## Lokal gegen einen ungebauten Composer entwickeln

Nur nötig, wenn parallel am Composer selbst gearbeitet wird. Seit dem
Monorepo-Umbau liegt das Paket in einem Unterverzeichnis:

```bash
cd /mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/EMFTs/uimodel-composer
npm install && npm run build -w @emfts/uimodel-composer
cd packages/uimodel-composer && npm link

cd /mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/gene
npm link @emfts/uimodel-composer
```

Achtung: `npm link` auf das Repo-**Root** zeigt auf das Monorepo-Paket
(`emf.ts.ui`) und hat kein `dist/` — Symptom ist
`Cannot find module '@emfts/uimodel-composer'`. Jedes volle `npm install`
entfernt den Link wieder und stellt die publizierte Version her; das ist der
gewünschte Normalzustand.
