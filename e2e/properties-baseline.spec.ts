/**
 * E2E Test: Properties-Panel Baseline (Phase 0b, docs/concepts/uimodel-properties-plan.md)
 *
 * Friert den IST-Zustand des Property-Views VOR dem UiModel-Umbau ein:
 * 1. Screenshot-Baseline je Element-Typ des Referenzmodells
 *    (test-data/uimodel-baseline/library.ecore + library-instance.xmi)
 * 2. Verhaltens-Tests fuer die Absprungpunkte aus
 *    test-data/uimodel-baseline/interaktions-inventar.md
 *
 * Erst-Aufnahme der Screenshots (nur einmal, gegen den unveraenderten Stand):
 *   npx playwright test e2e/properties-baseline.spec.ts --update-snapshots
 * Nachher-Abgleich (Flag an, Composer-Pfad):
 *   npx playwright test e2e/properties-baseline.spec.ts
 *
 * Die Testdaten werden direkt aus test-data/ geladen — der Vite-Dev-Server
 * liefert Dateien unterhalb des Projekt-Roots auch im Dev-Modus aus.
 */

import { test, expect, type Page, type Locator } from '@playwright/test'
import { waitForAppReady, loadEcoreModel, loadInstances } from './helpers'

const ECORE_PATH = '/test-data/uimodel-baseline/library.ecore'
const XMI_PATH = '/test-data/uimodel-baseline/library-instance.xmi'

/**
 * Model-Editor-Perspektive oeffnen und Referenzmodell + Instanz laden
 * (gleicher Aufbau wie instance-move.spec.ts).
 */
// Nachher-Abgleich (Plan 6.4): UIMODEL_FLAG=true laesst dieselbe Suite gegen
// den Composer-Pfad laufen — gleiche Selektoren, gleiche Screenshots.
// Default 'false' = alter Pfad (B2-Garantie), da das App-Default seit
// Phase 4 "an" ist.
const UIMODEL_FLAG = process.env.UIMODEL_FLAG === 'true' ? 'true' : 'false'

async function setupBaseline(page: Page): Promise<void> {
  await page.addInitScript((flag: string) => {
    localStorage.setItem('gene.uimodelProperties', flag)
  }, UIMODEL_FLAG)
  await waitForAppReady(page)

  // WICHTIG: openWorkspace rendert die Perspektive genau einmal — Panels, die
  // zu diesem Zeitpunkt noch nicht in ui.registry.panels registriert sind
  // (Plugin-Bootstrap laeuft asynchron), fehlen dauerhaft. Deshalb erst warten,
  // bis alle Panels der model-editor-Perspektive registriert sind.
  await page.waitForFunction(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    const pm = tsm?.getService?.('ui.registry.perspectives')
    const pr = tsm?.getService?.('ui.registry.panels')
    return !!(pm && pr?.get?.('instance-tree') && pr?.get?.('properties') && pr?.get?.('model-browser'))
  }, undefined, { timeout: 60_000 })

  await page.evaluate(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    tsm.getService('ui.registry.perspectives').openWorkspace({}, '/e2e-test/workspace.xmi', 'model-editor')
  })
  await page.waitForTimeout(1500)

  // Sicherheitsnetz gegen verbleibende Races: Perspektive einmal erneut
  // oeffnen, falls das Properties-Panel nicht erschienen ist.
  if (await page.locator('.properties-panel').count() === 0) {
    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      tsm.getService('ui.registry.perspectives').openWorkspace({}, '/e2e-test/workspace.xmi', 'model-editor')
    })
    await page.waitForTimeout(1500)
  }

  await loadEcoreModel(page, ECORE_PATH)
  await page.waitForTimeout(300)
  await loadInstances(page, XMI_PATH)
  await page.waitForTimeout(800)
}

/**
 * Objekt deterministisch ueber seine xmi:id im Instance-Tree selektieren.
 * Nutzt dieselben TSM-Services wie die App (kein UI-Klick noetig, stabil
 * gegenueber Label-/Layout-Aenderungen im Baum).
 */
