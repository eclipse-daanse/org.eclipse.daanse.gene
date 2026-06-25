/**
 * E2E Test: Perspectives
 *
 * Tests perspective switching and registration:
 * - Explorer perspective is default
 * - Activity bar buttons switch perspectives
 * - Keyboard shortcuts switch perspectives
 */

import { test, expect } from '@playwright/test'
import { waitForAppReady } from './helpers'

test.describe('Perspectives', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test('explorer perspective is active by default', async ({ page }) => {
    // First activity item should be active (Explorer)
    const activeItem = page.locator('.activity-item.active')
    await expect(activeItem).toBeVisible()
  })

  test('explorer shows file explorer panel', async ({ page }) => {
    // Explorer perspective: sidebar contains "Add Source" button
    await expect(page.getByRole('button', { name: 'Add Source' })).toBeVisible()
  })

  test('clicking activity bar switches perspective', async ({ page }) => {
    const activityItems = page.locator('.activity-bar .activity-item')
    const count = await activityItems.count()

    if (count < 2) {
      test.skip(true, 'Only one perspective available')
      return
    }

    // Remember which item is initially active
    const firstItem = activityItems.first()
    const firstWasActive = await firstItem.evaluate(el => el.classList.contains('active'))

    // Click the second perspective button
    const secondItem = activityItems.nth(1)
    await secondItem.click()
    await page.waitForTimeout(500)

    // Second item should now be active
    await expect(secondItem).toHaveClass(/active/)

    // Click back to first
    await firstItem.click()
    await page.waitForTimeout(500)
    await expect(firstItem).toHaveClass(/active/)
  })

  test('Ctrl+1 activates explorer perspective', async ({ page }) => {
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(500)

    const firstItem = page.locator('.activity-bar .activity-item').first()
    await expect(firstItem).toHaveClass(/active/)
  })

  test('center area shows welcome when no workspace open', async ({ page }) => {
    // Without a workspace, the center shows the welcome screen
    await expect(page.locator('.welcome-title')).toContainText('GenE')
    await expect(page.locator('.welcome-subtitle')).toContainText('Generic EMF Editor')
  })
})
