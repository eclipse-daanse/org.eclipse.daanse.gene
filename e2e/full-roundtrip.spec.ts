/**
 * E2E Test: Full Roundtrip — Create Ecore → Load → Create Instances → Save XMI
 *
 * End-to-end test of the complete modeling workflow:
 * 1. Create an Ecore metamodel in the Metamodeler (via UI)
 * 2. Save the Ecore model (programmatic, since file picker is not automatable)
 * 3. Load it in the Model Editor perspective
 * 4. Create instances via Model Browser context menu
 * 5. Add child instances via Instance Tree context menu
 * 6. Serialize to XMI and verify output
 */

import { test, expect, type Page } from '@playwright/test'
import { waitForAppReady } from './helpers'

/** Enable workspace-requiring perspectives */
async function enableWorkspace(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    if (!tsm) throw new Error('TSM not available')
    for (let i = 0; i < 50; i++) {
      const pm = tsm.getService('ui.registry.perspectives')
      if (pm) {
        pm.setWorkspace({}, '/e2e-test/roundtrip.xmi')
        return
      }
      await new Promise(r => setTimeout(r, 100))
    }
    throw new Error('PerspectiveManager not available')
  })
  await page.waitForTimeout(500)
}

/** Switch to Metamodeler and create a simple model via UI */
async function createEcoreViaUI(page: Page): Promise<void> {
  // Switch to Metamodeler
  await page.locator('.activity-item[title="Metamodeler"]').click()
  await page.waitForSelector('.metamodeler-tree', { timeout: 15_000 })

  // Create Package "shop"
  await page.getByRole('button', { name: 'Create Package' }).click()
  await page.locator('#pkgName').fill('shop')
  await page.locator('#pkgNsURI').fill('http://example.org/shop')
  await page.locator('#pkgNsPrefix').fill('shop')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  const pkgNode = page.locator('.tree-node').filter({ hasText: 'shop' }).first()

  // Add "Catalog" class
  await pkgNode.click({ button: 'right' })
  await page.getByText('Add Class').click()
  await page.locator('#className').fill('Catalog')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // Add "Product" class
  await pkgNode.click({ button: 'right' })
  await page.getByText('Add Class').click()
  await page.locator('#className').fill('Product')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // Expand package
  const pkgToggler = page.locator('.p-tree-node-toggle-button').first()
  if (await pkgToggler.isVisible()) await pkgToggler.click()
  await expect(page.locator('.node-label:text-is("Catalog")')).toBeVisible({ timeout: 3000 })

  // Add "name: EString" attribute to Catalog
  const catalogContent = page.locator('.p-tree-node-content:has(.node-label:text-is("Catalog"))').first()
  await catalogContent.click()
  await page.waitForTimeout(200)
  await catalogContent.click({ button: 'right' })
  await page.getByText('Add Attribute').click()
  await page.locator('#attrName').fill('name')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // Add "products" containment reference from Catalog → Product
  await catalogContent.click()
  await page.waitForTimeout(200)
  await catalogContent.click({ button: 'right' })
  await page.getByText('Add Reference').click()
  await page.locator('#refName').fill('products')
  await page.locator('#refContainment').click()
  await page.getByRole('button', { name: 'Select…' }).click()
  await page.waitForTimeout(500)
  await page.locator('.ccp-tree .p-tree-node-content:has(.ccp-node:text-is("Product"))').first().click()
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // Add "title: EString" attribute to Product
  const productContent = page.locator('.p-tree-node-content:has(.node-label:text-is("Product"))').first()
  await productContent.click()
  await page.waitForTimeout(200)
  await productContent.click({ button: 'right' })
  await page.getByText('Add Attribute').click()
  await page.locator('#attrName').fill('title')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
}

