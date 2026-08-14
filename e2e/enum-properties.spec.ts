/**
 * E2E: Enum-Attribute im Property-View (Issue emf.ts#70)
 *
 * Prueft den Weg, den nur die laufende App zeigt: geladenes Enum-Attribut ->
 * Dropdown -> Auswahl -> EEnumLiteral am EObject -> Literal in der Serialisierung.
 *
 * Zwei Fixtures, beide aus test-data/uimodel-baseline:
 *   library-instance.xmi           genre als Literal ("NOVEL")   — EMF-konform
 *   instances/library-instance.xmi genre als Ordinalzahl ("2")   — Altbestand,
 *                                 den gene vor dem Fix selbst geschrieben hat
 *
 * Das Genre-Dropdown traegt die Feature-ID (`#genre`, gesetzt in EnumField),
 * die Selektoren gelten deshalb in beiden Property-Pfaden (Flag an/aus).
 */

import { test, expect, type Page, type Locator } from '@playwright/test'
import { waitForAppReady, loadEcoreModel, loadInstances } from './helpers'

const ECORE_PATH = '/test-data/uimodel-baseline/library.ecore'
const XMI_LITERALS = '/test-data/uimodel-baseline/library-instance.xmi'
const XMI_ORDINALS = '/test-data/uimodel-baseline/instances/library-instance.xmi'

function propertiesPanel(page: Page): Locator {
  return page.locator('.properties-panel').first()
}

/** Das Genre-Dropdown im Property-View */
function genreDropdown(page: Page): Locator {
  return propertiesPanel(page).locator('#genre')
}

/**
 * App starten, Perspektive oeffnen, Ecore laden — Instanzen bewusst nicht,
 * die waehlt jeder Test selbst (Literal- oder Ordinal-Fixture).
 * Aufbau wie e2e/properties-baseline.spec.ts.
 */
async function setup(page: Page, xmiPath: string): Promise<void> {
  await waitForAppReady(page)

  await page.waitForFunction(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    const pm = tsm?.getService?.('ui.registry.perspectives')
    const pr = tsm?.getService?.('ui.registry.panels')
    return !!(pm && pr?.get?.('instance-tree') && pr?.get?.('properties') && pr?.get?.('model-browser')
      && tsm?.getService?.('ui.uimodel.forms'))
  }, undefined, { timeout: 60_000 })

  const openPerspective = () => page.evaluate(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    tsm.getService('ui.registry.perspectives').openWorkspace({}, '/e2e-test/workspace.xmi', 'model-editor')
  })

  await openPerspective()
  await page.waitForTimeout(1500)
  if (await page.locator('.properties-panel').count() === 0) {
    await openPerspective()
    await page.waitForTimeout(1500)
  }

  await loadEcoreModel(page, ECORE_PATH)
  await page.waitForTimeout(300)
  await loadInstances(page, xmiPath)
  await page.waitForTimeout(800)
}

/** Objekt per xmi:id im Baum selektieren (Muster aus uimodel-properties.spec.ts) */
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
    if (shown === xmiId) return
  }
  throw new Error(`Property-View zeigt ${xmiId} nach 8 Versuchen nicht an`)
}

/** genre-Wert am EObject auslesen — Literal-Name statt Rohwert */
async function genreAtModel(page: Page, xmiId: string): Promise<unknown> {
  return page.evaluate((id) => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    const comp = tsm.getService('ui.instance-tree.composables')
    const tree = comp.useSharedInstanceTree()
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
    const value: any = found.eGet(found.eClass().getEStructuralFeature('genre'))
    if (value && typeof value.getName === 'function') {
      return { kind: 'EEnumLiteral', name: value.getName(), literal: value.getLiteral?.() }
    }
    return { kind: typeof value, raw: value }
  }, xmiId)
}

/** Aktive Instanz-Resource serialisieren (das schreibt der Save-Pfad) */
async function serialized(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    const tree = tsm.getService('ui.instance-tree.composables').useSharedInstanceTree()
    return tree.serializeAllInstances()
  })
}

/** Im Dropdown eine Option waehlen */
async function pickGenre(page: Page, label: string): Promise<void> {
  await genreDropdown(page).click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await page.waitForTimeout(400)
}

test.describe('Enum-Attribute im Property-View', () => {
  test.describe('Datei mit Literalen', () => {
    test.beforeEach(async ({ page }) => {
      test.setTimeout(60_000)
      await setup(page, XMI_LITERALS)
    })

    test('zeigt den geladenen Enum-Wert im Dropdown', async ({ page }) => {
      await selectByXmiId(page, 'book1')
      await expect(genreDropdown(page)).toContainText('NOVEL')

      await selectByXmiId(page, 'dvd1')
      await expect(genreDropdown(page)).toContainText('SCIFI')
    })

    test('bietet alle Literale des EEnum an', async ({ page }) => {
      await selectByXmiId(page, 'book1')
      await genreDropdown(page).click()

      for (const literal of ['NOVEL', 'SCIFI', 'FANTASY', 'NONFICTION']) {
        await expect(page.getByRole('option', { name: literal, exact: true })).toBeVisible()
      }
      await page.keyboard.press('Escape')
    })

    test('Auswahl landet als EEnumLiteral am EObject und als Literal im XMI', async ({ page }) => {
      await selectByXmiId(page, 'book1')
      await pickGenre(page, 'FANTASY')

      await expect(genreDropdown(page)).toContainText('FANTASY')
      expect(await genreAtModel(page, 'book1')).toMatchObject({
        kind: 'EEnumLiteral',
        name: 'FANTASY'
      })

      const xml = await serialized(page)
      expect(xml).toContain('genre="FANTASY"')
      expect(xml).not.toContain('genre="2"')
    })
  })

  test.describe('Datei mit Ordinalzahlen (Altbestand)', () => {
    test.beforeEach(async ({ page }) => {
      test.setTimeout(60_000)
      await setup(page, XMI_ORDINALS)
    })

    test('loest Ordinalzahlen zum Literal auf, statt leer zu bleiben', async ({ page }) => {
      // genre="2" -> FANTASY, genre="1" -> SCIFI, genre="0" -> NOVEL
      await selectByXmiId(page, 'book1')
      await expect(genreDropdown(page)).toContainText('FANTASY')

      await selectByXmiId(page, 'dvd1')
      await expect(genreDropdown(page)).toContainText('SCIFI')

      await selectByXmiId(page, 'book2')
      await expect(genreDropdown(page)).toContainText('NOVEL')

      expect(await genreAtModel(page, 'book1')).toMatchObject({
        kind: 'EEnumLiteral',
        name: 'FANTASY'
      })
    })

    test('normalisiert die Ordinalzahlen beim Serialisieren zu Literalen', async ({ page }) => {
      await selectByXmiId(page, 'book1')

      const xml = await serialized(page)
      expect(xml).toContain('genre="FANTASY"')
      expect(xml).toContain('genre="SCIFI"')
      expect(xml).not.toMatch(/genre="\d"/)
    })
  })
})
