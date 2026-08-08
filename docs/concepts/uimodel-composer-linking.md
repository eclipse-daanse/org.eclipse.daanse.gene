# @emfts/uimodel-composer lokal linken (Phase 0, Branch `feat/uimodel`)

Der `@emfts/uimodel-composer` ist **noch nicht auf npm veröffentlicht**. Für die
Entwicklung auf diesem Branch wird er per `npm link` aus dem lokalen
EMFTs-Workspace eingebunden. Bewusst **kein** Eintrag in `package.json` oder
`package-lock.json` (keine `file:`-Pfade!) — der Link existiert nur als
Symlink in `node_modules`. Veröffentlichung als reguläre Dependency erfolgt
erst vor dem Merge nach `main` (siehe `uimodel-properties-plan.md`, E2).

## Bauen & Linken

```bash
# 1. Composer bauen (erzeugt dist/index.js + dist/index.d.ts)
cd /mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/EMFTs/uimodel-composer
npm run build          # bei fehlenden node_modules vorher: npm install

# 2. Global verlinken (einmalig, legt Symlink im npm-Global-Prefix an)
npm link

# 3. In gene den Link setzen
cd /mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/gene
npm link @emfts/uimodel-composer
```

Verifikation:

```bash
readlink -f node_modules/@emfts/uimodel-composer
# → /mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/EMFTs/uimodel-composer
git status --porcelain package.json package-lock.json   # muss leer sein
```

## Wichtig: `npm install` entfernt den Link

Jedes volle `npm install` (auch `npm ci`, `npm install <paket>`) baut
`node_modules` nach Lockfile neu auf und **entfernt den Symlink**. Symptom:
Vite/vue-tsc melden `Cannot find module '@emfts/uimodel-composer'` bzw. der
App-Start scheitert beim Import in `src/main.ts`.

**Re-Link** (Schritt 2 ist nur nach einem Wechsel der Node-Version /
des Global-Prefix nötig):

```bash
cd /mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/gene
npm link @emfts/uimodel-composer
```

Nach Änderungen am Composer-Quellcode genügt ein erneutes `npm run build` im
Composer-Projekt — der Symlink zeigt direkt auf das Projektverzeichnis.

## Warum dedupe/exclude in vite.config.ts?

Der gelinkte Composer bringt in seinem eigenen `node_modules` Kopien von
`vue`, `@emfts/core` (ältere Version) und `@emfts/vue-registry` mit. Ohne
Gegenmaßnahme würde Vite die Imports des Composers dorthin auflösen — mit
**zweiter `@emfts/core`-Instanz** als Folge (kaputte Singletons:
`EPackageRegistry.INSTANCE`, `eClass`-Identitäten, provide/inject über die
Vue-Grenze). Deshalb in `vite.config.ts`:

- `resolve.dedupe: ['vue', '@emfts/core', '@emfts/vue-registry']`
- `optimizeDeps.exclude: [..., '@emfts/uimodel-composer']`

Der Composer-Build hält diese Pakete als `external` (siehe dessen
`vite.config.ts`), sonst wäre dedupe wirkungslos.

## Registrierung in gene

- `src/main.ts` registriert den Composer als TSM-Shared-Lib
  (`tsmRuntime.register('@emfts/uimodel-composer', …)`) und trägt
  `UimodelPackage` (nsURI `http://uimodel/1.0`, Factory via
  `UimodelFactory.eINSTANCE`) in die zentrale `EPackageRegistry`
  (TSM-Service `gene.package.registry`) ein.
- Smoke-Test: `src/__tests__/uimodel-composer-link.spec.ts`
  (`npx vitest run src/__tests__/uimodel-composer-link.spec.ts`) — prüft
  nsURI, Factory-Verdrahtung und dass **eine** core-Instanz verwendet wird.
