# Model View Konzept

## Übersicht

Ein **View** ist ein konfigurierbares Fenster in eine beliebig lange Modell-Hierarchie. Er bestimmt, welcher Teil der Kette sichtbar und bearbeitbar ist.

## Modell-Hierarchie

Modelle bilden eine Kette von Meta-Ebenen:

```
Ebene 0:  Ecore.ecore (Meta-Meta-Modell)
              ↓ instanceOf
Ebene 1:  Meta1.ecore
              ↓ instanceOf
Ebene 2:  Meta2.ecore
              ↓ instanceOf
    ...       ↓ instanceOf
Ebene N:  data.xmi (Instanzen)
```

**Jede Ebene ist eine Instanz der darüberliegenden Ebene.**

### Konkretes Beispiel

```
Ecore.ecore           ← definiert: EPackage, EClass, EAttribute, EReference
    ↓ instanceOf
University.ecore      ← definiert: Student, Professor, Course, Lecture
    ↓ instanceOf
students.xmi          ← enthält: Max Mustermann, Dr. Schmidt, Informatik 101
```

## View-Konzept

Ein **View** definiert:

1. **Fokus** - Die Ebene die ich primär bearbeite (aus meiner Sicht die "Instanz")
2. **Depth** - Wie viele Ebenen darüber sichtbar sind (der "Kontext")
3. **Filter** - Welche Klassen pro Ebene ein/ausgeblendet werden

### Das Fokus-Prinzip

```
     ┌─────────────────────────┐
     │  Kontext (Metamodell)   │  ← optional sichtbar (depth > 0)
     │  depth Ebenen darüber   │
     ├─────────────────────────┤
     │  ★ FOKUS (Instanz)  ★   │  ← das was ich bearbeite
     └─────────────────────────┘
```

**Immer dasselbe Pattern:**
- Was über dem Fokus liegt = **Metamodell** (definiert die Struktur)
- Der Fokus selbst = **Instanz** (das was ich bearbeite)

### Depth: Sichtbare Ebenen

| Depth | Sichtbarkeit |
|-------|--------------|
| 0 | Nur der Fokus (keine Schema-Infos) |
| 1 | Fokus + direktes Metamodell |
| 2 | Fokus + 2 Ebenen darüber |
| N | Fokus + N Ebenen darüber |

#### Beispiel: Fokus auf `University.ecore`

```
depth: 0                    depth: 1                    depth: 2
─────────────               ─────────────               ─────────────
                                                        📦 Ecore.ecore
                                                          └─ EClass
                                                          └─ EAttribute
                            📦 Ecore.ecore
                              └─ EClass                 📦 Ecore.ecore
                              └─ EAttribute               └─ EClass
                                                          └─ EAttribute
📦 University.ecore ★       📦 University.ecore ★       📦 University.ecore ★
  └─ Student                  └─ Student                  └─ Student
  └─ Professor                └─ Professor                └─ Professor
```

### Filter: Klassen ein/ausblenden

Filter erlauben das Ein-/Ausblenden bestimmter EClasses pro Ebene:

```typescript
filters: {
  "ecore.ecore": {
    hiddenClasses: ["EAnnotation", "EOperation", "EGenericType"]
  },
  "university.ecore": {
    visibleClasses: ["Student", "Professor"]  // nur diese zeigen
  }
}
```

## Datenstruktur

```typescript
interface ModelView {
  /** Eindeutiger Identifier */
  id: string

  /** Anzeigename */
  name: string

  /** URI der Fokus-Resource */
  focusUri: string

  /** Anzahl sichtbarer Ebenen über dem Fokus */
  depth: number

  /** Filter pro Resource-URI */
  filters: {
    [resourceUri: string]: {
      /** Diese Klassen ausblenden */
      hiddenClasses?: string[]
      /** Alternativ: NUR diese Klassen zeigen */
      visibleClasses?: string[]
    }
  }
}
```

## Views als Perspektiven

Views werden als **Perspektiven** gespeichert und können vom User erstellt werden:

```typescript
interface Perspective {
  /** Eindeutiger Identifier */
  id: string

  /** Anzeigename */
  name: string

  /** Icon (PrimeVue Icon-Klasse) */
  icon: string

  /** Die View-Konfiguration */
  view: ModelView

  /** Optional: UI-Layout-Einstellungen */
  layout?: {
    panelSizes?: number[]
    visiblePanels?: string[]
  }
}
```

### Vordefinierte Perspektiven

```typescript
const defaultPerspectives: Perspective[] = [
  {
    id: "metamodeler",
    name: "Metamodeler",
    icon: "pi pi-sitemap",
    view: {
      id: "metamodeler-view",
      name: "Metamodeler View",
      focusUri: "*.ecore",
      depth: 1,
      filters: {
        "ecore.ecore": {
          hiddenClasses: ["EAnnotation", "EGenericType", "ETypeParameter"]
        }
      }
    }
  },
  {
    id: "instance-editor",
    name: "Instance Editor",
    icon: "pi pi-database",
    view: {
      id: "instance-view",
      name: "Instance View",
      focusUri: "*.xmi",
      depth: 1,
      filters: {}
    }
  },
  {
    id: "full-stack",
    name: "Full Stack",
    icon: "pi pi-eye",
    view: {
      id: "full-view",
      name: "Full Stack View",
      focusUri: "*.xmi",
      depth: 99,
      filters: {}
    }
  },
  {
    id: "data-entry",
    name: "Data Entry",
    icon: "pi pi-pencil",
    view: {
      id: "data-view",
      name: "Data Entry View",
      focusUri: "*.xmi",
      depth: 0,
      filters: {}
    }
  }
]
```