async function selectByXmiId(page: Page, xmiId: string, requiredText?: string): Promise<void> {
  // Selektion kann verpuffen, wenn sie feuert, bevor das Properties-Panel
  // seine Subscription aufgebaut hat ("No object selected" trotz markiertem
  // Baum-Knoten). Deshalb: selektieren und verifizieren, dass das Panel die
  // xmi:id anzeigt — sonst erneut selektieren.
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.evaluate((id) => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      const comp = tsm?.getService('ui.instance-tree.composables')
      const tree = comp?.useSharedInstanceTree?.()
      if (!tree) throw new Error('Instance tree not available')

      let found: any = null
      const visit = (obj: any) => {
        if (found) return
        if (comp.getXmiId(obj) === id) { found = obj; return }
        for (const f of obj.eClass().getEAllContainments()) {
          const v = obj.eGet(f)
          if (!v) continue
          if (f.isMany()) { for (const c of v) visit(c) } else visit(v)
        }
      }
      for (const root of Array.from(tree.getRootObjects())) visit(root)
      if (!found) throw new Error('Object with xmi:id not found: ' + id)
      // Erst abwaehlen, damit ein erneuter Versuch als Aenderung ankommt
      tree.selectObject(null)
      tree.selectObject(found)
    }, xmiId)
    await page.waitForTimeout(400)

    // .first(): bei Objekten mit Primary-Key-Attribut gibt es ZWEI
    // .xmi-id-value-Elemente (XMI-ID-Zeile + "ID (name)"-Zeile).
    // Kurzes Timeout: ohne Selektion existiert das Element nicht, und der
    // 30s-Default wuerde die Retry-Schleife praktisch ausser Kraft setzen.
    const shown = (await propertiesPanel(page).locator('.xmi-id-value').first()
      .textContent({ timeout: 1000 }).catch(() => null))?.trim()
    if (shown === xmiId) {
      // Selektion ist da — aber der Editor cached die Features der EClass
      // zum Selektionszeitpunkt. Sind sie noch nicht aufgeloest, bleibt das
      // Panel sektionslos; nur eine NEUE Selektion baut den Editor neu auf.
      // Deshalb gehoert auch dieser Check in die Retry-Schleife.
      const hasSections = await propertiesPanel(page).locator('.section-heading').first()
        .waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
      // Optional: ein testkritischer Text (z. B. eine Referenz-Row), der beim
      // unvollstaendig aufgebauten Editor fehlen kann — dann neu selektieren.
      const hasRequired = !requiredText || await propertiesPanel(page).getByText(requiredText).first()
        .waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
      if (hasSections && hasRequired) {
        await waitForDomStable(page)
        return
      }
    }
  }
  throw new Error(`Panel zeigt Selektion ${xmiId} nach 8 Versuchen nicht vollstaendig an`)
}

/**
 * Warten, bis das Panel-DOM zur Ruhe kommt: Nach der Selektion re-rendert das
 * Panel mehrfach (asynchrone OCL-/Derived-Auswertungen bumpen die Version).
 * Interaktionen in diesem Fenster treffen veraltete Elemente — die Wurzel
 * fast aller Sequenz-Flakes dieser Suite.
 */
async function waitForDomStable(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const panel = document.querySelector('.properties-panel')
    if (!panel) return false
    const w = window as any
    const html = panel.innerHTML
    if (w.__baselineStableHtml === html) {
      w.__baselineStableCount = (w.__baselineStableCount ?? 0) + 1
    } else {
      w.__baselineStableHtml = html
      w.__baselineStableCount = 0
    }
    // waitForFunction pollt per rAF — ~3 unveraenderte Frames reichen nicht,
    // deshalb zusaetzlich Zeitfenster: erst true nach 500ms ohne Aenderung.
    if (w.__baselineStableCount === 0) w.__baselineStableSince = Date.now()
    return Date.now() - (w.__baselineStableSince ?? 0) > 500
  }, undefined, { timeout: 15_000 }).catch(() => { /* nicht fatal — Test-Assertions greifen danach */ })
  await page.evaluate(() => {
    const w = window as any
    delete w.__baselineStableHtml; delete w.__baselineStableCount; delete w.__baselineStableSince
  })
}

/** Locator fuer das Property-Panel (Center-Editor der Model-Editor-Perspektive). */
function propertiesPanel(page: Page): Locator {
  return page.locator('.properties-panel').first()
}

