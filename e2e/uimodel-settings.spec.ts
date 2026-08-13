/**
 * Settings-Page "Property Widgets" (Plan Abschnitt 9, D3).
 *
 * Deckt zwei Dinge ab, die sonst still kaputtgehen:
 * 1. Die Seite kennt nur EINE Regel-Art (bestimmtes Feature) — der frühere
 *    Umschalter "Alle Features eines Typs" ist entfernt.
 * 2. Gespeichert wird über den GLOBALEN Save-Button des Settings-Dialogs.
 *    Die Overlay-Regeln liegen in einer eigenen Datei, nicht im `.wsp`,
 *    deshalb ruft der Dialog `save()` der Seite über defineExpose auf —
 *    eine Verdrahtung quer durch eine dynamische Komponente, die bei einem
 *    Refactoring lautlos reißen würde.
 */
import { test, expect } from '@playwright/test'
import { waitForAppReady, loadEcoreModel, loadInstances } from './helpers'

const ECORE_PATH = '/test-data/uimodel-baseline/library.ecore'
const XMI_PATH = '/test-data/uimodel-baseline/library-instance.xmi'

test('Property-Widgets-Settings: nur Feature-Regeln, Speichern über den globalen Button', async ({ page }) => {
  await waitForAppReady(page)
  await page.waitForFunction(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    const pr = tsm?.getService?.('ui.registry.panels')
    return !!(tsm?.getService?.('ui.registry.perspectives') && pr?.get?.('instance-tree')
      && pr?.get?.('properties') && pr?.get?.('model-browser') && tsm?.getService?.('ui.uimodel.forms'))
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

  // Zahnrad in der ActivityBar öffnet den Workspace-Settings-Dialog
  await page.locator('i.pi-cog').first().click()
  await expect(page.locator('.settings-footer')).toBeVisible({ timeout: 10000 })

  await page.getByText('Property Widgets', { exact: false }).first().click()
  const panel = page.locator('.overlay-settings')
  await expect(panel).toBeVisible({ timeout: 5000 })

  // (1) Kein Regel-Modus-Umschalter und kein seiteneigener Speichern-Knopf
  await expect(panel.locator('.p-selectbutton')).toHaveCount(0)
  await expect(panel.getByText('Alle Features eines Typs')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Speichern' })).toHaveCount(0)

  // Regel über den Feature-Picker anlegen; der eType kommt aus dem Metamodell
  await panel.locator('.feature-picker-trigger').click()
  const picker = page.locator('.picker-dialog')
  await expect(picker).toBeVisible({ timeout: 5000 })
  await picker.locator('.picker-input').fill('author')
  await page.waitForTimeout(500)
  await picker.locator('.picker-item').filter({ hasText: 'author' }).first().click()
  await expect(panel.locator('.etype-info')).toContainText('EString')

  await panel.getByRole('button', { name: 'Hinzufuegen' }).click()
  await expect(panel.locator('.rules-table tbody tr')).toHaveCount(1)

  // (2) Die Seite meldet dirty → der globale Save-Button wird aktiv ...
  const saveBtn = page.locator('.settings-footer button', { hasText: /Save|Saving/ })
  await expect(saveBtn).toBeEnabled({ timeout: 5000 })
  await saveBtn.click()

  // ... und erreicht save() der Seite. Die E2E-Umgebung hat keine
  // Filesystem-Quelle (openWorkspace legt nur einen synthetischen Pfad an),
  // deshalb bricht save() mit genau dieser Meldung ab — sie wird
  // ausschliesslich dort gesetzt und ist damit der Beleg fuer den Aufruf.
  await expect(panel.locator('.status.error')).toHaveText('Kein Workspace geoeffnet.', { timeout: 5000 })
})

/**
 * Regression: die Feature-Auswahl muss auch beim nackten Einstieg gehen —
 * Settings direkt oeffnen, ohne vorher Workspace/Modelle zu laden.
 *
 * Genau dieser Pfad war kaputt: der PickerDialog kommt aus `ui-search`,
 * das nicht in den startupModules steht. Solange irgendein anderes
 * geladenes Plugin es mitzog (lokal: cocl-editor), fiel das nicht auf — im
 * Deployment, wo cocl-editor gar nicht ausgeliefert wird, blieb der Knopf
 * wirkungslos. Der obige Test verdeckte es, weil er vorher ein Modell laedt.
 *
 * Behoben ueber die Manifest-Abhaengigkeit von ui-uimodel-forms auf
 * ui-search (gleiches Muster wie cocl-editor).
 */
test('Feature-Picker oeffnet auch ohne geladenes Modell', async ({ page }) => {
  await waitForAppReady(page)
  await page.waitForFunction(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    return !!tsm?.getService?.('ui.uimodel.forms')
  }, undefined, { timeout: 60_000 })

  // Der Dienst, an dem es haengt — muss ohne Zutun verfuegbar sein
  const pickerVerfuegbar = await page.evaluate(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    return !!tsm?.getService?.('ui.search.components')?.PickerDialog
  })
  expect(pickerVerfuegbar, 'ui.search.components ist nicht registriert — ui-search wurde nicht geladen').toBe(true)

  // Perspektive oeffnen (die ActivityBar mit dem Zahnrad haengt daran) —
  // aber BEWUSST ohne Modelle zu laden, denn genau das Laden zog frueher
  // ui-search mit und verdeckte den Fehler.
  await page.evaluate(() => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    tsm.getService('ui.registry.perspectives').openWorkspace({}, '/e2e-test/workspace.xmi', 'model-editor')
  })
  await page.waitForTimeout(1500)

  await page.locator('i.pi-cog').first().click()
  await expect(page.locator('.settings-footer')).toBeVisible({ timeout: 10000 })
  await page.getByText('Property Widgets', { exact: false }).first().click()
  const panel = page.locator('.overlay-settings')
  await expect(panel).toBeVisible({ timeout: 5000 })

  // Der Klick muss den Dialog wirklich oeffnen (vorher: Flag gesetzt,
  // Dialog nie gerendert, weil PickerDialog null war)
  await panel.locator('.feature-picker-trigger').click()
  await expect(page.locator('.picker-dialog')).toBeVisible({ timeout: 5000 })
})
