# Implementierungsplan: Instanzen in mehrere XMI-Dateien speichern

**Datum:** 13. April 2026
**Anforderungsdokument:** `learn/plan/save-multiple-xmis.md`

---

## Kontext

Aktuell speichert Gene Instanzen entweder in eine einzelne XMI-Datei oder pro Root-Objekt eine Datei. Laut Abstimmung mit Stefan (13. April) soll eine OCL-basierte Aufteilungslogik implementiert werden, die Instanzen regelbasiert auf mehrere Dateien verteilt. Zusätzlich wird ein "Export als XMI" für den Gesamt-Export benötigt.

---

## Ist-Zustand

- **`StorageLocationRule`** existiert bereits im Ecore-Modell mit: `targetTypeUri`, `scope`, `fileNamePattern`, `condition` (OCL), `priority`, `enabled`, `folderPath`, `pathBindings`
- **`SaveInstancesDialog`** unterstützt `single-file` und `file-per-entity`
- **`StorageStrategy`** ist ein TS-Union-Typ: `'single-file' | 'file-per-entity'`
- **OCL-Engine** ist vorhanden (`query(obj, expression)` in `useProblemsService`)
- **Lade-Logik** lädt bereits alle `instanceSources` aus der EditorConfig

---

## Schritt 1: Ecore-Modell erweitern

**Datei:** `learn/fennec-generic-ui.ecore`

- `StorageLocationRule`: Neues Attribut **`fileNameOclExpression: EString`** — OCL-Ausdruck der den Dateinamen liefert (z.B. `self.name.concat('.xmi')`). Hat Vorrang vor `fileNamePattern`.
- `EditorConfig`: Neues Attribut **`fallbackFileName: EString`** (Default: `rest.xmi`) — Dateiname für nicht gematchte Instanzen.

Danach: Code-Generierung ausführen.

---

## Schritt 2: StorageStrategy erweitern

**Datei:** `packages/ui/perspectives/src/registry/types.ts`

```typescript
export type StorageStrategy = 'single-file' | 'file-per-entity' | 'rule-based'
```

---

## Schritt 3: useEditorConfig erweitern

**Datei:** `src/services/useEditorConfig.ts`

- Computed Properties für `storageLocationRules` und `fallbackFileName` (getter/setter)
- CRUD-Methoden: `addStorageLocationRule()`, `removeStorageLocationRule()`

---

## Schritt 4: Neuer Service — `useStorageRuleResolver`

**Neue Datei:** `packages/ui/layout/src/composables/useStorageRuleResolver.ts`

Kerntypen:
```typescript
interface ResolvedAssignment {
  obj: EObject
  targetFile: string            // z.B. "instances/Person_Max.xmi"
  rule: StorageLocationRule | null  // null = Fallback
}
```

**Algorithmus `resolveAll(objects, rules, fallbackFile)`:**
1. Regeln nach `priority` sortieren (höchste zuerst), nur `enabled === true`
2. Pro Objekt:
   - Typ-URI prüfen gegen `targetTypeUri` (mit `scope: TYPE_AND_SUBTYPES` Beachtung)
   - Falls `condition` gesetzt: OCL auswerten, muss `true` ergeben
   - Erste passende Regel bestimmt Dateiname:
     - `fileNameOclExpression` gesetzt → OCL auswerten → Ergebnis = Dateiname
     - Sonst → `fileNamePattern` mit Placeholder-Ersetzung (`pathBindings`)
   - `folderPath` voranstellen
3. Nicht gematchte Objekte → `fallbackFile`

**Nutzt:** OCL-Service aus `useProblemsService` via TSM.

---

## Schritt 5: SaveInstancesDialog erweitern

**Datei:** `packages/ui/layout/src/components/SaveInstancesDialog.vue`

- Dritte Option im Strategy-Dropdown: `'rule-based'` ("Regelbasiert (OCL)")
- Neuer UI-Bereich für `rule-based`:
  - DataTable: Typ | Name | Ziel-Datei (berechnet) | Regel-Name
  - Fallback-Dateiname-Feld (editierbar)
  - "Vorschau"-Button → ruft `previewAssignments()` auf
  - Manuelle Override-Möglichkeit: Ziel-Datei-Spalte editierbar
  - Fallback-Objekte visuell hervorgehoben
