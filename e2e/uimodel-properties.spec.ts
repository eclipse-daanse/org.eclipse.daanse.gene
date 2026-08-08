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
    const forms = panel.locator('.uimodel-form-view')
    await expect(forms).toHaveCount(2)
    await expect(forms.nth(0)).toHaveAttribute('data-uim-group', 'Attributes')
    await expect(forms.nth(1)).toHaveAttribute('data-uim-group', 'References')
    // 7 Attribute + 5 Referenzen des Referenzmodells
    await expect(panel.locator('.uimodel-property-row')).toHaveCount(12)
    // Alte Sektionen fuer Attributes/References sind ersetzt; Derived/Operations bleiben
    await expect(panel.getByText('Derived Values')).toBeVisible()
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
    // Asynchrone OCL-Auswertung (Parser/Worker beim ersten Mal langsam)
    await expect(nameRow.getByText('Name is required')).toBeVisible({ timeout: 20_000 })
    // Genau EINE Meldung (keine Doppelmeldung alt+neu, Kriterium A8)
    await expect(nameRow.getByText(/required/i)).toHaveCount(1)

    await nameInput.fill('Stadtbibliothek')
    await expect(nameRow.getByText('Name is required')).not.toBeVisible({ timeout: 20_000 })
  })

  test('Referenz-Absprungpunkt: Such-Dialog oeffnet aus der Bridge-Row', async ({ page }) => {
    const panel = propertiesPanel(page)
    const featuredRow = panel.locator('.uimodel-property-row').filter({ hasText: 'Featured Medium' })
    await featuredRow.locator('button[title="Search for reference target"]').click()
    await expect(page.locator('.picker-dialog')).toBeVisible({ timeout: 5000 })
    await page.locator('.picker-close-btn').click()
    await expect(page.locator('.picker-dialog')).not.toBeVisible()
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
