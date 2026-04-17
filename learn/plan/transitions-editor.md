# Plan: Transitions-Editor Tab mit Dialog

## Ziel
Implementierung eines Editor-Tabs in der Gene Atlas-Perspektive, der die konfigurierten Stage-Transitions eines Registries anzeigt und es ermöglicht, Transitions per Dialog auf ausgewählte Objekte anzuwenden.

---

## 1. Analyse: Wie Transitions im Eclipse-Backend funktionieren

### Datenmodell (`workflow-api.ecore`)
- **StageTransition** EClass mit:
  - `fromStage` (EString) - Quell-Stage
  - `toStage` (EString) - Ziel-Stage
- Transitions sind in `Registry.allowedTransitions` als Containment-Referenz gespeichert

### REST-API Endpoint
```
POST /{scopeName}/registries/{registryName}/stages/{stageName}/actions/transition
```
**Request Body:**
```json
{
  "objectId": "string",
  "targetStage": "string"
}
```
**Response:** Aktualisierte `ObjectMetadata` (200 OK) mit neuem Stage, lastChangeTime etc.

### Validierung
- Beide Stages müssen `writable` sein
- Transition muss in `allowedTransitionsList` konfiguriert sein
- Read-Only Objekte (Parent-Scope) können nicht transitioniert werden (403)

### Post-Transition Actions
- Bei Transition **zu** Final-Stage: `executePostReleaseActions()` (z.B. EPackage-Registrierung)
- Bei Transition **von** Final-Stage: `executePostUnreleaseActions()`

### Konfiguration
```json
{
  "workflow.transitions": ["draft:approved", "approved:release"],
  "delete.after.transition": true,
  "stages": [
    { "name": "draft", "writable": true, "final": false },
    { "name": "approved", "writable": true, "final": false },
    { "name": "release", "writable": true, "final": true }
  ]
}
```

---

## 2. Architektur-Entscheidungen

### Wo wird der Editor registriert?
- Im bestehenden **Atlas-Browser Plugin** (`packages/plugins/atlas-browser/`)
- Als neues Panel im `center`-Bereich der `model-atlas` Perspektive
- Registrierung über `PanelRegistry.register()` in der `activate()` Funktion

### Datenbeschaffung
- Transitions-Konfiguration aus dem Atlas-Server über REST-API laden
- Nutzt bestehenden `ModelAtlasClient` und `useAtlasBrowser` Composable
- Objekt-Listen pro Stage werden bereits im AtlasWorkflowPanel geladen

---

## 3. Implementierungsschritte

### Schritt 1: REST-API Client erweitern
**Datei:** `packages/storage/model-atlas/` (oder `useAtlasBrowser.ts`)

Neue Methoden im ModelAtlasClient:
- `getWorkflowConfig(scope, registry)` - Lädt Stages und erlaubte Transitions
- `transitionObject(scope, registry, stage, objectId, targetStage)` - Führt Transition aus

### Schritt 2: Transitions-Editor Komponente erstellen
**Neue Datei:** `packages/plugins/atlas-browser/src/components/AtlasTransitionsEditor.vue`

**UI-Elemente:**
- **Header:** Registry-Name + aktuelle Verbindung
- **Stage-Übersicht:** Visualisierung der Stages als horizontale Pipeline/Kanban
  - Jede Stage zeigt Anzahl der Objekte
  - Pfeile zwischen Stages zeigen erlaubte Transitions
- **Objekt-Tabelle pro Stage:** DataTable mit:
  - ObjectId, ObjectName, Version, LastChangeTime
  - Button "Transition" (nur wenn erlaubte Transition existiert)
- **Aktionsleiste:** Refresh-Button, Filter

### Schritt 3: Transition-Dialog erstellen
**Neue Datei:** `packages/plugins/atlas-browser/src/components/TransitionDialog.vue`

