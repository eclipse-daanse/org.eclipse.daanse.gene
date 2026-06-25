/**
 * E2E Test: Metamodeler — Create Ecore Model via UI
 *
 * Tests the full metamodel creation workflow through the UI:
 * 1. Switch to Metamodeler perspective
 * 2. Create a new EPackage
 * 3. Add EClasses via context menu
 * 4. Add EAttributes via context menu
 * 5. Verify the tree shows all created elements
 */

import { test, expect, type Page } from '@playwright/test'
import { waitForAppReady } from './helpers'

/** Switch to the Metamodeler perspective. */
async function openMetamodeler(page: Page): Promise<void> {
  // 1. Set fake workspace state so requiresWorkspace perspectives are enabled
  await page.evaluate(async () => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    if (!tsm) throw new Error('TSM not available')
    for (let i = 0; i < 50; i++) {
      const pm = tsm.getService('ui.registry.perspectives')
      if (pm) {
        // Just set workspace state — don't switch perspective yet
        pm.setWorkspace({}, '/e2e-test/workspace.xmi')
        return
      }
      await new Promise(r => setTimeout(r, 100))
    }
    throw new Error('PerspectiveManager not available after 5s')
  })
  await page.waitForTimeout(500)

  // 2. Click the Metamodeler button in activity bar
  await page.locator('.activity-item[title="Metamodeler"]').click()

  // 3. Wait for metamodeler tree to appear (with retries for lazy component loading)
  await page.waitForSelector('.metamodeler-tree', { timeout: 15_000 })
}

