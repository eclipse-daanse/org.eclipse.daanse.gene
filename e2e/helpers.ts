import { type Page } from '@playwright/test'

/**
 * Wait for the Gene app to fully bootstrap (TSM modules loaded, layout rendered).
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('.gene-layout', { timeout: 15_000 })
  await page.waitForSelector('.activity-bar .activity-item', { timeout: 10_000 })
}

/**
 * Get TSM plugin system from the Vue app's provides.
 * Must be called inside page.evaluate().
 */
function getTsmSnippet(): string {
  return `
    const appEl = document.querySelector('#app');
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm'];
    if (!tsm) throw new Error('TSM not available');
  `
}

/**
 * Open a workspace by fetching a .xmi/.wsp file and calling the workspace action service.
 * This triggers model + instance loading as defined in the workspace config.
 */
export async function openWorkspace(page: Page, publicPath: string): Promise<void> {
  await page.evaluate(async (path) => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    if (!tsm) throw new Error('TSM not available')

    const resp = await fetch(path)
    const content = await resp.text()
    const actions = tsm.getService('gene.workspace.actions')
    if (!actions?.openWorkspace) throw new Error('Workspace actions not available')
    await actions.openWorkspace({ name: path.split('/').pop(), path }, content)
  }, publicPath)
  // Wait for models + instances to load
  await page.waitForTimeout(3000)
}

/**
 * Load an Ecore model into the Model Browser via TSM services.
 */
export async function loadEcoreModel(page: Page, publicPath: string): Promise<void> {
  await page.evaluate(async (path) => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    if (!tsm) throw new Error('TSM not available')

    const resp = await fetch(path)
    const content = await resp.text()
    const modelBrowser = tsm.getService('ui.model-browser.composables')
    if (!modelBrowser?.loadEcoreFile) throw new Error('Model browser service not available')
    await modelBrowser.loadEcoreFile(content, path)
  }, publicPath)
}

/**
 * Load XMI instances into the Instance Tree via TSM services.
 */
export async function loadInstances(page: Page, publicPath: string): Promise<void> {
  await page.evaluate(async (path) => {
    const appEl = document.querySelector('#app') as any
    const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
    if (!tsm) throw new Error('TSM not available')

    const resp = await fetch(path)
    const content = await resp.text()
    const instanceTree = tsm.getService('ui.instance-tree.composables')
    if (!instanceTree?.loadInstancesFromXMI) throw new Error('Instance tree service not available')
    await instanceTree.loadInstancesFromXMI(content, path)
  }, publicPath)
}
