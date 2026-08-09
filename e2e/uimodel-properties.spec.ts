/**
 * E2E: UiModel-basiertes Property-Rendering (Feature-Flag an, Plan Phase 1+2)
 *
 * Prueft den Composer-Pfad des Property-Views gegen das Baseline-Referenzmodell:
 * Rendering via uimodel-composer, Editier-Roundtrip, OCL-Required-Validierung
 * (eine Quelle, A8) und Referenz-Absprungpunkt. Der alte Pfad (Flag aus) wird
 * von e2e/properties-baseline.spec.ts abgedeckt.
 */

import { test, expect, type Page, type Locator } from '@playwright/test'
import { waitForAppReady, loadEcoreModel, loadInstances } from './helpers'

const ECORE_PATH = '/test-data/uimodel-baseline/library.ecore'
const XMI_PATH = '/test-data/uimodel-baseline/library-instance.xmi'

function propertiesPanel(page: Page): Locator {
  return page.locator('.properties-panel').first()
}

/** Wie setupBaseline (properties-baseline.spec.ts), aber mit aktiviertem Flag. */
async function setupWithFlag(page: Page): Promise<void> {
  // Flag VOR dem App-Start setzen (localStorage wird beim Bootstrap gelesen)
  await page.addInitScript(() => {
    localStorage.setItem('gene.uimodelProperties', 'true')
  })
  await waitForAppReady(page)

  await page.waitForFunction(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    const pm = tsm?.getService?.('ui.registry.perspectives')
    const pr = tsm?.getService?.('ui.registry.panels')
    return !!(pm && pr?.get?.('instance-tree') && pr?.get?.('properties') && pr?.get?.('model-browser')
      && tsm?.getService?.('ui.uimodel.forms'))
  }, undefined, { timeout: 60_000 })

  await page.evaluate(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    tsm.getService('ui.registry.perspectives').openWorkspace({}, '/e2e-test/workspace.xmi', 'model-editor')
  })
  await page.waitForTimeout(1500)

  await loadEcoreModel(page, ECORE_PATH)
  await page.waitForTimeout(300)
  await loadInstances(page, XMI_PATH)
  await page.waitForTimeout(800)
}

/** Selektion mit Verifikation+Retry (vgl. properties-baseline.spec.ts). */
async function selectByXmiId(page: Page, xmiId: string): Promise<void> {
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
      if (!found) throw new Error('Object not found: ' + id)
      tree.selectObject(null)
      tree.selectObject(found)
    }, xmiId)
    await page.waitForTimeout(400)

    const shown = (await propertiesPanel(page).locator('.xmi-id-value').first()
      .textContent({ timeout: 1000 }).catch(() => null))?.trim()
    if (shown === xmiId) {
      const ok = await propertiesPanel(page).locator('.uimodel-property-row').first()
        .waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
      if (ok) return
    }
  }
  throw new Error(`Composer-Panel zeigt ${xmiId} nach 8 Versuchen nicht an`)
}

