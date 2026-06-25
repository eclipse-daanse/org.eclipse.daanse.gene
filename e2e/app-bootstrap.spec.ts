/**
 * E2E Test: App Bootstrap
 *
 * Verifies that the Gene application starts correctly:
 * - No unexpected console errors during startup
 * - Main layout renders
 * - TSM modules load successfully
 */

import { test, expect } from '@playwright/test'
import { waitForAppReady } from './helpers'

// Known non-critical console errors (XML parsing of config.xmi, network, etc.)
const KNOWN_ERROR_PATTERNS = [
  'favicon',
  'net::ERR_',
  '404',
  'XML Parse Error',
  'Unbound namespace prefix',
  'has no parent object',
  'Feature',
]

function isCriticalError(msg: string): boolean {
  return !KNOWN_ERROR_PATTERNS.some(pattern => msg.includes(pattern))
}

test.describe('App Bootstrap', () => {
  test('app loads without unexpected console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await waitForAppReady(page)

    const critical = errors.filter(isCriticalError)
    expect(critical).toEqual([])
  })

  test('main layout is rendered', async ({ page }) => {
    await waitForAppReady(page)

    await expect(page.locator('.gene-layout')).toBeVisible()
    await expect(page.locator('.activity-bar')).toBeVisible()
  })

  test('title bar shows Gene Workspace', async ({ page }) => {
    await waitForAppReady(page)

    const titleBar = page.locator('.title-bar')
    await expect(titleBar).toBeVisible()
    await expect(titleBar).toContainText('Gene Workspace')
  })

  test('TSM bootstrap completes', async ({ page }) => {
    const logs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text())
      }
    })

    // Navigate fresh so we capture all logs
    await page.goto('/')
    await page.waitForSelector('.gene-layout', { timeout: 15_000 })
    // Give TSM time to finish loading modules
    await page.waitForTimeout(3000)

    const hasBootstrapComplete = logs.some(l => l.includes('Bootstrap complete'))
    expect(hasBootstrapComplete).toBe(true)
  })
})