/**
 * Warten, bis das Panel "zur Ruhe" gekommen ist: keine laufenden
 * OCL-Auswertungen (Derived-Felder zeigen "Computing...") und keine
 * Auswertungs-Fehler (z. B. OCL-Service noch nicht geladen).
 */
async function waitForPanelSettled(page: Page): Promise<void> {
  const panel = propertiesPanel(page)
  await expect(panel).toBeVisible({ timeout: 15_000 })
  // Erste OCL-Auswertung laedt die OCL-Module nach — grosszuegiges Timeout.
  await expect(panel.locator('.loading-text')).toHaveCount(0, { timeout: 30_000 })
  await expect(panel.locator('.error-text')).toHaveCount(0, { timeout: 30_000 })

  // Deterministische Panel-Hoehe: Das Bottom-Panel (Problems/Jobs) oeffnet
  // sich asynchron nach dem Constraint-Load und wuerde die Screenshot-Hoehe
  // des Properties-Panels zufaellig veraendern — daher immer schliessen.
  await page.evaluate(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    const ls = tsm?.getService('ui.layout.state')
    const shared = ls?.useSharedLayoutState?.() ?? ls
    shared?.setPanelAreaVisible?.(false)
  })
  await page.waitForTimeout(300)
}

// ═══════════════════════════════════════════════════════════════════════════
// 6.2 — Visuelle Baseline: ein Screenshot je Element-Typ aus 6.1
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Properties-Baseline: Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45_000)
    await setupBaseline(page)
  })

  test('Root-Objekt (Library): alle Attribut-Typen, Referenzen, Derived, Operationen', async ({ page }) => {
    // 'Operations' ist die letzte Sektion — wenn sie da ist, sind alle da
    await selectByXmiId(page, 'lib1', 'Operations')
    await waitForPanelSettled(page)
    const panel = propertiesPanel(page)

    // Plausibilitaet vor dem Screenshot: Sektionen und Schluesselfelder vorhanden
    await expect(panel.locator('.class-name')).toHaveText('Library')
    // xmi:id aus der Datei; das iD-Attribut (code) erscheint als eigene ID-Zeile
    const idRows = panel.locator('.xmi-id-row')
    await expect(idRows.first().locator('.xmi-id-value')).toHaveText('lib1')
    await expect(idRows.nth(1)).toContainText('LIB-001')
    await expect(panel.getByText('Attributes')).toBeVisible()
    await expect(panel.getByText('References')).toBeVisible()
    await expect(panel.getByText('Derived Values')).toBeVisible()
    await expect(panel.getByText('Operations')).toBeVisible()

    await expect(panel).toHaveScreenshot('library-root-oben.png')

    // Unterer Teil (Derived Values + Operations) — Panel-Inhalt scrollt intern
    await panel.locator('.panel-content').evaluate((el) => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)
    await expect(panel).toHaveScreenshot('library-root-unten.png')
  })

  test('Kind-Objekt (Shelf): Pflichtfeld, EInt, Containment mit abstraktem Typ', async ({ page }) => {
    await selectByXmiId(page, 'shelf1')
    await waitForPanelSettled(page)
    const panel = propertiesPanel(page)

    await expect(panel.locator('.class-name')).toHaveText('Shelf')
    // Breadcrumb zeigt den Container-Pfad (Library)
    await expect(panel.locator('.instance-breadcrumb')).toBeVisible()

    await expect(panel).toHaveScreenshot('shelf-kind.png')
  })

  test('Enkel-Objekt (Book): EEnum, Breadcrumb ueber 2 Ebenen', async ({ page }) => {
    await selectByXmiId(page, 'book1')
    await waitForPanelSettled(page)
    const panel = propertiesPanel(page)

    await expect(panel.locator('.class-name')).toHaveText('Book')
    await expect(panel.locator('.instance-breadcrumb')).toContainText('Stadtbibliothek')
    await expect(panel.locator('.instance-breadcrumb')).toContainText('Belletristik')

    await expect(panel).toHaveScreenshot('book-enkel.png')
  })

  test('Zweite Subklasse (Dvd) des abstrakten Typs', async ({ page }) => {
    await selectByXmiId(page, 'dvd1')
    await waitForPanelSettled(page)
    const panel = propertiesPanel(page)

    await expect(panel.locator('.class-name')).toHaveText('Dvd')
    await expect(panel).toHaveScreenshot('dvd-subklasse.png')
  })

  test('Member: EBoolean-Feld, Ziel des OCL-Referenzfilters', async ({ page }) => {
    await selectByXmiId(page, 'member1')
    await waitForPanelSettled(page)
    const panel = propertiesPanel(page)

    await expect(panel.locator('.class-name')).toHaveText('Member')
    await expect(panel).toHaveScreenshot('member.png')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6.3 — Absprungpunkte (siehe interaktions-inventar.md)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Properties-Baseline: Absprungpunkte', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45_000)
    await setupBaseline(page)
  })

  test('Referenz-Suche oeffnet den Picker-Dialog', async ({ page }) => {
    await selectByXmiId(page, 'lib1', 'Featured Medium')
    const panel = propertiesPanel(page)

    // Such-Button der einwertigen Non-Containment-Referenz (featuredMedium)
    await panel.locator('button[title="Search for reference target"]').first().click()
    await expect(page.locator('.picker-dialog')).toBeVisible({ timeout: 5000 })

    // Schliessen ueber den Close-Button
    await page.locator('.picker-close-btn').click()
    await expect(page.locator('.picker-dialog')).not.toBeVisible()
  })

  test('Containment-Create auf abstraktem Typ zeigt Klassenauswahl', async ({ page }) => {
    await selectByXmiId(page, 'shelf1', 'Media')
    const panel = propertiesPanel(page)

    // Shelf.media (Medium ist abstrakt, 2 Subklassen) → Button "Add..." mit Menue.
    // Retry: der Klick kann verpuffen, wenn das Panel gerade re-rendert
    // (Button wird ersetzt) — dann Menue erneut oeffnen.
    const bookItem = page.locator('.p-menu-overlay, .p-menu').getByText('Book', { exact: true }).first()
    const dvdItem = page.locator('.p-menu-overlay, .p-menu').getByText('Dvd', { exact: true }).first()
    for (let attempt = 0; attempt < 3; attempt++) {
      await panel.getByRole('button', { name: 'Add...' }).click({ force: true })
      await page.waitForTimeout(400)
      if (await bookItem.isVisible()) break
    }
    await expect(bookItem).toBeVisible({ timeout: 3000 })
    await expect(dvdItem).toBeVisible()

    // Klassenauswahl → Kind wird erzeugt und automatisch selektiert.
    // force: das Overlay animiert/re-rendert, Playwrights Stabilitaets-Check
    // kommt sonst nicht zur Ruhe.
    await bookItem.click({ force: true })
    await page.waitForTimeout(600)
    await expect(panel.locator('.class-name')).toHaveText('Book')

    // Das neue Medium haengt am Regal
    const mediaCount = await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      const comp = tsm?.getService('ui.instance-tree.composables')
      const tree = comp?.useSharedInstanceTree?.()
      const roots = Array.from(tree.getRootObjects()) as any[]
      const lib = roots.find((o: any) => o.eClass().getName() === 'Library')
      const shelves = Array.from(lib.eGet(lib.eClass().getEStructuralFeature('shelves'))) as any[]
      const shelf1 = shelves[0]
      return Array.from(shelf1.eGet(shelf1.eClass().getEStructuralFeature('media'))).length
    })
    expect(mediaCount).toBe(3) // book1 + dvd1 + neues Book
  })

  test('Kind anlegen an konkretem Containment selektiert das neue Objekt', async ({ page }) => {
    await selectByXmiId(page, 'lib1', 'Shelves')
    const panel = propertiesPanel(page)

    // Library.shelves (konkreter Typ) → Button "Add" ohne Menue, Direkt-Create
    await panel.locator('.property-row').filter({ hasText: 'Shelves' })
      .getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(600)

    // Baum expandiert + neues Objekt selektiert → Panel zeigt Shelf
    await expect(panel.locator('.class-name')).toHaveText('Shelf')
  })

  test('Operation ohne Parameter liefert Ergebnis inline', async ({ page }) => {
    await selectByXmiId(page, 'lib1', 'getShelfCount')
    await waitForPanelSettled(page)
    const panel = propertiesPanel(page)

    const opField = panel.locator('.operation-field').filter({ hasText: 'getShelfCount' })
    // Operations rendern nach dem Annotation-Parsing leicht verzoegert
    await expect(opField).toBeVisible({ timeout: 15_000 })
    await expect(opField.getByText('Click play to execute')).toBeVisible()

    await opField.getByRole('button').click()
    await expect(opField.locator('.value-text')).toHaveText('2', { timeout: 30_000 })
  })

  test('Operation mit Parametern oeffnet den Parameter-Dialog', async ({ page }) => {
    await selectByXmiId(page, 'lib1', 'hasTag')
    await waitForPanelSettled(page)
    const panel = propertiesPanel(page)

    const opField = panel.locator('.operation-field').filter({ hasText: 'hasTag' })
    await opField.getByRole('button').click()

    // Dialog mit Operationsname und Parameter-Eingabe
    await expect(page.getByText('Execute: hasTag')).toBeVisible({ timeout: 5000 })
    const dialog = page.locator('.p-dialog')
    await expect(dialog.getByText('searchTag')).toBeVisible()

    // Parameter eingeben und ausfuehren → Ergebnis inline im Operationsfeld
    // (einziger String-Parameter → erstes Textfeld im Dialog)
    await dialog.locator('input').first().fill('klassik')
    await dialog.getByRole('button', { name: 'Execute' }).click()
    await expect(page.getByText('Execute: hasTag')).not.toBeVisible({ timeout: 5000 })
    await expect(opField.locator('.value-text')).toHaveText('true', { timeout: 30_000 })
  })

  test('Breadcrumb-Klick springt zum Container', async ({ page }) => {
    await selectByXmiId(page, 'book1')
    const panel = propertiesPanel(page)
    await expect(panel.locator('.class-name')).toHaveText('Book')

    // Breadcrumb: Home / Stadtbibliothek / Belletristik → Klick auf das Regal.
    // Ziel ist das interaktive Element (.p-breadcrumb-item-link), nicht der
    // innere Text-Span. force + Retry: das Panel re-rendert reaktiv
    // (Derived-Updates); ein einzelner Klick kann alte Koordinaten treffen.
    const shelfCrumb = panel.locator('.instance-breadcrumb .p-breadcrumb-item-link')
      .filter({ hasText: 'Belletristik' }).first()
    for (let attempt = 0; attempt < 4; attempt++) {
      await shelfCrumb.click({ force: true })
      await page.waitForTimeout(600)
      if ((await panel.locator('.class-name').textContent())?.trim() === 'Shelf') break
      // Verpasst das Panel das Selektions-Event, ist jeder weitere Klick ein
      // No-Op (gleiches Ziel = keine Aenderung). Zustand neu aufbauen und
      // erneut klicken.
      await selectByXmiId(page, 'book1')
    }

    await expect(panel.locator('.class-name')).toHaveText('Shelf')
    await expect(panel.locator('.instance-name')).toHaveText('Belletristik')
  })

  test('Referenz-Navigation springt zum Zielobjekt', async ({ page }) => {
    await selectByXmiId(page, 'lib1', 'Highlights')
    const panel = propertiesPanel(page)

    // Mehrwertige Non-Containment-Referenz "highlights": Klick auf Item navigiert
    const highlightsRow = panel.locator('.property-row').filter({ hasText: 'Highlights' })
    await highlightsRow.locator('.item-text').first().click()
    await page.waitForTimeout(400)

    // Erstes highlights-Element ist book2 ("Kosmos")
    await expect(panel.locator('.class-name')).toHaveText('Book')
    await expect(panel.locator('.instance-name')).toHaveText('Kosmos')
  })

  test('XMI-ID laesst sich editieren', async ({ page }) => {
    await selectByXmiId(page, 'member2')
    const panel = propertiesPanel(page)
    await expect(panel.locator('.xmi-id-value')).toHaveText('member2')

    await panel.locator('.xmi-id-row button:has(.pi-pencil)').click()
    const input = panel.locator('.xmi-id-row input')
    await expect(input).toBeVisible()
    await input.fill('member2-neu')
    await input.press('Enter')

    await expect(panel.locator('.xmi-id-value')).toHaveText('member2-neu')
  })

  test('XMI-ID laesst sich generieren (UUID)', async ({ page }) => {
    await selectByXmiId(page, 'member2')
    const panel = propertiesPanel(page)
    await expect(panel.locator('.xmi-id-value')).toHaveText('member2')

    await panel.locator('.xmi-id-row button:has(.pi-refresh)').click()
    await page.waitForTimeout(300)

    const newId = (await panel.locator('.xmi-id-value').textContent())?.trim() ?? ''
    expect(newId).not.toBe('member2')
    expect(newId).toMatch(/^[0-9a-f-]{16,}$/i)
  })

  test('OCL-Referenzfilter deaktiviert unzulaessige Kandidaten', async ({ page }) => {
    await selectByXmiId(page, 'lib1', 'Librarian')
    await waitForPanelSettled(page)
    const panel = propertiesPanel(page)

    // Library.librarian hat referenceFilter: nur Mitglieder mit isStaff=true
    // force: Derived-Updates re-rendern das Panel, der Stabilitaets-Check
    // wuerde sonst haengen (gleiches Muster wie Breadcrumb/Menue).
    const librarianRow = panel.locator('.property-row').filter({ hasText: 'Librarian' })
    await librarianRow.locator('.p-select, .p-dropdown').first().click({ force: true })
    await page.waitForTimeout(500)

    // Beide Kandidaten sichtbar; der Nicht-Mitarbeiter ist OCL-deaktiviert (pi-ban)
    const options = page.locator('.dropdown-option')
    await expect(options.filter({ hasText: 'Ada Admin' })).toBeVisible({ timeout: 15_000 })
    const blocked = options.filter({ hasText: 'Bela Besucher' })
    await expect(blocked).toBeVisible()
    await expect(blocked).toHaveClass(/ocl-disabled/, { timeout: 15_000 })
    await expect(blocked.locator('.pi-ban')).toBeVisible()
    await expect(options.filter({ hasText: 'Ada Admin' })).not.toHaveClass(/ocl-disabled/)

    await page.keyboard.press('Escape')
  })

  test('showProblemsPanel oeffnet die Panel-Area mit Problems-Tab', async ({ page }) => {
    // Ziel-Action der OCL-blockierten Zuweisung (handleOclBlocked →
    // actions.showProblemsPanel). Der Klick auf eine disabled Dropdown-Option
    // wird von PrimeVue unterdrueckt, daher wird die Action direkt geprueft
    // (siehe interaktions-inventar.md #15).
    await selectByXmiId(page, 'lib1')

    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      const actions = tsm?.getService('gene.workspace.actions')
      if (!actions?.showProblemsPanel) throw new Error('Workspace actions not available')
      actions.showProblemsPanel()
    })
    await page.waitForTimeout(500)

    await expect(page.locator('.panel-area')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.panel-area')).toContainText(/Problems/i)
  })

  test('Wertaenderung markiert Resource dirty und aktualisiert den Baum', async ({ page }) => {
    await selectByXmiId(page, 'member1')
    const panel = propertiesPanel(page)

    // Name aendern → markDirty (Dirty-Punkt am Resource-Knoten) + triggerUpdate
    // (Baum-Label folgt sofort). Save/Reset-Header erscheint dabei NICHT,
    // da setValue sofort ins Modell persistiert (Ist-Verhalten, Inventar #11/#12/#13).
    const nameInput = panel.locator('#name')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Ada Adminia')
    await page.waitForTimeout(500)

    // Baum-Label aktualisiert (triggerUpdate)
    await expect(page.locator('.p-tree-node-content', { hasText: 'Ada Adminia' }).first())
      .toBeVisible({ timeout: 5000 })

    // Resource als dirty markiert (markDirty → Punkt am Resource-Knoten)
    await expect(page.locator('.resource-dirty').first()).toBeVisible({ timeout: 5000 })

    // Save/Reset-Header bleibt aus (Auto-Persist, kein editor.isDirty)
    await expect(panel.locator('.panel-header')).toHaveCount(0)
  })
})