test.describe('UiModel-Properties (Flag an)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45_000)
    await setupWithFlag(page)
    await selectByXmiId(page, 'lib1')
  })

  test('Composer rendert Attributes + References als FormViews', async ({ page }) => {
    const panel = propertiesPanel(page)
    await expect(panel.locator('.uimodel-properties-view')).toBeVisible()
    const forms = panel.locator('.uimodel-all-features, .uimodel-form-view')
    await expect(forms).toHaveCount(3)
    await expect(forms.nth(0)).toHaveAttribute('data-uim-group', 'Attributes')
    await expect(forms.nth(1)).toHaveAttribute('data-uim-group', 'References')
    // Derived Values seit Phase 4 ebenfalls im Composer-Pfad
    await expect(forms.nth(2)).toHaveAttribute('data-uim-group', 'Derived Values')
    // 7 Attribute + 5 Referenzen + 2 Derived des Referenzmodells
    await expect(panel.locator('.uimodel-property-row')).toHaveCount(14)
    // Operations bleiben (bewusst) beim Panel-Rahmen
    await expect(panel.getByText('Operations')).toBeVisible()
  })

  test('Editier-Roundtrip: Wert landet am EObject und im Baum', async ({ page }) => {
    const panel = propertiesPanel(page)
    const nameInput = panel.locator('.uimodel-property-row input').first()
    await nameInput.fill('Uimodel-Bibliothek')
    await page.waitForTimeout(500)

    const eGetWert = await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const it = tsm.getService('ui.instance-tree.composables')
      const lib: any = Array.from(it.useSharedInstanceTree().getRootObjects())[0]
      return lib.eGet(lib.eClass().getEStructuralFeature('name'))
    })
    expect(eGetWert).toBe('Uimodel-Bibliothek')
    await expect(page.getByText('Library: Uimodel-Bibliothek')).toBeVisible()
  })

  test('Required-Validierung aus UIModel-OCL: genau eine Meldung, reversibel', async ({ page }) => {
    const panel = propertiesPanel(page)
    const nameRow = panel.locator('.uimodel-property-row').first()
    const nameInput = nameRow.locator('input').first()

    await nameInput.fill('')
    // Asynchrone OCL-Auswertung (Parser/Worker beim ersten Mal langsam).
    // Meldungstext je nach Quelle: Expansion (emf.ts.ui#7) liefert
    // "... ist erforderlich.", gene-Synthese "... is required".
    await expect(nameRow.getByText(/is required|ist erforderlich/i)).toBeVisible({ timeout: 20_000 })
    // Genau EINE Meldung (keine Doppelmeldung alt+neu, Kriterium A8)
    await expect(nameRow.getByText(/is required|ist erforderlich/i)).toHaveCount(1)

    await nameInput.fill('Stadtbibliothek')
    await expect(nameRow.getByText(/is required|ist erforderlich/i)).not.toBeVisible({ timeout: 20_000 })
  })

  test('Referenz-Absprungpunkt: Such-Dialog oeffnet aus der Bridge-Row', async ({ page }) => {
    const panel = propertiesPanel(page)
    const featuredRow = panel.locator('.uimodel-property-row').filter({ hasText: 'Featured Medium' })
    await featuredRow.locator('button[title="Search for reference target"]').click()
    await expect(page.locator('.picker-dialog')).toBeVisible({ timeout: 5000 })
    await page.locator('.picker-close-btn').click()
    await expect(page.locator('.picker-dialog')).not.toBeVisible()
  })

  test('Autoriertes Workspace-UIModel ersetzt Default; Entfernen faellt zurueck (A1/A5)', async ({ page }) => {
    const panel = propertiesPanel(page)
    // Default-Generator aktiv
    await expect(panel.locator('.uimodel-all-features, .uimodel-form-view').nth(0)).toHaveAttribute('data-uim-group', 'Attributes')

    // Autoriertes UIModel in die Workspace-Stufe laden (Datei aus test-data)
    await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const svc = tsm.getService('ui.uimodel.forms')
      const content = await (await fetch('/test-data/uimodel-baseline/library.uimodel.xmi')).text()
      await svc.addUiModelsFromXmi(content, 'library.uimodel.xmi', 'workspace')
    })

    // Anzeige folgt dem Modell: eigene Gruppen, Labels, Reihenfolge (Signatur vor Bezeichnung)
    await expect(panel.locator('.uimodel-all-features, .uimodel-form-view').nth(0)).toHaveAttribute('data-uim-group', 'Stammdaten', { timeout: 5000 })
    await expect(panel.locator('.uimodel-all-features, .uimodel-form-view').nth(1)).toHaveAttribute('data-uim-group', 'Bestand')
    const labels = panel.locator('.uimodel-property-row .field-label')
    await expect(labels.nth(0)).toContainText('Signatur')
    await expect(labels.nth(1)).toContainText('Bezeichnung')
    await expect(panel.locator('.uimodel-property-row')).toHaveCount(5)

    // Entfernen → Default-Generator greift wieder, ohne Reload
    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      tsm.getService('ui.uimodel.forms').removeUiModelPath('library.uimodel.xmi')
    })
    await expect(panel.locator('.uimodel-all-features, .uimodel-form-view').nth(0)).toHaveAttribute('data-uim-group', 'Attributes', { timeout: 5000 })
    await expect(panel.locator('.uimodel-property-row')).toHaveCount(14)
  })

  test('Workspace-Stufe schlaegt App-Default (E7-Hierarchie)', async ({ page }) => {
    const panel = propertiesPanel(page)

    // App-Default: Minimal-UIModel mit eigener Gruppe "AppDefault"
    await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const svc = tsm.getService('ui.uimodel.forms')
      const nsUri = 'http://www.gene.org/uimodel-baseline/library/1.0'
      const appXmi = `<?xml version="1.0" encoding="UTF-8"?>
<uimodel:UIModel xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:uimodel="http://uimodel/1.0"
    name="app-default">
  <targetClasses href="${nsUri}#//Library"/>
  <components xsi:type="uimodel:FormView" name="app" group="AppDefault">
    <fields xsi:type="uimodel:InputWidget" name="name" label="App-Name">
      <feature href="${nsUri}#//Library/name"/>
    </fields>
  </components>
</uimodel:UIModel>`
      await svc.addUiModelsFromXmi(appXmi, 'app-default.uimodel.xmi', 'app')
    })
    await expect(panel.locator('.uimodel-all-features, .uimodel-form-view').nth(0)).toHaveAttribute('data-uim-group', 'AppDefault', { timeout: 5000 })

    // Workspace-Modell dazu → gewinnt gegen App-Default
    await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const svc = tsm.getService('ui.uimodel.forms')
      const content = await (await fetch('/test-data/uimodel-baseline/library.uimodel.xmi')).text()
      await svc.addUiModelsFromXmi(content, 'library.uimodel.xmi', 'workspace')
    })
    await expect(panel.locator('.uimodel-all-features, .uimodel-form-view').nth(0)).toHaveAttribute('data-uim-group', 'Stammdaten', { timeout: 5000 })

    // Workspace-Modell weg → App-Default greift wieder
    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      tsm.getService('ui.uimodel.forms').removeUiModelPath('library.uimodel.xmi')
    })
    await expect(panel.locator('.uimodel-all-features, .uimodel-form-view').nth(0)).toHaveAttribute('data-uim-group', 'AppDefault', { timeout: 5000 })
  })

  test('PropertyBindings: Label aus Expression, readOnly reagiert auf Instanzwert', async ({ page }) => {
    const panel = propertiesPanel(page)

    // UIModel mit Bindings (emf.ts.ui#3): Label berechnet aus dem Feature,
    // readOnly gebunden an einen Instanzwert (open) desselben Objekts.
    await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const svc = tsm.getService('ui.uimodel.forms')
      const nsUri = 'http://www.gene.org/uimodel-baseline/library/1.0'
      const xmi = `<?xml version="1.0" encoding="UTF-8"?>
<uimodel:UIModel xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:uimodel="http://uimodel/1.0"
    name="binding-demo">
  <targetClasses href="${nsUri}#//Library"/>
  <components xsi:type="uimodel:FormView" name="demo" group="Bindings">
    <fields xsi:type="uimodel:InputWidget" name="name">
      <feature href="${nsUri}#//Library/name"/>
      <bindings property="label">
        <expression language="JS" body="feature.name.toUpperCase()"/>
      </bindings>
    </fields>
    <fields xsi:type="uimodel:NumberWidget" name="maxMembers">
      <feature href="${nsUri}#//Library/maxMembers"/>
      <bindings property="readOnly">
        <expression language="JS" body="self.open === true"/>
      </bindings>
    </fields>
  </components>
</uimodel:UIModel>`
      await svc.addUiModelsFromXmi(xmi, 'binding-demo.uimodel.xmi', 'workspace')
    })

    // Label kommt aus der Expression (name → NAME)
    const nameRow = panel.locator('.uimodel-property-row').first()
    await expect(nameRow.locator('.field-label')).toContainText('NAME', { timeout: 5000 })

    // readOnly: Library.open ist true → Feld deaktiviert
    const maxRow = panel.locator('.uimodel-property-row').nth(1)
    await expect(maxRow.locator('input').first()).toBeDisabled()

    // Instanzwert aendern (open=false) → Live-Neuauswertung: die Bridge
    // wertet Bindings gegen die Expression-Version aus (bumpModelVersion);
    // upstream (useWidgetConfig) ist noch nicht reaktiv, siehe emf.ts.ui#3.
    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const it = tsm.getService('ui.instance-tree.composables')
      const lib: any = Array.from(it.useSharedInstanceTree().getRootObjects())[0]
      const openF = lib.eClass().getEStructuralFeature('open')
      lib.eSet(openF, false)
      tsm.getService('ui.uimodel.forms').bumpModelVersion()
    })
    await expect(maxRow.locator('input').first()).toBeEnabled({ timeout: 5000 })

    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      tsm.getService('ui.uimodel.forms').removeUiModelPath('binding-demo.uimodel.xmi')
    })
  })

  test('Generic-Default: Label aus Ecore-Annotation (http://uimodel/1.0, key label)', async ({ page }) => {
    const panel = propertiesPanel(page)

    // Eigenes Mini-Metamodell mit annotiertem Feature — bewusst NICHT im
    // Baseline-Ecore (der alte Pfad kennt keine Annotationen; eine dortige
    // Annotation wuerde die Pfad-Paritaet der Baseline brechen).
    await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const ecore = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="anno" nsURI="http://gene/test/anno/1.0" nsPrefix="anno">
  <eClassifiers xsi:type="ecore:EClass" name="Thing">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="title">
      <eType xsi:type="ecore:EDataType" href="http://www.eclipse.org/emf/2002/Ecore#//EString"/>
      <eAnnotations source="http://uimodel/1.0">
        <details key="label" value="Titel (aus Ecore)"/>
      </eAnnotations>
    </eStructuralFeatures>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="count">
      <eType xsi:type="ecore:EDataType" href="http://www.eclipse.org/emf/2002/Ecore#//EInt"/>
    </eStructuralFeatures>
  </eClassifiers>
</ecore:EPackage>`
      const mb = tsm.getService('ui.model-browser.composables')
      await mb.loadEcoreFile(ecore, 'anno-test.ecore')
      const instance = `<?xml version="1.0" encoding="UTF-8"?>
<anno:Thing xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:anno="http://gene/test/anno/1.0" xmi:id="thing1" title="Hallo" count="7"/>`
      const it = tsm.getService('ui.instance-tree.composables')
      await it.loadInstancesFromXMI(instance, 'anno-instance.xmi')
    })
    await selectByXmiId(page, 'thing1')

    // Annotiertes Feature zeigt das Ecore-Label, unannotiertes die Ableitung
    const labels = panel.locator('.uimodel-property-row .field-label')
    await expect(labels.nth(0)).toContainText('Titel (aus Ecore)', { timeout: 5000 })
    await expect(labels.nth(1)).toContainText('Count')
  })

  test('Strukturen (emf.ts.ui#6): GroupWidget, Conditional, ForEach mit Element-Editing', async ({ page }) => {
    const panel = propertiesPanel(page)

    await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const svc = tsm.getService('ui.uimodel.forms')
      const nsUri = 'http://www.gene.org/uimodel-baseline/library/1.0'
      const xmi = `<?xml version="1.0" encoding="UTF-8"?>
<uimodel:UIModel xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:uimodel="http://uimodel/1.0"
    name="struktur-demo" priority="20">
  <targetClasses href="${nsUri}#//Library"/>
  <components xsi:type="uimodel:FormView" name="demo" group="Struktur">
    <fields xsi:type="uimodel:GroupWidget" name="kopf" layout="HORIZONTAL">
      <fields xsi:type="uimodel:InputWidget" name="name" label="Name">
        <feature href="${nsUri}#//Library/name"/>
      </fields>
      <fields xsi:type="uimodel:NumberWidget" name="maxMembers" label="Kapazitaet">
        <feature href="${nsUri}#//Library/maxMembers"/>
      </fields>
    </fields>
    <fields xsi:type="uimodel:Conditional" name="offen-check">
      <condition language="JS" body="self.open === true"/>
      <then xsi:type="uimodel:InputWidget" name="code" label="Signatur (offen)">
        <feature href="${nsUri}#//Library/code"/>
      </then>
      <else xsi:type="uimodel:NumberWidget" name="rating" label="Bewertung (geschlossen)">
        <feature href="${nsUri}#//Library/rating"/>
      </else>
    </fields>
    <fields xsi:type="uimodel:ForEach" name="regale" emptyText="keine Regale">
      <items language="JS" body="self.shelves"/>
      <body xsi:type="uimodel:InputWidget" name="shelf-name" label="Regal">
        <feature href="${nsUri}#//Shelf/name"/>
      </body>
    </fields>
  </components>
</uimodel:UIModel>`
      await svc.addUiModelsFromXmi(xmi, 'struktur-demo.uimodel.xmi', 'workspace')
    })

    // GroupWidget: horizontale Gruppe mit beiden Feldern
    const gruppe = panel.locator('.uimodel-group--horizontal')
    await expect(gruppe).toBeVisible({ timeout: 5000 })
    await expect(gruppe.locator('.uimodel-property-row')).toHaveCount(2)

    // Conditional: open=true → then-Zweig (Signatur), else-Zweig fehlt
    await expect(panel.getByText('Signatur (offen)')).toBeVisible()
    await expect(panel.getByText('Bewertung (geschlossen)')).toHaveCount(0)

    // ForEach: ein Input pro Regal, mit Element-Werten
    const regalInputs = panel.locator('.uimodel-property-row')
      .filter({ has: page.locator('.field-label', { hasText: 'Regal' }) })
      .locator('input')
    await expect(regalInputs).toHaveCount(2)
    await expect(regalInputs.nth(0)).toHaveValue('Belletristik')
    await expect(regalInputs.nth(1)).toHaveValue('Sachbuecher')

    // Element-Editing: schreibt an das ELEMENT (shelf1), nicht an die Library
    await regalInputs.nth(0).fill('Romane')
    await page.waitForTimeout(500)
    const werte = await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const it = tsm.getService('ui.instance-tree.composables')
      const lib: any = Array.from(it.useSharedInstanceTree().getRootObjects())[0]
      const shelvesF = lib.eClass().getEStructuralFeature('shelves')
      const shelves = Array.from(lib.eGet(shelvesF))
      const nameF = (shelves[0] as any).eClass().getEStructuralFeature('name')
      return {
        shelf0: (shelves[0] as any).eGet(nameF),
        libName: lib.eGet(lib.eClass().getEStructuralFeature('name'))
      }
    })
    expect(werte.shelf0).toBe('Romane')
    expect(werte.libName).toBe('Stadtbibliothek')

    // Conditional wechselt den Zweig nach Wertaenderung + ECHTEM
    // Selektionswechsel (ueber ein anderes Objekt — Deselect+Reselect
    // desselben Objekts im selben Tick ist fuer Vue ein No-op; die
    // Live-Reaktivitaet der Struktur-Aufloesung ist der bekannte
    // Upstream-Tick-Punkt, emf.ts.ui#3-Kommentar).
    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      const it = tsm.getService('ui.instance-tree.composables')
      const lib: any = Array.from(it.useSharedInstanceTree().getRootObjects())[0]
      lib.eSet(lib.eClass().getEStructuralFeature('open'), false)
    })
    await selectByXmiId(page, 'shelf1')
    await selectByXmiId(page, 'lib1')
    await expect(panel.getByText('Bewertung (geschlossen)')).toBeVisible({ timeout: 5000 })
    await expect(panel.getByText('Signatur (offen)')).toHaveCount(0)

    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      tsm.getService('ui.uimodel.forms').removeUiModelPath('struktur-demo.uimodel.xmi')
    })
  })

  test('Flag-Umschaltung ohne Reload stellt den alten Pfad wieder her', async ({ page }) => {
    const panel = propertiesPanel(page)
    await expect(panel.locator('.uimodel-properties-view')).toBeVisible()

    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      tsm.getService('ui.uimodel.forms').useUimodelPropertiesFlag().setEnabled(false)
    })
    await expect(panel.locator('.uimodel-properties-view')).not.toBeVisible()
    await expect(panel.locator('.section-heading').filter({ hasText: 'Attributes' })).toBeVisible()

    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl.__vue_app__._context.provides['tsm']
      tsm.getService('ui.uimodel.forms').useUimodelPropertiesFlag().setEnabled(true)
    })
    await expect(panel.locator('.uimodel-properties-view')).toBeVisible()
  })
})