## UI-Konzept

### Toolbar

```
┌─────────────────────────────────────────────────────────────────┐
│ Perspective: [Metamodeler ▼]  Depth: [1 ▼]  [⚙ Filter...]      │
│ Focus: university.ecore                      [💾 Save View]     │
└─────────────────────────────────────────────────────────────────┘
```

### Tree mit View-Filter

```
┌─────────────────────────────────────────────────────────────────┐
│ 📦 Ecore.ecore (context, readonly)                              │
│   ├─ EClass                                                     │
│   ├─ EAttribute                                                 │
│   └─ EReference                                                 │
│   ├─ ░░ EAnnotation ░░      ← ausgefiltert (grau/versteckt)     │
│   └─ ░░ EOperation ░░       ← ausgefiltert                      │
│ ─────────────────────────────────────────────                   │
│ 📦 University.ecore ★ (focus, editable)                         │
│   ├─ Student                                                    │
│   │   ├─ name: EString                                          │
│   │   └─ matrikelNr: EInt                                       │
│   └─ Professor                                                  │
│       ├─ name: EString                                          │
│       └─ faculty: EString                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Filter-Dialog

```
┌─────────────────────────────────────────────────────────────────┐
│ Filter Configuration                                      [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📦 Ecore.ecore                                                  │
│   ☑ EClass                                                      │
│   ☑ EAttribute                                                  │
│   ☑ EReference                                                  │
│   ☑ EDataType                                                   │
│   ☐ EAnnotation                                                 │
│   ☐ EOperation                                                  │
│   ☐ EGenericType                                                │
│   ☐ ETypeParameter                                              │
│                                                                 │
│ 📦 University.ecore                                             │
│   ☑ Student                                                     │
│   ☑ Professor                                                   │
│   ☑ Course                                                      │
│   ☐ InternalConfig                                              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Apply]  [Save as View]  │
└─────────────────────────────────────────────────────────────────┘
```

## Architektur-Vereinfachung

### Vorher: Separate Plugins

```
packages/
├─ plugins/
│   └─ metamodeler/           ← eigener Editor
├─ ui/
│   ├─ instance-tree/         ← separater Tree
│   ├─ properties-panel/      ← separates Panel
│   └─ model-browser/
```

### Nachher: Ein Model Editor mit Views

```
packages/
├─ ui/
│   ├─ model-editor/          ← EIN Editor für alles
│   │   ├─ composables/
│   │   │   ├─ useModelView.ts
│   │   │   └─ useModelEditor.ts
│   │   ├─ components/
│   │   │   ├─ ModelTree.vue
│   │   │   ├─ ModelProperties.vue
│   │   │   └─ ViewToolbar.vue
│   │   └─ perspectives/
│   │       ├─ metamodeler.json
│   │       ├─ instance-editor.json
│   │       └─ full-stack.json
│   └─ model-browser/
```

## Implementierung

### useModelView Composable

```typescript
export function useModelView() {
  // Aktuelle View-Konfiguration
  const currentView = ref<ModelView | null>(null)

  // Geladene Ressourcen in der Kette
  const resourceChain = ref<Resource[]>([])

  // Sichtbare Ressourcen basierend auf depth
  const visibleResources = computed(() => {
    if (!currentView.value) return []
    const focusIndex = findFocusIndex()
    const startIndex = Math.max(0, focusIndex - currentView.value.depth)
    return resourceChain.value.slice(startIndex, focusIndex + 1)
  })

  // Gefilterte Tree-Nodes
  const filteredTreeNodes = computed(() => {
    return visibleResources.value.map(res =>
      buildFilteredTree(res, currentView.value?.filters[res.getURI()])
    )
  })

  // View-Operationen
  function setFocus(resourceUri: string) { ... }
  function setDepth(depth: number) { ... }
  function setFilter(resourceUri: string, filter: ClassFilter) { ... }
  function saveAsView(name: string): ModelView { ... }
  function loadView(view: ModelView) { ... }

  return {
    currentView,
    visibleResources,
    filteredTreeNodes,
    setFocus,
    setDepth,
    setFilter,
    saveAsView,
    loadView
  }
}
```

## Vorteile

1. **Einheitliches Konzept** - Ein Editor für alle Anwendungsfälle
2. **Flexibilität** - User können eigene Views erstellen
3. **Wiederverwendung** - Keine Code-Duplikation zwischen Metamodeler und Instance Editor
4. **Erweiterbarkeit** - Neue Perspektiven ohne Code-Änderungen
5. **Konsistente UX** - Gleiche Bedienung für alle Modell-Ebenen

## Offene Fragen

- [ ] Wie werden die Resource-URIs in der Kette aufgelöst?
- [ ] Sollen Filter persistent pro User gespeichert werden?
- [ ] Wie wird readonly vs. editable visuell unterschieden?
- [ ] Keyboard-Shortcuts für View-Wechsel?
