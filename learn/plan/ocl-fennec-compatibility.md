# Plan: Gene OCL Kompatibilität mit Fennec OCL Engine

## Kontext

Der [Fennec OCL User Guide](https://github.com/eclipse-fennec/emf.m2x/blob/snapshot/docs/ocl-user-guide.md) definiert die Referenz-API für OCL in Fennec/Gene. Gene nutzt aktuell `ocl-langium` + `ocl-engine` (TypeScript-Ports). Dieser Plan stellt sicher, dass Gene kompatibel zur Java-Referenz ist.

## Analyse: Aktueller Stand vs. Guide

### ✅ Kompatibel
- Expression Evaluation (`self.name.size() > 0`)
- Derived Features via EAnnotation (`derivation` key)
- Operation Bodies via EAnnotation (`body` key)
- Validation Constraints via EAnnotation (invarianten auf EClass)
- Collection-Operationen (Set, Bag, Sequence, OrderedSet)
- Null/Invalid Unterscheidung (OCL_INVALID Symbol)
- Class-Level Annotation Format (`derive_<name>`, `body_<name>`)

### ❌ Inkompatibel / Fehlend

| # | Feature | Guide-Referenz | Aufwand | Priorität |
|---|---------|---------------|---------|-----------|
| 1 | Fennec Delegate URI | `http://www.eclipse.org/fennec/m2x/ocl/1.0` als Annotation-Source | Klein | Hoch |
| 2 | Complete OCL Documents | `parseDocument()`, `loadDocument()`, `.ocl` Dateien | Mittel | Hoch |
| 3 | def: Expressions | Hilfsattribute/-operationen in OCL-Dokumenten | Mittel | Mittel |
| 4 | Expression Cache | LRU Cache für geparste Expressions | Mittel | Mittel |
| 5 | OclEvaluationOptions | strict/lenient, timeout, maxDepth, maxCollectionSize | Klein | Mittel |
| 6 | allInstances() Extent | OclModelExtent für Modell-Scope | Klein | Mittel |
| 7 | Pre/Post Conditions | `pre:`/`post:` auf Operations | Klein | Niedrig |
| 8 | Custom Operations | OclOperationProvider | Mittel | Niedrig |
| 9 | Property Interceptor | BiFunction für custom Property-Auflösung | Klein | Niedrig |
| 10 | warmUp() | Pre-populate Caches | Klein | Niedrig |
| 11 | Security Hardening | maxRegexLength, maxClosureIterations, Sandboxing | Klein | Niedrig |

## Umsetzungsplan

### Phase 1: URI-Kompatibilität (Prio Hoch, ~1h)

**Ziel:** Gene erkennt alle 4 OCL Annotation-Sources.

**Primäre URI:** `http://www.eclipse.org/fennec/m2x/ocl/1.0` (Fennec Standard)
**Legacy-URIs:** `http://www.eclipse.org/emf/2002/Ecore/OCL`, `http://www.eclipse.org/OCL/Pivot` (weiterhin erkannt für Abwärtskompatibilität)
**Entfernt:** `http://www.eclipse.org/emf/2002/OCL` (nicht mehr verwenden)

**Zentrale Hilfsfunktion** in einem neuen Utility-Modul:
```typescript
// packages/ui/problems-panel/src/composables/oclUtils.ts
export const OCL_DELEGATE_URI = 'http://www.eclipse.org/fennec/m2x/ocl/1.0'

export const OCL_ANNOTATION_SOURCES = [
  OCL_DELEGATE_URI,
  'http://www.eclipse.org/emf/2002/Ecore/OCL',
  'http://www.eclipse.org/OCL/Pivot'
] as const

export function isOclAnnotationSource(source: string | null | undefined): boolean {
  return !!source && OCL_ANNOTATION_SOURCES.includes(source as any)
}
```

**Betroffene Dateien** (8 Stück):
- `packages/app/src/App.vue` — `getOclReferenceFilter()`
- `packages/ui/problems-panel/src/composables/useProblemsService.ts` — 7 Stellen
- `packages/ui/properties-panel/src/components/PropertiesPanel.vue` — 2 Stellen
- `packages/ui/instance-builder/src/components/OperationField.vue` — 1 Stelle
- `packages/ui/instance-builder/src/components/DerivedField.vue` — 1 Stelle
- `packages/ui/instance-builder/src/components/InstanceEditor.vue` — 1 Stelle
- `packages/ui/model-browser/src/composables/useModelRegistry.ts` — 1 Stelle

**Vorgehen:** `isOclAnnotationSource()` exportieren und in allen Dateien importieren. Einzelvergleiche `source === '...'` durch `isOclAnnotationSource(source)` ersetzen.

### Phase 2: Complete OCL Documents (Prio Hoch, ~3h)

**Ziel:** `.ocl` Dateien laden und Constraints registrieren.

ocl-langium kann bereits `parseOcl()` auf vollständige OCL-Dokumente anwenden:
```ocl
context Person
  inv nameNotEmpty: self.name.size() > 0
  def: fullName : String = self.firstName + ' ' + self.lastName
```

**Änderungen:**
- `useProblemsService.ts` → neue Methode `loadOclDocument(text: string)`:
  - Parsed via `parseOcl(text)`
  - Registriert `inv:` als Constraints in `allConstraintDocs`
  - Registriert `def:` als derived Expressions in `derivedExpressions`
  - Registriert `derive:` / `init:` / `body:` über PropertyContext/OperationContext
- `App.vue` → `.ocl` Dateien aus Workspace erkennen und laden (neben `.c-ocl`)
- `FileExplorer.vue` → `.ocl` als bekannten Dateityp anzeigen

### Phase 3: Expression Cache (Prio Mittel, blockiert)

**Ziel:** Geparste OCL Expressions cachen statt bei jeder query() neu zu parsen.

**Verantwortung:** ocl-langium Projekt (nicht Gene).
**Feature Request:** `EMFTs/ocl-langium/FEATURE_REQUEST_EXPRESSION_CACHE.md`

Der Cache gehört in die Parser-Schicht (`parseOcl()` / `parseOclExpression()`), nicht in Gene. Gene profitiert automatisch sobald ocl-langium den Cache implementiert.

### Phase 4: Evaluation Options (Prio Mittel, ~1h)

**Ziel:** timeout, maxDepth, strict/lenient an ocl-langium Evaluator weitergeben.

**Änderungen:**
- `query()` und `validateObject()` akzeptieren optionale Options
- Mapping auf `EvalOptions` von ocl-langium
- Default-Options konfigurierbar über EditorConfig oder TSM Service

### Phase 5: allInstances() Extent (Prio Mittel, ~1h)

**Ziel:** `allInstances()` gibt alle Objekte der Resource zurück.

**Änderungen:**
- `validateObject()` und `query()` sammeln alle EObjects aus der aktiven Resource
- Übergabe als `variables.allInstances` oder als Environment-Erweiterung an den Evaluator
- ocl-langium Evaluator muss `Type.allInstances()` unterstützen (prüfen)

### Phase 6: Weitere Features (Prio Niedrig, je ~1-2h)

- **def: Expressions** — aus Complete OCL Dokumenten als computed properties registrieren
- **Pre/Post Conditions** — Log-Ausgabe bei Verletzung
- **Custom Operations** — Plugin-basierte OclOperationProvider über TSM DI
- **Security Hardening** — maxCollectionSize, maxClosureIterations als Options

## Architektur-Entscheidungen

| Thema | Entscheidung |
|-------|-------------|
| OCL Source URIs | Zentrale `isOclAnnotationSource()` statt verteilter String-Vergleiche |
| Cache | Einfache Map, kein LRU (Browser hat genug Memory) |
| Complete OCL | Über `parseOcl()` von ocl-langium, nicht eigener Parser |
| def: | Als `derivedExpressions` Map registriert, query() evaluiert |
| Options | Optionales zweites Argument an query()/validate() |
| allInstances | Aus aktiver Resource/ResourceSet gesammelt |

## Verifikation

1. company.ecore (Feature-Level OCL) → derived fields + operations funktionieren
2. university.ecore (Class-Level OCL) → derive_/body_ Format funktioniert
3. `.ocl` Datei mit inv + def → Constraints validieren, def-Properties abrufbar
4. Fennec-URI `http://www.eclipse.org/fennec/m2x/ocl/1.0` → wird erkannt
5. Expression Cache → zweite Auswertung deutlich schneller
6. Timeout → Endlos-OCL wird abgebrochen