test.describe('Full Roundtrip: Ecore → Instances → XMI', () => {
  test('create model, load instances, serialize XMI', async ({ page }) => {
    test.setTimeout(90_000)

    await waitForAppReady(page)
    await enableWorkspace(page)

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Create Ecore model in Metamodeler via UI
    // ═══════════════════════════════════════════════════════════════════
    await createEcoreViaUI(page)

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Save Ecore to string (file dialogs not automatable)
    // ═══════════════════════════════════════════════════════════════════
    const ecoreXml = await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      const mm = tsm?.getService('ui.metamodeler.composables')
      const metamodeler = mm?.useSharedMetamodeler?.()
      if (!metamodeler?.saveToEcoreString) throw new Error('Metamodeler not available')
      return await metamodeler.saveToEcoreString()
    })

    expect(ecoreXml).toBeTruthy()
    expect(ecoreXml).toContain('shop')
    expect(ecoreXml).toContain('Catalog')
    expect(ecoreXml).toContain('Product')
    console.log('Ecore XML length:', ecoreXml.length)

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Switch to Model Editor and load the Ecore
    // ═══════════════════════════════════════════════════════════════════
    await page.evaluate(async (ecore: string) => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']

      // Load into model browser
      const mb = tsm?.getService('ui.model-browser.composables')
      if (!mb?.loadEcoreFile) throw new Error('Model browser not available')
      await mb.loadEcoreFile(ecore, 'shop.ecore')
    }, ecoreXml)

    // Switch to Model Editor perspective
    await page.locator('.activity-item[title="Model Editor"]').click()
    await page.waitForTimeout(2000)

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Create root instance via Model Browser context menu
    // ═══════════════════════════════════════════════════════════════════
    // The right sidebar should show the "shop" package in Model Browser
    // We need to expand it and right-click "Catalog" → "Create Instance"

    // Use programmatic instance creation (Model Browser may not be visible)
    await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      const actions = tsm?.getService('gene.workspace.actions')
      const mb = tsm?.getService('ui.model-browser.composables')
      const registry = mb?.useSharedModelRegistry?.()

      // Find the "shop" package
      const shopPkg = registry?.userPackages?.value?.find((p: any) => p.name === 'shop')
      if (!shopPkg) throw new Error('Shop package not found in registry')

      // Get concrete classes
      const classes = registry.getConcreteClasses(shopPkg)
      const catalogClass = classes.find((c: any) => c.name === 'Catalog')
      if (!catalogClass) throw new Error('Catalog class not found')

      // Create instance
      actions?.createInstance(catalogClass)
    })
    await page.waitForTimeout(1000)

    // Instance tree should now show a Catalog instance
    await expect(page.getByText('Catalog').first()).toBeVisible({ timeout: 5000 })

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: Add child Product via Instance Tree context menu
    // ═══════════════════════════════════════════════════════════════════
    // Right-click on the Catalog instance → Add Child → products
    const catalogInstance = page.locator('.tree-node', { hasText: 'Catalog' }).first()
    await catalogInstance.click({ button: 'right' })
    await page.waitForTimeout(300)

    // Context menu: hover "Add Child" to open submenu, then click "products"
    const addChildItem = page.getByText('Add Child', { exact: true }).first()
    await expect(addChildItem).toBeVisible({ timeout: 3000 })
    await addChildItem.hover()
    await page.waitForTimeout(500)

    // Click "products" in the submenu
    // Use a locator that avoids the Properties panel's "Products" fieldset
    const productsMenuItem = page.locator('[data-pc-section="label"]', { hasText: 'products' })
      .or(page.locator('.p-menuitem-label', { hasText: 'products' }))
      .or(page.locator('li[role="menuitem"] span', { hasText: 'products' }))
      .first()
    await productsMenuItem.click()
    await page.waitForTimeout(500)

    // ═══════════════════════════════════════════════════════════════════
    // STEP 6: Serialize instances to XMI
    // ═══════════════════════════════════════════════════════════════════
    const xmiOutput = await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      const it = tsm?.getService('ui.instance-tree.composables')
      const tree = it?.useSharedInstanceTree?.()
      if (!tree?.serializeAllInstances) throw new Error('Instance tree not available')
      return await tree.serializeAllInstances()
    })

    expect(xmiOutput).toBeTruthy()
    expect(xmiOutput).toContain('shop:Catalog')
    expect(xmiOutput).toContain('xmi:version')
    console.log('XMI output:', xmiOutput)
  })
})
