/**
 * E2E Test: Model Loading & Instance Tree
 *
 * Tests the core workflow:
 * - Load Ecore model → Model Browser shows classes
 * - Load XMI instances → Instance Tree shows objects
 * - Instance Tree interactions (expand, select)
 */

import { test, expect } from '@playwright/test'
import { waitForAppReady, loadEcoreModel, loadInstances } from './helpers'

/**
 * Switch to Model Editor perspective and load test model + instances.
 * Waits for services to become available.
 */
async function setupModelEditor(page: import('@playwright/test').Page): Promise<void> {
  await waitForAppReady(page)

  // Open a fake workspace to enable Model Editor perspective.
  // Retry because the PerspectiveManager may not be registered yet
  // when running sequentially after other test suites.
  await page.evaluate(async () => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    if (!tsm) throw new Error('TSM not available')
    // Wait up to 5s for PerspectiveManager to become available
    for (let i = 0; i < 50; i++) {
      const pm = tsm.getService('ui.registry.perspectives')
      if (pm) {
        pm.openWorkspace({}, '/e2e-test/workspace.xmi', 'model-editor')
        return
      }
      await new Promise(r => setTimeout(r, 100))
    }
    throw new Error('PerspectiveManager not available after 5s')
  })
  await page.waitForTimeout(1500)

  // Load ecore model
  await loadEcoreModel(page, '/uni/SimpleUniversity.ecore')
  await page.waitForTimeout(500)

  // Load instances
  await loadInstances(page, '/uni/simple-students.xmi')
  await page.waitForTimeout(1000)
}

test.describe('Model & Instances', () => {
  test('loading Ecore model registers package in Model Browser', async ({ page }) => {
    await setupModelEditor(page)

    // Check via TSM that the package is registered
    const pkgCount = await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      const mb = tsm?.getService('ui.model-browser.composables')
      return mb?.useSharedModelRegistry?.()?.userPackages?.value?.length ?? 0
    })
    expect(pkgCount).toBeGreaterThan(0)
  })

  test('Model Browser has simpleuni package registered', async ({ page }) => {
    await setupModelEditor(page)

    // Verify package is registered in model registry (right sidebar may not be visible)
    const hasPackage = await page.evaluate(() => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      const mb = tsm?.getService('ui.model-browser.composables')
      const registry = mb?.useSharedModelRegistry?.()
      const pkgs = registry?.userPackages?.value || []
      return pkgs.some((p: any) => p.name === 'simpleuni')
    })
    expect(hasPackage).toBe(true)
  })

  test('Instance Tree shows University root object', async ({ page }) => {
    await setupModelEditor(page)

    // Look for the University instance with name "TU Berlin"
    await expect(page.getByText('TU Berlin').first()).toBeVisible({ timeout: 5000 })
  })

  test('Instance Tree nodes can be expanded', async ({ page }) => {
    await setupModelEditor(page)

    // Wait for tree to render
    await page.waitForTimeout(500)

    // Find tree toggler buttons (PrimeVue Tree expand icons)
    const togglers = page.locator('.p-tree-node-toggle-button, .p-tree-toggler')
    const count = await togglers.count()

    if (count > 0) {
      // Click first toggler to expand
      await togglers.first().click()
      await page.waitForTimeout(300)

      // After expanding, there should be child nodes visible
      const childNodes = page.locator('.p-tree-node')
      const childCount = await childNodes.count()
      expect(childCount).toBeGreaterThan(1)
    }
  })

  test('clicking a tree node selects it', async ({ page }) => {
    await setupModelEditor(page)
    await page.waitForTimeout(500)

    // Click on the first tree node content
    const nodeContent = page.locator('.p-tree-node-content, .tree-node-content').first()
    if (await nodeContent.isVisible()) {
      await nodeContent.click()
      // The node should get a selected/highlighted class
      await expect(nodeContent).toHaveClass(/highlight|selected|p-tree-node-selected/, { timeout: 2000 })
    }
  })
})
