# TSM: Stand im EMFTs-Repo und was er für gene bedeutet

**Stand:** 2026-08-20 · Grundlage: `EMFTs/tsm` @ `cbf43b5`, gene @ `b8f4c06`
(analysiert auf Branch `analyse/tsm-stand`)

Alle Aussagen unten sind gemessen, nicht aus den Commit-Texten abgeleitet:
gene wurde per `file:`-Link gegen den Repo-Stand gebaut und getestet.

## Kernaussage

**gene läuft ohne eine einzige Codeänderung gegen den neuen TSM.**

| Prüfung | Ergebnis |
|---|---|
| 196 Unit-Tests | grün |
| `vite build` | erfolgreich |
| Plugin-Build | 32/32 |
| E2E (bootstrap, workspace, uimodel-settings) | grün |

Alle von gene importierten Symbole (`initTsmRuntime`, `injectable`,
`singleton`, `inject`, `ModuleContext`, `PluginRepository`) existieren
unverändert. Die Migration ist also **wahlfrei**, nicht erzwungen.

## Der `feat!`-Bruch trifft gene nicht

`cbf43b5 feat!: hand modules to the loader explicitly, and drop window entirely`
klingt fatal, weil gene komplett auf `window.__tsm__` steht: 25 von 32
gebauten Plugin-Bundles rufen `__tsm__.require(...)`.

Betroffen ist aber nur der **ModuleLoader**, der Module nicht mehr per Name
im globalen Namensraum sucht (`window[moduleId]`). Der
Shared-Library-Mechanismus über `initTsmRuntime()` setzt `window.__tsm__`
weiterhin — `TsmRuntime.ts:207`. gene nutzt ausschließlich Letzteren:
`loader.loadModule(manifest)` bleibt gültig, der zweite Parameter
(`{ container, awaitCascade }`) ist optional.

## Was gene gewinnen könnte — nach Nutzen sortiert

### 1. `whenAvailable()` statt Polling — sofort, klein, belegbar

Neu in `ObservableServiceRegistry`:

```ts
/** Resolve once a service is available — immediately if it already is.
 *  The alternative to polling has()/get() in a loop. */
whenAvailable<T>(id: string, options?: { timeoutMs?: number }): Promise<T>
```

Das ist wörtlich der Ersatz für zwei bestehende Poll-Schleifen in gene:

- `ui-properties-panel/…/PropertiesPanel.vue:1190` — 100 ms, 50 Versuche,
  weil `ui.uimodel.forms` sich NACH dem Panel registriert
- `transformation/…/TransformationEditor.vue:476`

Dazu 17 `computed(() => …getService(…))` von insgesamt 134
`getService`-Aufrufen: lazy Auflösung als Workaround für fehlendes Binding.
Die müssen nicht alle wandern, aber sie zeigen, dass das Muster verbreitet
ist.

**Aufwand:** zwei Stellen umschreiben, wenige Zeilen. Kein API-Bruch.

### 2. Manifest als einzige Quelle für Sharing — verhindert einen Fehler, der uns schon getroffen hat

`eb0554c` macht `createTsmExternals(manifest)` aus `sharedDependencies`
ableitbar, „rather than deciding from lists kept in the build config, where
the two could [diverge]" — plus eine Bau-Zeit-Prüfung
(`bundledSharedLibraries`), die meldet, wenn ein als shared deklariertes
Paket doch mitgebündelt wurde.

