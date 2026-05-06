/**
 * Vite Plugin: v-tid Test ID Transform
 *
 * Transforms `v-tid="'action'"` directives into `data-testid="{moduleId}.{Component}.{action}"`
 * at compile time. In production builds, the directive is stripped entirely.
 *
 * The module ID is resolved from the file path by finding the closest manifest.json
 * in the packages/ directory. The component name is derived from the .vue filename.
 *
 * Usage in templates:
 *   <Button v-tid="'add-icon'" />
 *
 * Dev output:
 *   <button data-testid="ui-layout.WorkspaceSettingsDialog.add-icon" />
 *
 * Prod output:
 *   <button />
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import type { Plugin } from 'vite'

interface TidPluginOptions {
  /** Root directory of the project */
  root?: string
  /** Strip test IDs in production (default: true) */
  stripInProd?: boolean
}

/**
 * Resolve the TSM module ID for a given file path by searching for the nearest manifest.json
 */
function resolveModuleId(filePath: string, root: string): string | null {
  // Check if file is inside packages/
  const packagesDir = path.join(root, 'packages')
  if (!filePath.startsWith(packagesDir)) {
    // Files in src/ belong to the main app (gene-app)
    if (filePath.startsWith(path.join(root, 'src'))) {
      return 'gene-app'
    }
    return null
  }

  // Walk up from file to find manifest.json
  let dir = path.dirname(filePath)
  while (dir.startsWith(packagesDir) && dir !== root) {
    const manifestPath = path.join(dir, 'manifest.json')
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        return manifest.id || null
      } catch {
        return null
      }
    }
    dir = path.dirname(dir)
  }
  return null
}

/**
 * Extract component name from a .vue file path
 */
function resolveComponentName(filePath: string): string {
  const basename = path.basename(filePath, '.vue')
  return basename
}

export function tidPlugin(options: TidPluginOptions = {}): Plugin {
  const stripInProd = options.stripInProd ?? true
  let root: string
  let isProd = false

  return {
    name: 'vite-plugin-tid',
    configResolved(config) {
      root = options.root || config.root
      isProd = config.command === 'build' || config.mode === 'production'
    },
    enforce: 'pre',
    transform(code, id) {
      // Match .vue files (including query strings like .vue?vue&type=template)
      const vueMatch = id.match(/^(.+\.vue)(\?.*)?$/)
      if (!vueMatch) return null
      // Only process files that contain v-tid
      if (!code.includes('v-tid')) return null

      const filePath = vueMatch[1]
      const query = vueMatch[2] || ''

      // In dev mode, skip script-only requests (template is in the main .vue or ?type=template)
      if (query.includes('type=script') || query.includes('type=style')) return null

      const moduleId = resolveModuleId(filePath, root)
      const componentName = resolveComponentName(filePath)

      if (isProd && stripInProd) {
        // Strip v-tid directives entirely in production
        // Matches: v-tid="'...'" or v-tid="\"...\""
        return code.replace(/\s+v-tid="[^"]*"/g, '')
      }

      // Dev: transform v-tid="'action'" → data-testid="moduleId.Component.action"
      const prefix = moduleId ? `${moduleId}.${componentName}` : componentName

      return code.replace(
        /v-tid="'([^']+)'"/g,
        (_match, action) => `data-testid="${prefix}.${action}"`
      )
    }
  }
}
