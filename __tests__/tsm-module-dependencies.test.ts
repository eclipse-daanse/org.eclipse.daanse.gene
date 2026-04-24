/**
 * TSM Module Dependency Tests
 *
 * Ensures no circular static VALUE imports exist between TSM modules.
 * Type-only imports (import type) are allowed and excluded from checks.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..')

// Discover all TSM modules by scanning for manifest.json
function discoverModules(): Map<string, string> {
  const modules = new Map<string, string>()

  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        const manifest = join(fullPath, 'manifest.json')
        if (existsSync(manifest)) {
          try {
            const json = JSON.parse(readFileSync(manifest, 'utf-8'))
            const id = json.id || json.name || entry.name
            modules.set(id, fullPath)
          } catch { /* skip */ }
        }
        scan(fullPath)
      }
    }
  }

  scan(join(ROOT, 'packages'))
  return modules
}

// Collect all .ts and .vue files in a directory
function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  if (!existsSync(dir)) return files

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue
      const fullPath = join(d, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
        files.push(fullPath)
      }
    }
  }

  walk(dir)
  return files
}

// Extract static VALUE imports from a file (exclude `import type`)
function getStaticValueImports(filePath: string, moduleIds: Set<string>): Set<string> {
  const imports = new Set<string>()
  const content = readFileSync(filePath, 'utf-8')

  // Extract <script> content from .vue files
  const source = filePath.endsWith('.vue')
    ? (content.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] || '')
    : content

  for (const line of source.split('\n')) {
    const trimmed = line.trim()

    // Skip type-only imports — these disappear at runtime
    if (trimmed.startsWith('import type ')) continue
    if (trimmed.startsWith('export type ')) continue

    // Match: import { X } from 'module-id'
    // Match: import X from 'module-id'
    // Match: export { X } from 'module-id'
    // Match: export * from 'module-id'
    const match = trimmed.match(/(?:import|export)\s+(?:\{[^}]*\}|[\w*]+).*?\s+from\s+['"]([^'"]+)['"]/)
    if (match) {
      const source = match[1]
      // Only track imports of other TSM modules (not relative, not tsm:, not @emfts, not node_modules)
      if (moduleIds.has(source)) {
        // Double-check: is this line a type-only import with inline `type` keyword?
        // e.g. import { type Foo } from 'bar' — all imports are types
        const importContent = trimmed.match(/\{([^}]*)\}/)
        if (importContent) {
          const members = importContent[1].split(',').map(m => m.trim())
          const hasValueImport = members.some(m => !m.startsWith('type ') && m.length > 0)
          if (hasValueImport) {
            imports.add(source)
          }
        } else {
          // Default import or star export — always a value import
          imports.add(source)
        }
      }
    }
  }

  return imports
}

// Build dependency graph: moduleId -> Set of moduleIds it imports (VALUE only)
function buildDependencyGraph(modules: Map<string, string>): Map<string, Set<string>> {
  const moduleIds = new Set(modules.keys())
  const graph = new Map<string, Set<string>>()

  for (const [id, path] of modules) {
    const deps = new Set<string>()
    const srcDir = join(path, 'src')
    const files = collectSourceFiles(srcDir)

    for (const file of files) {
      for (const dep of getStaticValueImports(file, moduleIds)) {
        if (dep !== id) { // skip self-imports
          deps.add(dep)
        }
      }
    }

    graph.set(id, deps)
  }

  return graph
}

// Detect circular dependencies using DFS
function findCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const stack = new Set<string>()
  const path: string[] = []

  function dfs(node: string) {
    if (stack.has(node)) {
      // Found a cycle — extract it from the path
      const cycleStart = path.indexOf(node)
      const cycle = [...path.slice(cycleStart), node]
      cycles.push(cycle)
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    stack.add(node)
    path.push(node)

    const deps = graph.get(node) || new Set()
    for (const dep of deps) {
      dfs(dep)
    }

    path.pop()
    stack.delete(node)
  }

  for (const node of graph.keys()) {
    dfs(node)
  }

  return cycles
}

// --- Tests ---

describe('TSM Module Dependencies', () => {
  const modules = discoverModules()
  const graph = buildDependencyGraph(modules)

  it('should discover TSM modules', () => {
    expect(modules.size).toBeGreaterThan(10)
  })

  it('should have no circular static VALUE imports between TSM modules', () => {
    const cycles = findCycles(graph)

    if (cycles.length > 0) {
      const cycleDescriptions = cycles.map(c => c.join(' → ')).join('\n  ')
      expect.fail(
        `Found ${cycles.length} circular dependency chain(s):\n  ${cycleDescriptions}\n\n` +
        'Fix by replacing static imports with TSM service access (tsm.getService()).'
      )
    }
  })

  it('should not have ui-instance-tree importing from ui-layout', () => {
    const deps = graph.get('ui-instance-tree') || new Set()
    expect(deps.has('ui-layout')).toBe(false)
  })

  it('should not have ui-model-browser importing from ui-instance-tree', () => {
    const deps = graph.get('ui-model-browser') || new Set()
    expect(deps.has('ui-instance-tree')).toBe(false)
  })

  it('should not have ui-instance-tree importing from ui-model-browser', () => {
    const deps = graph.get('ui-instance-tree') || new Set()
    expect(deps.has('ui-model-browser')).toBe(false)
  })

  // Phase 2: no module should statically import ui-model-browser
  it('should not have any module importing VALUE from ui-model-browser', () => {
    for (const [id, deps] of graph) {
      if (id !== 'ui-model-browser') {
        expect(deps.has('ui-model-browser'), `${id} imports ui-model-browser`).toBe(false)
      }
    }
  })

  // Phase 3+4: ui-layout should have zero cross-module VALUE dependencies
  it('should not have ui-layout importing from any other TSM module', () => {
    const deps = graph.get('ui-layout') || new Set()
    expect(deps.size, `ui-layout still imports: ${[...deps].join(', ')}`).toBe(0)
  })

  // Plugins should not import from other plugins (Phase 5 TODO)
  it.todo('should not have plugins importing from other plugins', () => {
    const pluginIds = [...modules.entries()]
      .filter(([_, path]) => path.includes('/plugins/'))
      .map(([id]) => id)

    for (const pluginId of pluginIds) {
      const deps = graph.get(pluginId) || new Set()
      for (const dep of deps) {
        const depPath = modules.get(dep)
        if (depPath?.includes('/plugins/') && dep !== pluginId) {
          expect.fail(`Plugin ${pluginId} imports from plugin ${dep}. Plugins should communicate via TSM services.`)
        }
      }
    }
  })

  it('should log the dependency graph for reference', () => {
    const lines: string[] = []
    for (const [id, deps] of [...graph.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (deps.size > 0) {
        lines.push(`${id} → ${[...deps].sort().join(', ')}`)
      }
    }
    console.log('\nTSM Module Dependency Graph (static VALUE imports only):\n' + lines.join('\n'))
  })
})