Genau diese Divergenz war der Produktions-Bug vom 2026-08-13 (PR #121):
`externalFn` in `scripts/build-plugins.js` schloss alle `@emfts/*` aus, die
separate `sharedModules`-Liste kannte `@emfts/uimodel-composer` aber nicht →
nackter ESM-Import → App startete nicht. Mit einer Quelle statt zwei ist das
strukturell ausgeschlossen.

**Aufwand:** `sharedDependencies` in die Manifeste (derzeit **0 von 32**),
dann `createTsmExternals(manifest)` statt der Listenform. Die Listenform
bleibt als „older arrangement" erhalten — inkrementell machbar.

### 3. Kardinalität, Ranking und Dynamik — vollständig, und für gene direkt nutzbar

`cardinality.ts` und `ServiceRegistry` sind fertig: mehrere Provider pro ID
(„same ID are two providers, not one replacing the other"), `ranking`, bei
Gleichstand gewinnt die letzte Registrierung, `optional` als ältere
Schreibweise von `0..1`. Dazu `getServiceReferences(id, target?)` und
LDAP-Filter.

**Und `policy: 'dynamic'` ist implementiert** — an vier Stellen im
`ModuleLoader`, abgedeckt von acht Verwendungen in `ModuleLifecycle.test.ts`:

| Stelle | Was sie tut |
|---|---|
| `:381` | Eine dynamische Anforderung muss zur Aktivierung da sein, ihr späteres Verschwinden reißt das Modul aber nicht ab |
| `:473` | Provider-Wechsel bei `greedy` wird als Paar `onServiceUnbound`/`onServiceBound` gemeldet, ohne Neubau |
| `:526–545` | Mengenänderung erkennen (Provider-Zählung vorher/nachher) und die Hooks feuern |
| `:572–576` | Ausgangszählung beim Laden, damit ein bei Aktivierung vorhandener Provider nicht als „neu" gemeldet wird |

Der Konsument bekommt `onServiceBound(context, serviceId)` bzw.
`onServiceUnbound(...)` als Lifecycle-Hooks; wirft ein Hook, bleibt das Modul
aktiv („A failing hook must not stop the cascade").

Der für gene entscheidende Test ist
`should notify a dynamic collector when the set grows or shrinks`: ein
Konsument mit `cardinality: '0..n', policy: 'dynamic'` wird über Zu- und
Abgänge benachrichtigt und **bleibt dabei aktiv**
(`expect(loader.getModule('palette')?.state).toBe('active')`). Genau die
Semantik, die gene's Registries brauchen. Ergänzend zeigt
`should let a collector enumerate providers without instantiating them`, dass
das Einsammeln ohne Instanziierung geht.

**Korrektur:** Eine frühere Fassung dieses Dokuments stufte die
Registry-Migration als „erst wenn Dynamik implementiert ist" ein. Das beruhte
auf dem Kommentar in `types.ts:122` — „*Only 'static' is implemented;
'dynamic' is accepted and behaves as 'static'*" — der nicht mehr stimmt. Diese
Blockade existiert nicht.

Was gene heute stattdessen tut: 75 `services.register`-Aufrufe, jede ID genau
einmal. Der 0..n-Bedarf wird außerhalb der Registry gelöst — drei
handgeschriebene Registries (`PanelRegistry`, `PerspectiveRegistry`,
`ActivityRegistry`) plus `iconProviderRegistry`, jeweils hinter *einer*
Service-ID, mit Vue-`reactive` als Änderungsmelder. Das ist die Menge, die
`0..n` + `dynamic` ersetzen kann.

**Aufwand:** je Registry die Provider-Seite auf `services.register(id, …)`
umstellen und die Konsumenten von `registry.getAll()` auf
`getServiceReferences()` plus `onServiceBound`/`onServiceUnbound`. Kein Big
Bang nötig — eine Registry als Pilot reicht, um das Muster zu prüfen.
Bezugspunkt: `PanelRegistryImpl` ist 60 Zeilen.

## Was der neue TSM in gene aufdeckt

Er validiert mehr und meldet dabei **19 Warnungen** beim Start — keine
Fehler, die App bootet:

**Drei Manifeste deklarieren Services, die sie nicht registrieren:**

```
Module ui-search declared service(s) it did not register: ui.search
Module ui-problems-panel declared … : ui.problems-panel
Module icons-cwm declared … : icons.cwm
```

Deckungsgleich mit dem, was eine manuelle Prüfung ergab: 23 von 26
Manifesten stimmen, drei nicht (`ui-search` deklariert `ui.search`,
registriert aber `ui.search.components`).

**Elf deklarierte Exports existieren nicht** — `./components` und
`./composables` bei `ui-layout`, `ui-workspace`, `instance-builder`;
`./adapter` bei den drei Storage-Plugins; `./registry` bei `storage-core`;
`./devtools` bei `tsm-devtools`. Nur 9 von 32 Manifesten deklarieren
überhaupt `exports`.

Das sind **vorbestehende Ungenauigkeiten**, die bisher niemand bemerkte.
Sie sind harmlos, solange `provides`/`exports` reine Dokumentation sind —
und genau das sind sie in gene: der Resolver arbeitet auf Modul-IDs aus
`dependencies`, nicht auf Service-Providern.

Sobald service-basierte Resolver-Kanten kommen, werden diese Angaben
tragend. **Dann müssen die 14 Abweichungen vorher bereinigt werden** —
sonst startet ein Konsument mit unvollständiger Menge oder gar nicht.

## Empfehlung

| Schritt | Aufwand | Wann |
|---|---|---|
| Nichts tun — gene läuft | – | Migration ist wahlfrei |
| Die 14 Manifest-Abweichungen bereinigen | klein, mechanisch | **zuerst**, unabhängig vom Rest; macht die Warnungen leer und ist Voraussetzung für alles Weitere |
| `whenAvailable()` für die zwei Poll-Schleifen | wenige Zeilen | danach; sofortiger Gewinn |
| `sharedDependencies` in die Manifeste + `createTsmExternals(manifest)` | 32 Manifeste, ein Build-Skript | danach; verhindert die Fehlerklasse aus PR #121 |
| Eine eigene Registry als Pilot auf `0..n` + `dynamic` umziehen | mittel | jederzeit möglich — Dynamik ist implementiert und getestet |

Die Version im Repo (`0.0.1-next.1`) hängt hinter der publizierten
(`next: 0.0.1-next.2`) — wie bei `@emfts/core` wird das Versionsfeld nicht
je Commit gepflegt. Für einen `file:`-Test irrelevant, für eine
Umstellung auf die Registry muss erst publiziert werden.
