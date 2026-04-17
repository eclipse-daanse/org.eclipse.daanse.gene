# TSM Library Sharing

TSM (TypeScript Module System) ermöglicht das Teilen von Bibliotheken zwischen Modulen zur Laufzeit. Dies vermeidet das mehrfache Bundeln großer Bibliotheken wie Vue oder PrimeVue.

## Konzept

Ein **Library Provider** Modul (z.B. `gene-app`) bundelt Bibliotheken und exportiert sie als Namespaces. Andere Module können diese dann über `tsm:` Imports nutzen.

```
┌─────────────────┐     tsm:gene-app/vue      ┌─────────────────┐
│   gene-app      │ ◄─────────────────────────│   ui-workspace  │
│  (bundelt Vue,  │                           │  (nutzt Vue)    │
│   PrimeVue)     │ ◄─────────────────────────│                 │
└─────────────────┘     tsm:gene-app/primevue └─────────────────┘
```

## Library Provider einrichten

### 1. Library-Dateien erstellen

```typescript
// packages/app/src/libs/vue.ts
export * from 'vue'

// packages/app/src/libs/primevue.ts
export * from 'primevue'
```

### 2. Libraries im Index exportieren

```typescript
// packages/app/src/index.ts
export * as vue from './libs/vue'
export * as primevue from './libs/primevue'
```

### 3. Manifest konfigurieren

```json
{
  "id": "gene-app",
  "libraries": {
    "vue": {
      "package": "vue",
      "version": "^3.5.26"
    },
    "primevue": {
      "package": "primevue",
      "version": "^4.3.3"
    }
  },
  "priority": 1000
}
```

**Wichtig:** Der Library Provider sollte eine hohe `priority` haben, damit er vor anderen Modulen geladen wird.

## Libraries nutzen

### 1. tsm: Import verwenden

```typescript
// In anderen Modulen
import { ref, computed, watch } from 'tsm:gene-app/vue'
import { Tree, Button, ContextMenu } from 'tsm:gene-app/primevue'
```

### 2. Dependency deklarieren

```json
{
  "id": "ui-workspace",
  "dependencies": ["gene-app"]
}
```

## Build-Konfiguration

### Vite Plugin

Das `tsmPlugin` transformiert `tsm:` Imports zu `__tsm__.require()` Aufrufen:

```typescript
// vite.config.ts
import { tsmPlugin } from 'tsm/vite'

export default defineConfig({
  plugins: [tsmPlugin()]
})
```

### External-Konfiguration

Library Provider bundeln ihre Bibliotheken, andere Module markieren sie als external:

```typescript
import { createTsmExternals } from 'tsm/vite'

// In build config
rollupOptions: {
  external: createTsmExternals('ui-workspace', {
    libraryProviders: ['my-app'],
    sharedPackages: ['primevue', '@primevue', 'primeicons']
  })
}
```

Dies bewirkt:
- `gene-app`: Bundelt Vue, PrimeVue, etc.
- Andere Module: Vue, PrimeVue sind external → werden von gene-app geladen

## Import-Syntax

### Named Imports

```typescript
import { ref, computed } from 'tsm:gene-app/vue'
// → const { ref, computed } = __tsm__.require('gene-app', 'vue')
```

### Aliased Imports

```typescript
import { ref as vueRef } from 'tsm:gene-app/vue'
// → const { ref: vueRef } = __tsm__.require('gene-app', 'vue')
```

### Namespace Imports

```typescript
import * as Vue from 'tsm:gene-app/vue'
// → const Vue = __tsm__.require('gene-app', 'vue')
```

## CSS Handling

CSS-Dateien werden automatisch extrahiert und ein Loader wird injiziert:

```javascript
// Generierter Code am Anfang des Bundles
(function(){
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = '/plugins/gene-app/gene.css';
  document.head.appendChild(l);
})();
```

## Production Build

```bash
# 1. Haupt-App bauen
npm run build-only

# 2. Plugins bauen
npx tsx scripts/build-plugins.ts
```

Die Plugins werden nach `dist/plugins/` gebaut mit:
- `index.json` - Modul-Liste
- `{module-id}/manifest.json` - Modul-Manifest
- `{module-id}/src/index.js` - Modul-Code
- `{module-id}/*.css` - Extrahiertes CSS (falls vorhanden)

## Dateien

| Datei | Beschreibung |
|-------|--------------|
| `tsm/vite` (npm) | Vite Plugin für tsm: Imports |
| `src/vite/importmap-plugin.ts` | Import Map Generator (projekt-spezifisch) |
| `scripts/build-plugins.ts` | Plugin Build Script |
| `packages/app/src/libs/` | Library Re-Exports |

## Troubleshooting

### Module not loaded

```
Error: Module 'gene-app' is not loaded
```

**Lösung:** Module als Dependency hinzufügen:
```json
{ "dependencies": ["gene-app"] }
```

### CSS not loading

**Lösung:** CSS Loader wird automatisch injiziert. Prüfen ob die CSS-Datei unter `/plugins/{id}/*.css` erreichbar ist.

### Circular dependency

```
gene-app → ui-workspace → gene-app
```

**Lösung:** Library Provider sollte keine Dependencies auf Module haben, die seine Libraries nutzen. Stattdessen `requiresService` mit `optional: true` verwenden.
