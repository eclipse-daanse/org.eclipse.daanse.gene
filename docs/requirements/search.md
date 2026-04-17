# Entwickler-Prompt: Volltextsuche (TypeScript)

## Prompt für den TypeScript-Entwickler

Du arbeitest an einem UI-Programm (Dynamic Model Editor) basierend auf einer TypeScript-Variante von EMF (Ecore-like Metamodell, Objekte/Instanzen, Attribute, Referenzen, Container-Hierarchie, Perspektiven/Views).

---

## Ziel

Baue eine **Volltextsuche** über alle im Editor vorhandenen **Instanzen (EObjects)** ein. Nutzer sollen mit einem **Suchfeld** suchen können und Ergebnisse in einer **Result-Liste** in einem **Overlay/Dialog** sehen (UI-Details frei wählbar, z.B. Command Palette Style oder Modal).

---

## Kontext: Dynamic Model Editor

- Nutzer können beliebige Objektinstanzen anlegen/ändern/löschen
- Das Modell hat eine Baum-/Containment-Struktur (Container/Child)
- Das UI besitzt das Konzept einer **Perspective** (z.B. bestimmte Teilbäume/Objekttypen/Features sichtbar oder gefiltert)

---

## Einheitlicher Such-/Filterdialog

Der Dialog wird für **zwei Anwendungsfälle** verwendet:

1. **Allgemeine Instanzsuche**: Finden von Objekten im Projekt
2. **Referenzauswahl**: Auswahl von Zielobjekten beim Setzen einer Referenz

---

## Suchmodi (2 Modi)

Implementiere zwei Suchmodi:

### 1. Perspective Search (Scoped)

- Suche nur in Objekten/Features, die in der aktuellen **Perspective sichtbar/aktiv** sind
- Wenn die Perspective z.B. Teile des Modells ausblendet, werden diese nicht durchsucht

### 2. Global Search (Full)

- Suche über **alle Instanzen im gesamten Modell**, unabhängig von der aktuellen Perspective
- Wenn ein Treffer außerhalb der aktuellen Perspective liegt, soll die UI beim Auswählen des Treffers optional die **Perspective wechseln oder anpassen**, sodass das Objekt sichtbar/navigierbar wird

Der Nutzer muss im Overlay die Auswahl haben:
- Suchmodus: Scoped (Perspective) vs. Full (Global)
- Verhalten beim Auswählen eines globalen Treffers:
  - Nur anzeigen (ohne Perspective-Wechsel) **oder**
  - Zu Treffer wechseln (inkl. Perspective-Wechsel/Anpassung)

---

## Filter-Optionen

### Klassenfilter

- Dropdown mit allen verfügbaren Klassen
- Option: **"Inkl. Unterklassen"** (Default: Ja)
- Mehrfachauswahl möglich

### Container-Filter (Breadcrumb)

- Navigation durch Container-Hierarchie
- Einschränkung auf bestimmten Teilbaum

### OCL-Filter

- **Manuelle Eingabe**: Nutzer schreibt OCL-Statement als zusätzlicher Filter
- **Aus Referenz-Constraint übernehmen**: Bei Referenzauswahl kann der vordefinierte OCL-Filter automatisch angewendet werden
- **Verhalten für gefilterte Objekte**:
  - **Ausblenden**: Objekte, die nicht zum Filter passen, werden nicht angezeigt
  - **Ausgrauen**: Objekte sind sichtbar, aber nicht auswählbar (mit Tooltip für Grund)

---

## Was wird durchsucht

**Volltextsuche in allen "Values":**

- Alle **Attribute-Werte** (Strings, Numbers, Booleans, Enums → als String repräsentiert)
- Alle **Referenzwerte**, soweit sinnvoll darstellbar:
  - containment-references: nicht doppelt als Text aufnehmen, aber Traversal muss erfolgen
  - non-containment references: für Textsuche einen "Label"-String verwenden (z.B. name/id/title des Zielobjekts oder fallback: Klassenname)

---

## Ergebnisdarstellung (Result-Liste)

Jeder Treffer in der Ergebnisliste soll enthalten:

### 1. Snippet / Preview

- Zeige den gefundenen Suchbegriff mit **ein paar Zeichen links und rechts** (z.B. 20–40 chars Kontext)
- Beispiel: `"...abc <MATCH> def..."` (Markierung im UI optional)

### 2. Objekt, das den Wert hält

- Zeige Objekt-Label: z.B. `ClassName[name]` oder `ClassName[id]` oder fallback `ClassName`

### 3. Breadcrumb der Container

- Zeige den Pfad von Root → … → Container → Objekt
- basierend auf container-Kette (eContainer-Äquivalent)
- Breadcrumb muss in der Result-Liste sichtbar sein (z.B. kleine, graue Zeile)

### 4. Optional: Feature-Info

- Welches Feature matchte: attributeName oder referenceName
- Falls mehrere Matches pro Objekt: entweder mehrere Trefferzeilen oder Aggregation (Entscheidung frei, aber konsistent)

---

## Verhalten bei Auswahl eines Treffers

Wenn der Nutzer einen Treffer auswählt:

- Editor soll zum Objekt navigieren / selektieren / fokusieren (je nach UI-Konzept)

### Bei Scoped Search

- Objekt ist garantiert in Perspective sichtbar → nur navigieren

### Bei Global Search