- Speicher-Logik (`handleSave`):
  - Objekte nach Ziel-Datei gruppieren
  - `serializeInstances(objects)` pro Gruppe
  - Bestehenden `createAndWriteFile()`-Code wiederverwenden
  - Alle erzeugten Dateien als `instanceSources` registrieren

---

## Schritt 6: WorkspaceSettingsDialog — Regel-Editor

**Datei:** `packages/ui/layout/src/components/WorkspaceSettingsDialog.vue`

- Neuer Abschnitt "Storage Location Rules":
  - Tabelle: targetTypeUri (Dropdown geladener EClasses), fileNamePattern, fileNameOclExpression, condition, priority, scope, enabled
  - Add/Remove Buttons
  - Fallback-Dateiname

---

## Schritt 7: Export als XMI

- Neuer `InternalAction`-Handler: `'export-all-xmi'`
- Ruft `serializeAllInstances()` auf, bietet Ergebnis als Download an
- Menü-Integration als Toolbar-Button oder Kontextmenü-Eintrag

---

## Schritt 8: Lade-Logik prüfen

**Datei:** `packages/app/src/App.vue` — `loadInstancesFromEditorConfig()`

- Funktioniert bereits, da Schritt 5 alle Dateien als `instanceSources` registriert
- Verbesserung: `setObjectSourcePath(obj, path)` konsequent für alle geladenen Objekte setzen

---

## Implementierungsreihenfolge

| # | Beschreibung | Abhängigkeiten |
|---|-------------|----------------|
| 1 | Ecore-Modell + Code-Generierung | — |
| 2 | StorageStrategy erweitern | — |
| 3 | useEditorConfig CRUD | Schritt 1 |
| 4 | useStorageRuleResolver | Schritt 1, OCL-Service |
| 5 | SaveInstancesDialog UI | Schritt 2, 3, 4 |
| 6 | WorkspaceSettingsDialog Regel-Editor | Schritt 3 |
| 7 | Export-All-XMI Handler | — |
| 8 | Lade-Logik prüfen | Schritt 5 |

---

## Kritische Dateien

- `learn/fennec-generic-ui.ecore` — Modell-Erweiterungen
- `packages/ui/layout/src/components/SaveInstancesDialog.vue` — Haupt-UI
- `packages/ui/layout/src/components/WorkspaceSettingsDialog.vue` — Regel-Editor
- `src/services/useEditorConfig.ts` — Config-CRUD
- `packages/ui/perspectives/src/registry/types.ts` — StorageStrategy-Typ
- `packages/ui/problems-panel/src/composables/useProblemsService.ts` — OCL-Engine
- `packages/ui/instance-tree/src/composables/useInstanceTree.ts` — Serialisierung

## Wiederverwendbare Funktionen

- `serializeInstances(objects[])` — `useInstanceTree.ts` — Mehrere Objekte als XMI
- `getSuggestedFilename(obj)` — `useInstanceTree.ts` — Filename-Vorschlag
- `getObjectSourcePath(obj)` / `setObjectSourcePath()` — Source-Tracking
- `createAndWriteFile()` — `SaveInstancesDialog.vue` — Datei erstellen/schreiben
- OCL `query(obj, expression)` — `useProblemsService.ts` — OCL auswerten

## Offene Punkte

- **Cross-References:** Objekte in verschiedenen Dateien mit gegenseitigen Referenzen brauchen Proxy-URIs in der XMI-Serialisierung (emfts-Thema, ggf. Folgeschritt)
- **OCL-Performance:** Bei vielen Instanzen könnte Batch-Auswertung nötig sein (Expression-Cache existiert bereits)

## Verifizierung

1. Workspace mit StorageLocationRules anlegen (z.B. `Table -> self.name.concat('.xmi')`)
2. Instanzen erstellen, SaveInstancesDialog öffnen, `rule-based` wählen
3. Vorschau prüfen: Instanzen korrekt auf Dateien verteilt, Rest in Fallback-Datei
4. Speichern → Dateien im Filesystem prüfen
5. Workspace neu laden → alle Dateien korrekt geladen
6. "Export als XMI" → alle Instanzen in einer Datei
