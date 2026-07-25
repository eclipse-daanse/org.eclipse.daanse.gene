/**
 * E2E Test: Instance Tree — move / drop validation (beside & into)
 *
 * Exercises the drag-and-drop move logic through the real app via the
 * `ui.instance-tree.composables` service. Native HTML5 drag-and-drop is not
 * simulated (unreliable in Playwright with PrimeVue's dataTransfer handling);
 * instead we drive the exact functions the drop handler calls:
 *   - canMoveBeside / moveObjectBeside  (insert as sibling, before/after)
 *   - canDropInto / moveInto            (insert as child of a target)
 *
 * Fixture (public/uni/move-test.*):
 *   Library { books: Book[*], featured: Book[*], owner: Person[0..1] }
 *   Book    { title, chapters: Book[*] }
 *   Person  { name }
 *   Instance: Library{ books:[A(chapters:[A.1]), B], featured:[C], owner:P }
 */

import { test, expect } from '@playwright/test'
import { waitForAppReady, loadEcoreModel, loadInstances } from './helpers'

test.describe('Instance Tree: move / drop validation', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page)

    // Open the Model Editor perspective so the model-browser / instance-tree
    // services become available (retry until the PerspectiveManager is ready).
    await page.evaluate(async () => {
      const appEl = document.querySelector('#app') as any
      const tsm = appEl?.__vue_app__?._context?.provides?.['tsm']
      if (!tsm) throw new Error('TSM not available')
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

    await loadEcoreModel(page, '/uni/move-test.ecore')
    await page.waitForTimeout(300)
    await loadInstances(page, '/uni/move-test.xmi')
    await page.waitForTimeout(500)
  })

  // Preamble injected into every page.evaluate: resolves the shared instance tree
  // and a few navigation helpers over the loaded model.
  const PREAMBLE = `
    const tsm = document.querySelector('#app')?.__vue_app__?._context?.provides?.['tsm'];
    if (!tsm) throw new Error('TSM not available');
    const tree = tsm.getService('ui.instance-tree.composables').useSharedInstanceTree();
    const roots = Array.from(tree.getRootObjects());
    const lib = roots.find(o => o.eClass().getName() === 'Library');
    const g = (o, n) => o.eGet(o.eClass().getEStructuralFeature(n));
    const arr = (v) => Array.from(v);
  `
  const run = (page: import('@playwright/test').Page, body: string) =>
    page.evaluate(`(() => { ${PREAMBLE}\n${body} })()`) as Promise<any>

  test('canDropInto: target with two matching containment refs offers both (dialog case)', async ({ page }) => {
    const r = await run(page, `
      const bookB = arr(g(lib, 'books'))[1];
      const res = tree.canDropInto(bookB, lib);
      return { ok: res.ok, refs: res.refs.map(x => x.getName()).sort() };
    `)
    expect(r.ok).toBe(true)
    // Both Book-typed containments are eligible; the Person-typed 'owner' is excluded.
    expect(r.refs).toEqual(['books', 'featured'])
  })

  test('moveInto: object is inserted into the chosen reference', async ({ page }) => {
    const r = await run(page, `
      const bookB = arr(g(lib, 'books'))[1];
      const featured = tree.canDropInto(bookB, lib).refs.find(x => x.getName() === 'featured');
      const ok = tree.moveInto(bookB, lib, featured);
      return {
        ok,
        containedIn: bookB.eContainingFeature().getName(),
        booksNow: arr(g(lib, 'books')).length,
        featuredNow: arr(g(lib, 'featured')).length
      };
    `)
    expect(r.ok).toBe(true)
    expect(r.containedIn).toBe('featured')
    expect(r.booksNow).toBe(1)     // only bookA remains
    expect(r.featuredNow).toBe(2)  // bookC + bookB
  })

  test('canMoveBeside: type-incompatible sibling is rejected with a reason', async ({ page }) => {
    const r = await run(page, `
      const person = g(lib, 'owner');
      const bookA = arr(g(lib, 'books'))[0];
      const res = tree.canMoveBeside(person, bookA);
      return { ok: res.ok, reason: res.reason || '' };
    `)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('nicht erlaubt')
  })

  test('canDropInto: dropping into own subtree is rejected (cycle guard)', async ({ page }) => {
    const r = await run(page, `
      const bookA = arr(g(lib, 'books'))[0];
      const chap1 = arr(g(bookA, 'chapters'))[0];
      const res = tree.canDropInto(bookA, chap1);
      return { ok: res.ok };
    `)
    expect(r.ok).toBe(false)
  })

  test('moveObjectBeside: valid reorder across containments (Book beside Book)', async ({ page }) => {
    const r = await run(page, `
      const bookA = arr(g(lib, 'books'))[0];
      const bookC = arr(g(lib, 'featured'))[0];
      const ok = tree.moveObjectBeside(bookC, bookA, true);
      return {
        ok,
        containedIn: bookC.eContainingFeature().getName(),
        booksNow: arr(g(lib, 'books')).length
      };
    `)
    expect(r.ok).toBe(true)
    expect(r.containedIn).toBe('books')  // moved from 'featured' into 'books'
    expect(r.booksNow).toBe(3)           // bookA + bookB + moved bookC
  })
})