Wenn Objekt in aktueller Perspective nicht sichtbar ist:
- **Variante A**: Treffer anzeigen ohne Navigation (z.B. Hinweis "nicht sichtbar in aktueller Perspective")
- **Variante B**: "Switch/Adjust Perspective" ausführen und dann navigieren (das ist die zweite Option, die der Nutzer im Overlay wählen kann)

### Bei Referenzauswahl

- Auswahl eines Treffers → Referenz wird gesetzt
- Durch OCL ausgefilterte (ausgegraute) Objekte → Nicht auswählbar, Tooltip zeigt Grund

---

## Technische Anforderungen

### Performance

- Implementiere die Suche so, dass sie gut reagiert bei mittelgroßen Modellen:
  - Debounce im Suchfeld (z.B. 150–300ms)
  - Abbruch laufender Suche bei neuer Eingabe (Cancellation)

### Modelländerungen

- Bei Create/Update/Delete sollen Suchdaten korrekt sein
- Entweder live traversieren oder einen Index pflegen (du entscheidest; begründe kurz)

### API/Architektur

Liefere eine klare API/Architektur:

```typescript
interface SearchService {
  buildSearchIndex(model: Model, perspective?: Perspective): SearchIndex;
  search(query: string, mode: SearchMode, filters?: SearchFilters): Hit[];
  hitToBreadcrumb(hit: Hit): BreadcrumbItem[];
  navigateToHit(hit: Hit, behavior: NavigationBehavior): void;
}

interface SearchFilters {
  classes?: EClass[];
  includeSubclasses?: boolean;
  containerScope?: EObject;
  oclExpression?: string;
}

interface Hit {
  object: EObject;
  feature: EStructuralFeature;
  snippet: string;
  matchStart: number;
  matchEnd: number;
  breadcrumb: BreadcrumbItem[];
  isFilteredByOcl?: boolean;
  oclFilterReason?: string;
}

interface BreadcrumbItem {
  object: EObject;
  label: string;
}

enum SearchMode {
  PERSPECTIVE = 'perspective',
  GLOBAL = 'global'
}

enum NavigationBehavior {
  NAVIGATE_ONLY = 'navigate_only',
  SWITCH_PERSPECTIVE = 'switch_perspective'
}
```

### Zyklen-Vermeidung

- containment traversal ist baumartig
- bei non-containment refs: nur label text, keine Tiefentraversierung (oder set-based cycle guard)

---

## Definition "Label" für Breadcrumb/Objekt

Wenn möglich:
- bevorzugt Attribute `name`, `id`, `key`, `title`, `label` (in dieser Reihenfolge)
- sonst fallback: Klassenname

---

## Deliverables

Bitte liefere:

1. **Ein Konzept (kurz) für UI/UX des Search Overlay**
   - Dialog-Struktur
   - Filter-Anordnung
   - Ergebnisdarstellung

2. **Datenmodell für Hit** inkl. snippet, feature, objectRef, breadcrumb, oclFilterInfo

3. **TS-Pseudocode oder echte TS-Skizze für:**
   - Traversal/Indexing
   - Query-Matching + Snippet-Erzeugung
   - Breadcrumb-Building
   - OCL-Filter-Anwendung
   - Navigation + optionaler Perspective-Wechsel

4. **Hinweise zu Performance und Edge Cases**
   - Große Modelle
   - Schnelle Eingabe
   - Fehlerhafte OCL-Ausdrücke
   - Leere Ergebnisse

---

## Beispiel: Hit-Struktur + Snippet-Funktion

```typescript
interface Hit {
  object: EObject;
  feature: EStructuralFeature;
  value: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
  breadcrumb: BreadcrumbItem[];
  isFilteredByOcl: boolean;
  oclFilterReason?: string;
}

function createSnippet(value: string, matchStart: number, matchEnd: number, contextLength: number = 30): string {
  const start = Math.max(0, matchStart - contextLength);
  const end = Math.min(value.length, matchEnd + contextLength);

  let snippet = value.substring(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < value.length) snippet = snippet + '...';

  return snippet;
}

function buildBreadcrumb(object: EObject): BreadcrumbItem[] {
  const breadcrumb: BreadcrumbItem[] = [];
  let current: EObject | null = object;

  while (current !== null) {
    breadcrumb.unshift({
      object: current,
      label: getLabel(current)
    });
    current = current.eContainer();
  }

  return breadcrumb;
}

function getLabel(object: EObject): string {
  const labelAttributes = ['name', 'id', 'key', 'title', 'label'];

  for (const attr of labelAttributes) {
    const value = object.eGet(attr);
    if (value !== undefined && value !== null && value !== '') {
      return `${object.eClass().name}[${value}]`;
    }
  }

  return object.eClass().name;
}
```

---

## OCL-Filter Integration

```typescript
interface OclFilterResult {
  passes: boolean;
  reason?: string;
}

async function applyOclFilter(
  object: EObject,
  oclExpression: string,
  context: EObject
): Promise<OclFilterResult> {
  try {
    const result = await evaluateOcl(oclExpression, object, { self: context, target: object });
    return {
      passes: result === true,
      reason: result === true ? undefined : `OCL-Constraint nicht erfüllt: ${oclExpression}`
    };
  } catch (error) {
    return {
      passes: true, // Bei Fehlern: Objekt anzeigen, aber warnen
      reason: `OCL-Fehler: ${error.message}`
    };
  }
}
```