**Dialog-Inhalt:**
- **Objekt-Info:** Name, ID, aktueller Stage
- **Ziel-Stage Auswahl:** Dropdown mit erlaubten Ziel-Stages (gefiltert nach aktueller Stage)
- **Bestätigung:** "Transition ausführen" Button
- **Optionale Felder:**
  - Release Notes (bei Transition zu Final-Stage)
  - Kommentar
- **Feedback:** Erfolgs-/Fehler-Meldung nach Ausführung (Toast)

### Schritt 4: Panel-Registrierung
**Datei:** `packages/plugins/atlas-browser/src/index.ts`

```typescript
panelRegistry.register({
  id: 'atlas-transitions',
  title: 'Transitions',
  icon: 'pi pi-arrow-right-arrow-left',
  component: markRaw(AtlasTransitionsEditor),
  perspectives: ['model-atlas'],
  defaultLocation: 'center',
  defaultOrder: 40
})
```

Default-Layout der `model-atlas` Perspektive erweitern:
```typescript
defaultLayout: {
  center: ['atlas-detail', 'atlas-graph', 'atlas-xml', 'atlas-explorer', 'atlas-transitions'],
}
```

### Schritt 5: Integration mit bestehendem Atlas-Browser
- Bei Selektion eines Registry-Knotens im Tree → Transitions-Tab öffnen/aktualisieren
- Nach erfolgreicher Transition → Tree und Workflow-Panel refreshen
- Event-Bus oder Service-Kommunikation für Cross-Component Updates

---

## 4. Komponenten-Hierarchie

```
AtlasTransitionsEditor.vue
├── Stage-Pipeline (visuelle Darstellung)
│   ├── StageCard (pro Stage)
│   └── TransitionArrow (pro erlaubte Transition)
├── DataTable (Objekte im ausgewählten Stage)
│   └── Transition-Button pro Zeile
└── TransitionDialog.vue (modal)
    ├── Objekt-Details
    ├── Ziel-Stage Dropdown
    ├── Release Notes (optional)
    └── Ausführen-Button
```

---

## 5. Datenfluss

```
1. User wählt Registry im Atlas-Tree
2. AtlasTransitionsEditor lädt:
   a) Workflow-Config (Stages + Transitions)
   b) Objekt-Listen pro Stage
3. User klickt "Transition" bei einem Objekt
4. TransitionDialog öffnet sich:
   a) Zeigt Objekt-Info
   b) Bietet erlaubte Ziel-Stages an
5. User wählt Ziel-Stage und bestätigt
6. REST-Call: POST .../actions/transition
7. Bei Erfolg:
   a) Toast-Meldung
   b) Objekt-Listen neu laden
   c) Tree-Refresh triggern
8. Bei Fehler:
   a) Fehlermeldung im Dialog anzeigen
```

---

## 6. Dateien die erstellt/geändert werden

### Neue Dateien
| Datei | Beschreibung |
|-------|-------------|
| `packages/plugins/atlas-browser/src/components/AtlasTransitionsEditor.vue` | Hauptkomponente des Editors |
| `packages/plugins/atlas-browser/src/components/TransitionDialog.vue` | Bestätigungs-Dialog |

### Zu ändernde Dateien
| Datei | Änderung |
|-------|----------|
| `packages/plugins/atlas-browser/src/index.ts` | Panel-Registrierung hinzufügen |
| `packages/plugins/atlas-browser/src/components/index.ts` | Export der neuen Komponenten |
| `packages/plugins/atlas-browser/src/composables/useAtlasBrowser.ts` | Neue Methoden für Transitions-API |
| `packages/storage/model-atlas/` | Client-Methoden für Transition-Endpoint |

---

## 7. Abhängigkeiten & Risiken

- **Atlas-Server muss Workflow-API unterstützen** - REST-Endpoints müssen erreichbar sein
- **Berechtigungen** - Token muss Transition-Berechtigung haben
- **Read-Only Objekte** - UI muss korrekt anzeigen, wenn Transition nicht möglich ist
- **Concurrent Modifications** - Objekt könnte zwischenzeitlich geändert worden sein → Fehlerbehandlung