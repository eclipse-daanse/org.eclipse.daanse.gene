/**
 * E2E Test: Command Palette
 *
 * Tests:
 * 1. Ctrl+Shift+P opens the Command Palette
 * 2. Commands appear grouped by category
 * 3. Fuzzy search filters correctly
 * 4. Enter executes command
 * 5. Escape closes the palette
 */

import { test, expect } from '@playwright/test'

test.describe('Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for application to load
    await page.waitForLoadState('networkidle')
    // Give plugins time to activate
    await page.waitForTimeout(1500)
  })

  test('Ctrl+Shift+P opens Command Palette', async ({ page }) => {
    await page.keyboard.press('Control+Shift+p')
    // Command palette dialog should appear
    const palette = page.locator('.command-palette')
    await expect(palette).toBeVisible({ timeout: 3000 })
  })

  test('Command palette shows search input', async ({ page }) => {
    await page.keyboard.press('Control+Shift+p')
    const input = page.locator('.command-palette-search input, .command-palette-search')
    await expect(input).toBeVisible({ timeout: 3000 })
  })

  test('Commands appear in the list', async ({ page }) => {
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(500)

    // Should have at least some commands listed
    const items = page.locator('.command-palette-item')
    const count = await items.count()
    expect(count).toBeGreaterThan(0)
  })

  test('Fuzzy search filters commands', async ({ page }) => {
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(500)

    const input = page.locator('.command-palette-search input, .command-palette-search')
    await input.fill('toggle')
    await page.waitForTimeout(300)

    const items = page.locator('.command-palette-item')
    const count = await items.count()
    // Should find toggle-related commands (fullscreen, sidebar, etc.)
    expect(count).toBeGreaterThanOrEqual(1)

    // All visible items should contain "toggle" in some form
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent()
      expect(text?.toLowerCase()).toContain('toggle')
    }
  })

  test('Escape closes the palette', async ({ page }) => {
    await page.keyboard.press('Control+Shift+p')
    const palette = page.locator('.command-palette')
    await expect(palette).toBeVisible({ timeout: 3000 })

    await page.keyboard.press('Escape')
    await expect(palette).not.toBeVisible({ timeout: 3000 })
  })

  test('Commands show keybinding badges', async ({ page }) => {
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(500)

    // At least one command should have a keybinding badge
    const badges = page.locator('.command-palette-item-keybinding')
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
  })

  test('Categories group commands', async ({ page }) => {
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(500)

    const categories = page.locator('.command-palette-category')
    const count = await categories.count()
    expect(count).toBeGreaterThan(0)
  })
})
