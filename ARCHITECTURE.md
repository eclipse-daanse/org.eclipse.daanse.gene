# Gene – Architektur

> Modularer EMF-basierter Model-Editor, gebaut mit Vue 3, TypeScript und dem TSM Plugin-System.

---

## Schichtenarchitektur (Übersicht)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Layer 7: Application                             │
│                              ┌─────┐                                    │
│                              │ App │                                    │
│                              └──┬──┘                                    │
├─────────────────────────────────┼───────────────────────────────────────┤
│                        Layer 6: Plugins                                 │
│   ┌──────────────┐  ┌───────────────────┐  ┌────────────┐               │
│   │ Metamodeler  │  │ Transformation    │  │ C-OCL      │               │
│   │ (.ecore)     │  │ (QVT-R)           │  │ Editor     │               │
│   └──────┬───────┘  └────────┬──────────┘  └─────┬──────┘               │
│          │                   │                   │                      │
├──────────┼───────────────────┼───────────────────┼──────────────────────┤
│                        Layer 5: UI Components                           │
│                                                                         │
│   ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐             │
│   │ File Explorer │  │ Instance     │  │ Model Browser    │             │
│   │               │  │ Tree         │  │                  │             │
│   └───────────────┘  └──────────────┘  └──────────────────┘             │
│   ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐             │
│   │ Instance      │  │ Properties   │  │ Model View       │             │
│   │ Builder       │  │ Panel        │  │                  │             │
│   └───────────────┘  └──────────────┘  └──────────────────┘             │
│   ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐             │
│   │ Problems      │  │ Search       │  │ Workspace        │             │
│   │ Panel         │  │              │  │                  │             │
│   └───────┬───────┘  └──────┬───────┘  └────────┬─────────┘             │
│           │                 │                   │                       │
├───────────┼─────────────────┼───────────────────┼───────────────────────┤
│                        Layer 4: UI Foundation                           │
│                                                                         │
│   ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐             │
│   │ Layout        │  │ Perspectives │  │ XMI Viewer       │             │
│   │ (VS Code-     │  │ (Panel/      │  │                  │             │
│   │  like Shell)  │  │  Activity    │  │                  │             │
│   │               │  │  Registry)   │  │                  │             │
│   └───────┬───────┘  └──────┬───────┘  └────────┬─────────┘             │
│           │                 │                    │                      │
├───────────┼─────────────────┼────────────────────┼──────────────────────┤
│                        Layer 3: Storage Adapters                        │
│                                                                         │
│              ┌──────────────────┐  ┌──────────────────┐                 │
│              │ IndexedDB        │  │ Git              │                 │
│              │ (Browser-lokal)  │  │ (Versioniert)    │                 │
│              └────────┬─────────┘  └────────┬─────────┘                 │
│                       │                     │                           │
├───────────────────────┼─────────────────────┼───────────────────────────┤
│                        Layer 2: Core Infrastructure                     │
│                                                                         │
│   ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐             │
│   │ Core          │  │ Storage Core │  │ Storage Model    │             │
│   │ (IoC, Plugin  │  │ (Adapter     │  │ (Ecore-basiert)  │             │
│   │  Loader,      │  │  Abstraktion │  │                  │             │
│   │  Extensions)  │  │  & Registry) │  │                  │             │
│   └───────────────┘  └──────────────┘  └──────────────────┘             │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                        Layer 1: Externe Abhängigkeiten                  │
│                                                                         │
│   ┌───────────┐  ┌─────────┐  ┌───────────┐  ┌───────────┐              │
│   │ EMFTs     │  │ TSM     │  │ Vue 3     │  │ PrimeVue  │              │
│   │ (EMF in   │  │ (Modul- │  │           │  │           │              │
│   │ TypeScript│  │ system) │  │           │  │           │              │
│   └───────────┘  └─────────┘  └───────────┘  └───────────┘              │
│   ┌───────────┐  ┌──────────────┐                                       │
│   │ EMFTs-OCL │  │ OCL-Langium  │                                       │
│   │           │  │ (Language    │                                       │
│   │           │  │  Server)     │                                       │
│   └───────────┘  └──────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Komponentenbeschreibung

### Layer 1 – Externe Abhängigkeiten

| Komponente      | Beschreibung                                                          |
|-----------------|-----------------------------------------------------------------------|
| **EMFTs**       | EMF (Eclipse Modeling Framework) Implementierung in TypeScript        |
| **TSM**         | TypeScript Module System – dynamisches Plugin-Loading mit Dependency Resolution |
| **Vue 3**       | Reaktives UI-Framework                                                |
| **PrimeVue**    | UI-Komponentenbibliothek                                              |
| **EMFTs-OCL**   | OCL Constraint Engine                                                 |
| **OCL-Langium** | OCL Language Server (Parsing, Validierung)                            |

### Layer 2 – Core Infrastructure

| Komponente        | Paket                    | Beschreibung                                                        |
|-------------------|--------------------------|---------------------------------------------------------------------|
| **Core**          | `packages/core`          | IoC-Container (Inversify), Extension Registry, Plugin Loader (Module Federation) |
| **Storage Model** | `packages/storage/model` | Generiertes EMF-Modell aus `storage.ecore` – definiert Storage-Metadaten |
| **Storage Core**  | `packages/storage/core`  | Abstrakte Storage-Schnittstelle, Adapter-Interface und Registry     |

### Layer 3 – Storage Adapters

| Komponente            | Paket                        | Beschreibung                                   |
|-----------------------|------------------------------|-------------------------------------------------|
| **Storage IndexedDB** | `packages/storage/indexeddb` | Browser-lokale persistente Speicherung          |
| **Storage Git**       | `packages/storage/git`       | Git-basiertes Storage-Backend für versionierte Repos |

### Layer 4 – UI Foundation

| Komponente       | Paket                       | Beschreibung                                                            |
|------------------|-----------------------------|-------------------------------------------------------------------------|
| **Layout**       | `packages/ui/layout`        | VS Code-ähnliches Layout mit Sidebar, Editor-Tabs, Activity Bar, Status Bar |
| **Perspectives** | `packages/ui/perspectives`  | Perspektiven-Management (Explorer, Model Editor, Metamodeler) mit Panel- und Activity-Registry |
| **XMI Viewer**   | `packages/ui/xmi-viewer`    | XMI/XML-Dateianzeige mit Syntax-Highlighting                           |

### Layer 5 – UI Components

| Komponente           | Paket                            | Beschreibung                                          |
|----------------------|----------------------------------|-------------------------------------------------------|
| **File Explorer**    | `packages/ui/file-explorer`      | Dateisystem-Browser für `.ecore`, `.xmi`, `.workspace` Dateien |
| **Instance Tree**    | `packages/ui/instance-tree`      | Baumansicht für EMF-Instanz-Hierarchien mit Drag & Drop |
| **Model Browser**    | `packages/ui/model-browser`      | EPackage/EClass-Browser für geladene Metamodelle      |
| **Instance Builder** | `packages/ui/instance-builder`   | Formular-basierter EMF-Instanz-Editor mit Validierung |
| **Properties Panel** | `packages/ui/properties-panel`   | Eigenschafts-Panel für Attribute und Referenzen       |
| **Model View**       | `packages/ui/model-view`         | Konfigurierbare Views in EMF-Modell-Hierarchien       |
| **Problems Panel**   | `packages/ui/problems-panel`     | Validierungsfehler, Parser-Fehler, OCL-Constraint-Verletzungen |
| **Search**           | `packages/ui/search`             | Volltextsuche über Instanzen und Referenzen           |
| **Workspace**        | `packages/ui/workspace`          | Workspace-UI für `workspace.xmi` Konfiguration        |

### Layer 6 – Plugins

| Komponente         | Paket                             | Beschreibung                                                 |
|--------------------|-----------------------------------|--------------------------------------------------------------|
| **Metamodeler**    | `packages/plugins/metamodeler`    | Visueller Ecore-Metamodell-Editor mit Baum-Editing und OCL   |
| **Transformation** | `packages/plugins/transformation` | QVT-R Transformations-Editor für Modell-zu-Modell-Mappings   |
| **C-OCL Editor**   | `packages/plugins/cocl-editor`    | Constraint-OCL Editor für externe Constraint-Dateien         |
| **Icons Material** | `packages/plugins/icons-material` | Material Design Icon-Set Provider                            |

### Layer 7 – Application

| Komponente | Paket            | Beschreibung                                                     |
|------------|------------------|------------------------------------------------------------------|
| **App**    | `packages/app`   | Vue-Applikations-Shell: bootstrappt TSM, lädt Plugins, stellt `App.vue` bereit |

---

## Datenfluss

```
                    ┌─────────────┐
                    │   Benutzer  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  App Shell  │   Perspektiven-Umschaltung
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Explorer │ │  Model   │ │ Meta-    │
        │ Perspek- │ │  Editor  │ │ modeler  │    ◄── Perspektiven
        │ tive     │ │ Perspek- │ │ Perspek- │
        │          │ │ tive     │ │ tive     │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             ▼            ▼            ▼
        ┌─────────────────────────────────────┐
        │         UI Components               │   Instanz-Editing,
        │  (Tree, Builder, Properties, ...)   │   Validierung,
        └──────────────┬──────────────────────┘   Navigation
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │          EMFTs Runtime               │   Modell-Operationen
        │  (EObject, EPackage, EClass, ...)   │   (CRUD, Validierung)
        └──────────────┬──────────────────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
        ┌──────────┐     ┌──────────┐
        │IndexedDB │     │   Git    │              ◄── Persistenz
        └──────────┘     └──────────┘
```

---

## TSM Plugin-Lifecycle

```
  TSM Bootstrap
       │
       ▼
  ┌────────────┐     ┌────────────┐     ┌────────────┐
  │ Discover   │────▶│ Resolve    │────▶│ Load       │
  │ Plugins    │     │ Deps       │     │ Modules    │
  └────────────┘     └────────────┘     └─────┬──────┘
                                              │
                                              ▼
                                        ┌────────────┐
                                        │ activate() │
                                        │            │
                                        │ • Services │
                                        │   registr. │
                                        │ • Panels   │
                                        │   registr. │
                                        │ • Events   │
                                        │   binden   │
                                        └────────────┘
```

Alle Packages mit TSM-Support exportieren `activate()` und `deactivate()` Funktionen:
1. Services bei der TSM Service-Registry registrieren
2. UI-Komponenten, Panels und Perspektiven registrieren
3. Abhängigkeiten und Event-Listener einrichten
4. Bei Deaktivierung aufräumen

---

## Abhängigkeiten zwischen Packages

```
                          ┌──────────┐
                          │   App    │
                          └────┬─────┘
                               │ nutzt alle
                 ┌─────────────┼─────────────────┐
                 ▼             ▼                  ▼
          ┌────────────┐ ┌──────────┐     ┌─────────────┐
          │Metamodeler │ │Transform.│     │ C-OCL Editor│
          └─────┬──────┘ └────┬─────┘     └──────┬──────┘
                │             │                   │
                ▼             ▼                   ▼
  ┌──────────────────────────────────────────────────────┐
  │                   UI Components                       │
  │                                                       │
  │  Instance Tree ──▶ Model View ──▶ Instance Builder    │
  │       │                               │               │
  │       ▼                               ▼               │
  │  Model Browser            Properties Panel            │
  │       │                               │               │
  │       ▼                               ▼               │
  │  File Explorer             Problems Panel             │
  └───────────────────────┬──────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────┐
  │               UI Foundation                           │
  │    Layout  ◄──  Perspectives  ──▶  XMI Viewer        │
  └───────────────────────┬──────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────┐
  │               Storage                                 │
  │    IndexedDB  ◄──  Storage Core  ──▶  Git            │
  │                        │                              │
  │                  Storage Model                        │
  └───────────────────────┬──────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────┐
  │           Externe Abhängigkeiten                      │
  │   EMFTs   TSM   Vue 3   PrimeVue   EMFTs-OCL        │
  └──────────────────────────────────────────────────────┘
```

---

## Architektur-Patterns

| Pattern                  | Verwendung                                                         |
|--------------------------|--------------------------------------------------------------------|
| **Service Registry**     | TSM stellt globale Service-Registry bereit                         |
| **Plugin Architecture**  | Module werden dynamisch via TSM mit Dependency Resolution geladen  |
| **Perspective-based UI** | Verschiedene Editing-Kontexte mit eigenen Panel-Layouts            |
| **Shared State**         | Composables wie `useSharedPerspective()`, `useSharedInstanceTree()` bieten Singleton-State |
| **Event Bus**            | Globaler Event-Bus für Cross-Module-Kommunikation                  |
| **Context Pattern**      | `EditorContext` trennt Instanz-Editing von Metamodell-Editing      |
| **Registry Pattern**     | `PanelRegistry`, `ActivityRegistry`, `PerspectiveRegistry` für deklarative UI-Registrierung |

---

## Projektstruktur

```
gene/
├── packages/
│   ├── app/                          # App Shell (Vue Entry Point)
│   ├── core/                         # IoC Container, Extensions
│   ├── core-extension/               # Core Extension Points
│   ├── storage/
│   │   ├── model/                    # Storage Metamodell
│   │   ├── core/                     # Storage Abstraktion
│   │   ├── indexeddb/                # IndexedDB Adapter
│   │   └── git/                      # Git Adapter
│   ├── ui/
│   │   ├── layout/                   # VS Code-like Shell
│   │   ├── perspectives/            # Perspektiven-System
│   │   ├── file-explorer/           # Datei-Browser
│   │   ├── instance-tree/           # Instanz-Baum
│   │   ├── instance-builder/        # Instanz-Editor
│   │   ├── model-browser/           # Metamodell-Browser
│   │   ├── model-view/              # Model Views
│   │   ├── properties-panel/        # Eigenschaften
│   │   ├── problems-panel/          # Validierung
│   │   ├── search/                  # Suche
│   │   ├── workspace/               # Workspace-UI
│   │   └── xmi-viewer/              # XMI Anzeige
│   ├── plugins/
│   │   ├── metamodeler/             # Ecore Editor
│   │   ├── transformation/          # QVT-R Editor
│   │   ├── cocl-editor/             # C-OCL Editor
│   │   └── icons-material/          # Material Icons
│   └── tsm-devtools/                # TSM Debug-Tools
├── src/
│   ├── tsm/                         # TSM Plugin-System Integration
│   ├── services/                    # App-Level Services
│   └── router/                      # Vue Router
├── test-data/                       # Demo-Daten
└── vite.config.ts                   # Build-Konfiguration
```