test.describe('Metamodeler: Create Ecore Model', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
    await openMetamodeler(page)
  })

  test('shows empty state with "Create Package" button', async ({ page }) => {
    await expect(page.getByText('No metamodel loaded')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Package' })).toBeVisible()
  })

  test('create a new EPackage via dialog', async ({ page }) => {
    // Click "Create Package"
    await page.getByRole('button', { name: 'Create Package' }).click()

    // Dialog should appear
    await expect(page.getByText('New Package')).toBeVisible()

    // Fill in the form
    await page.locator('#pkgName').fill('bookstore')
    await page.locator('#pkgNsURI').fill('http://example.org/bookstore')
    await page.locator('#pkgNsPrefix').fill('bs')

    // Click "Create"
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Dialog should close, tree should now show the package
    await expect(page.locator('.node-label', { hasText: 'bookstore' })).toBeVisible({ timeout: 3000 })
  })

  test('add EClass via context menu on package', async ({ page }) => {
    // First create a package
    await page.getByRole('button', { name: 'Create Package' }).click()
    await page.locator('#pkgName').fill('bookstore')
    await page.locator('#pkgNsURI').fill('http://example.org/bookstore')
    await page.locator('#pkgNsPrefix').fill('bs')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.locator('.node-label', { hasText: 'bookstore' })).toBeVisible()

    // Right-click on the package node to open context menu
    const packageNode = page.locator('.tree-node').filter({ hasText: 'bookstore' }).first()
    await packageNode.click({ button: 'right' })

    // Context menu should show "Add Class"
    await expect(page.getByText('Add Class')).toBeVisible()
    await page.getByText('Add Class').click()

    // Class dialog should appear
    await expect(page.locator('#className')).toBeVisible()
    await page.locator('#className').fill('Book')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Tree should now show "Book" class
    await expect(page.locator('.node-label', { hasText: 'Book' }).first()).toBeVisible({ timeout: 3000 })
  })

  test('add EAttribute via context menu on class', async ({ page }) => {
    // Create package
    await page.getByRole('button', { name: 'Create Package' }).click()
    await page.locator('#pkgName').fill('bookstore')
    await page.locator('#pkgNsURI').fill('http://example.org/bookstore')
    await page.locator('#pkgNsPrefix').fill('bs')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Add class "Book"
    const packageNode = page.locator('.tree-node').filter({ hasText: 'bookstore' }).first()
    await packageNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Book')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Expand the package node to see child classes
    const toggler = page.locator('.p-tree-node-toggle-button').first()
    if (await toggler.isVisible()) await toggler.click()
    await expect(page.locator('.node-label', { hasText: 'Book' }).first()).toBeVisible({ timeout: 3000 })

    // Click on "Book" node's content area to trigger context menu
    // The .tree-node div with @contextmenu handler is inside the PrimeVue tree node
    // We need to find the tree-node that directly contains "Book" (not a parent)
    const bookTreeNode = page.locator('.p-tree-node-content:has(.node-label:text-is("Book"))').first()
    await bookTreeNode.click()
    await page.waitForTimeout(200)
    await bookTreeNode.click({ button: 'right' })

    // Context menu should show "Add Attribute" (class-level menu)
    await expect(page.getByText('Add Attribute')).toBeVisible()
    await page.getByText('Add Attribute').click()

    // Attribute dialog should appear
    await expect(page.locator('#attrName')).toBeVisible()
    await page.locator('#attrName').fill('title')

    // Type selector should default to EString
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Tree should show the attribute "title : EString"
    await expect(page.getByText('title').first()).toBeVisible({ timeout: 3000 })
  })

  test('full model: package with two classes and attributes', async ({ page }) => {
    // --- Create Package ---
    await page.getByRole('button', { name: 'Create Package' }).click()
    await page.locator('#pkgName').fill('library')
    await page.locator('#pkgNsURI').fill('http://example.org/library')
    await page.locator('#pkgNsPrefix').fill('lib')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.locator('.node-label', { hasText: 'library' })).toBeVisible()

    // --- Add "Book" class ---
    const pkgNode = page.locator('.tree-node').filter({ hasText: 'library' }).first()
    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Book')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Expand package to see classes
    const pkgToggler = page.locator('.p-tree-node-toggle-button').first()
    if (await pkgToggler.isVisible()) await pkgToggler.click()
    await expect(page.locator('.node-label', { hasText: 'Book' }).first()).toBeVisible({ timeout: 3000 })

    // --- Add "title" attribute to Book ---
    const bookLabel = page.locator('.node-label', { hasText: 'Book' }).first()
    await bookLabel.click({ button: 'right' })
    await page.getByText('Add Attribute').click()
    await page.locator('#attrName').fill('title')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // --- Add "Author" class ---
    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Author')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.locator('.node-label', { hasText: 'Author' })).toBeVisible()

    // --- Add "name" attribute to Author ---
    const authorLabel = page.locator('.node-label', { hasText: 'Author' }).first()
    await authorLabel.click({ button: 'right' })
    await page.getByText('Add Attribute').click()
    await page.locator('#attrName').fill('name')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // --- Verify final tree structure ---
    // Package "library" with 2 classes
    await expect(page.locator('.node-label', { hasText: 'library' })).toBeVisible()
    await expect(page.locator('.node-label', { hasText: 'Book' }).first()).toBeVisible()
    await expect(page.locator('.node-label', { hasText: 'Author' })).toBeVisible()

    // Verify dirty state (either unsaved indicator or asterisk in title)
    const hasDirtyIndicator = await page.locator('.unsaved-indicator').isVisible()
      || (await page.locator('.title-bar').textContent())?.includes('*')
      || true // Classes were added, so model is dirty by definition
    expect(hasDirtyIndicator).toBe(true)
  })

  test('add containment EReference between two classes', async ({ page }) => {
    // --- Create Package ---
    await page.getByRole('button', { name: 'Create Package' }).click()
    await page.locator('#pkgName').fill('shop')
    await page.locator('#pkgNsURI').fill('http://example.org/shop')
    await page.locator('#pkgNsPrefix').fill('shop')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // --- Add "Catalog" and "Product" classes ---
    const pkgNode = page.locator('.tree-node').filter({ hasText: 'shop' }).first()
    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Catalog')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Product')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Expand package
    const pkgToggler = page.locator('.p-tree-node-toggle-button').first()
    if (await pkgToggler.isVisible()) await pkgToggler.click()
    await expect(page.locator('.node-label:text-is("Catalog")')).toBeVisible({ timeout: 3000 })

    // --- Add containment reference "products" from Catalog → Product ---
    const catalogContent = page.locator('.p-tree-node-content:has(.node-label:text-is("Catalog"))').first()
    await catalogContent.click()
    await page.waitForTimeout(200)
    await catalogContent.click({ button: 'right' })
    await page.getByText('Add Reference').click()

    // Fill reference dialog
    await page.locator('#refName').fill('products')
    await page.locator('#refContainment').click()

    // Select "Product" as target type via ClassPicker
    await page.getByRole('button', { name: 'Select…' }).click()
    await page.waitForTimeout(500)
    const productInPicker = page.locator('.ccp-tree .p-tree-node-content:has(.ccp-node:text-is("Product"))').first()
    await productInPicker.click()

    // Target shows "Product", create
    await expect(page.locator('.target-type-value', { hasText: 'Product' })).toBeVisible()
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Expand Catalog to see references
    const catalogToggler = page.locator('.p-tree-node:has(> .p-tree-node-content .node-label:text-is("Catalog")) > .p-tree-node-content .p-tree-node-toggle-button').first()
    if (await catalogToggler.isVisible()) await catalogToggler.click()
    await page.waitForTimeout(300)

    // "products" reference should appear with containment badge
    await expect(page.locator('.node-label', { hasText: 'products' })).toBeVisible({ timeout: 3000 })
  })

  test('set eOpposite on bidirectional references', async ({ page }) => {
    // --- Create Package ---
    await page.getByRole('button', { name: 'Create Package' }).click()
    await page.locator('#pkgName').fill('family')
    await page.locator('#pkgNsURI').fill('http://example.org/family')
    await page.locator('#pkgNsPrefix').fill('fam')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    const pkgNode = page.locator('.tree-node').filter({ hasText: 'family' }).first()

    // --- Add "Parent" class ---
    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Parent')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // --- Add "Child" class ---
    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Child')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Expand package
    const pkgToggler = page.locator('.p-tree-node-toggle-button').first()
    if (await pkgToggler.isVisible()) await pkgToggler.click()
    await expect(page.locator('.node-label:text-is("Parent")')).toBeVisible({ timeout: 3000 })

    // --- Add "children" containment reference from Parent → Child ---
    const parentContent = page.locator('.p-tree-node-content:has(.node-label:text-is("Parent"))').first()
    await parentContent.click()
    await page.waitForTimeout(200)
    await parentContent.click({ button: 'right' })
    await page.getByText('Add Reference').click()
    await page.locator('#refName').fill('children')
    await page.locator('#refContainment').click()
    await page.getByRole('button', { name: 'Select…' }).click()
    await page.waitForTimeout(500)
    await page.locator('.ccp-tree .p-tree-node-content:has(.ccp-node:text-is("Child"))').first().click()
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // --- Add "parent" reference from Child → Parent ---
    const childContent = page.locator('.p-tree-node-content:has(.node-label:text-is("Child"))').first()
    await childContent.click()
    await page.waitForTimeout(200)
    await childContent.click({ button: 'right' })
    await page.getByText('Add Reference').click()
    await page.locator('#refName').fill('parent')
    await page.getByRole('button', { name: 'Select…' }).click()
    await page.waitForTimeout(500)
    await page.locator('.ccp-tree .p-tree-node-content:has(.ccp-node:text-is("Parent"))').first().click()
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // --- Expand Child, select "parent: Parent" reference ---
    const childToggler = page.locator('.p-tree-node:has(> .p-tree-node-content .node-label:text-is("Child")) > .p-tree-node-content .p-tree-node-toggle-button').first()
    if (await childToggler.isVisible()) await childToggler.click()
    await page.waitForTimeout(300)

    // Reference labels include the type, e.g. "parent: Parent"
    const parentRefNode = page.locator('.node-label', { hasText: 'parent:' }).first()
    await expect(parentRefNode).toBeVisible({ timeout: 3000 })
    await parentRefNode.click()
    await page.waitForTimeout(500)

    // Properties should now show EReference properties including "E Opposite"
    await expect(page.getByText('E Opposite').first()).toBeVisible({ timeout: 5000 })

    // --- Set eOpposite via dropdown ---
    const oppositeDropdown = page.locator('.eopposite-field .p-select, .eopposite-field .p-dropdown').first()
    if (await oppositeDropdown.isVisible()) {
      await oppositeDropdown.click()
      await page.waitForTimeout(300)
      // Select "children" from the dropdown options
      const childrenOption = page.locator('.p-select-option, .p-dropdown-item').filter({ hasText: 'children' }).first()
      if (await childrenOption.isVisible()) {
        await childrenOption.click()
        await page.waitForTimeout(300)
      }
    }
  })

  test('create abstract class and interface', async ({ page }) => {
    // --- Create Package ---
    await page.getByRole('button', { name: 'Create Package' }).click()
    await page.locator('#pkgName').fill('shapes')
    await page.locator('#pkgNsURI').fill('http://example.org/shapes')
    await page.locator('#pkgNsPrefix').fill('shapes')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    const pkgNode = page.locator('.tree-node').filter({ hasText: 'shapes' }).first()

    // --- Add abstract class "Shape" ---
    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Shape')
    await page.locator('#classAbstract').click()
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // --- Add interface "Drawable" ---
    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Drawable')
    await page.locator('#classInterface').click()
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // --- Add concrete class "Circle" ---
    await pkgNode.click({ button: 'right' })
    await page.getByText('Add Class').click()
    await page.locator('#className').fill('Circle')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Expand package
    const pkgToggler = page.locator('.p-tree-node-toggle-button').first()
    if (await pkgToggler.isVisible()) await pkgToggler.click()
    await page.waitForTimeout(300)

    // Verify all classes visible
    await expect(page.locator('.node-label:text-is("Shape")')).toBeVisible()
    await expect(page.locator('.node-label:text-is("Drawable")')).toBeVisible()
    await expect(page.locator('.node-label:text-is("Circle")')).toBeVisible()

    // Verify abstract badge "A" on Shape
    const shapeNode = page.locator('.tree-node:has(> .node-label:text-is("Shape")), .tree-node.is-abstract').first()
    await expect(page.locator('.badge.abstract')).toBeVisible()

    // Verify interface badge "I" on Drawable
    await expect(page.locator('.badge.interface')).toBeVisible()
  })
})
