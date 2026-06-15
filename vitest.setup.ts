/**
 * Vitest global setup.
 *
 * The TSM Vite plugin rewrites `import { x } from 'tsm:mod'` into
 * `const { x } = __tsm__.require('mod')`. In the running app the TSM runtime
 * installs `window.__tsm__`; in tests it isn't bootstrapped, so modules that use
 * `tsm:*` imports throw "__tsm__ is not defined" on import. Provide a minimal
 * global that resolves the shared libraries we test against to their real packages.
 */
import * as vue from 'vue'

const sharedModules: Record<string, any> = {
  vue,
}

;(globalThis as any).__tsm__ = {
  require: (id: string) => sharedModules[id] ?? {},
  register: () => {},
}