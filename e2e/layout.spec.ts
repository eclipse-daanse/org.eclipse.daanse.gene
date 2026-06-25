/**
 * E2E Test: Layout
 *
 * Tests the main layout structure:
 * - Activity bar with perspective buttons
 * - Sidebar panels (left, right)
 * - Keyboard shortcuts for toggling panels
 */

import { test, expect } from '@playwright/test'
import { waitForAppReady } from './helpers'

test.describe('Layout', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)
  })

  test('activity bar shows perspective button', async ({ page }) => {
    const activityItems = page.locator('.activity-bar .activity-item')
    await expect(activityItems.first()).toBeVisible()
  })

  test('primary sidebar is visible in explorer perspective', async ({ page }) => {
    // Explorer perspective shows sidebar with EXPLORER / WORKSPACE tabs
    const sidebar = page.locator('.primary-sidebar')
    await expect(sidebar).toBeVisible()
  })

  test('sidebar shows Explorer and Workspace tabs', async ({ page }) => {
    await expect(page.locator('.sidebar-title:text("Explorer")')).toBeVisible()
    // Workspace tab may use a different class — match by text within the tab bar
    await expect(page.getByText('Workspace', { exact: false }).first()).toBeVisible()
  })

  test('Ctrl+B toggles primary sidebar visibility', async ({ page }) => {
    const sidebar = page.locator('.primary-sidebar')
    await expect(sidebar).toBeVisible()

    // Toggle off
    await page.keyboard.press('Control+b')
    await expect(sidebar).not.toBeVisible({ timeout: 2000 })

    // Toggle back on
    await page.keyboard.press('Control+b')
    await expect(sidebar).toBeVisible({ timeout: 2000 })
  })

  test('welcome screen shows GenE branding', async ({ page }) => {
    // When no workspace is open, the center shows a welcome/landing page
    await expect(page.locator('.welcome-title')).toContainText('GenE')
  })

  test('status bar is visible at bottom', async ({ page }) => {
    // The blue bar at the very bottom of the screen
    const statusItems = page.locator('.status-bar, .gene-layout > :last-child')
    await expect(statusItems).toBeVisible()
  })
})
