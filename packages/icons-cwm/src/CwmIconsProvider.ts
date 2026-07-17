/**
 * CWM Icons Provider
 *
 * Serves the 143 hand-drawn Common Warehouse Metamodel (CWM 1.1) class icons.
 *
 * Unlike font-based providers (Material, PrimeIcons), each CWM icon is a full
 * SVG that carries its own colours: the border hue encodes the source package
 * and every file handles dark mode via `prefers-color-scheme`. To preserve
 * that, the icons are rendered as CSS `background-image` (data-URL) rules on an
 * `<i class="cwm-icon cwm-icon--{slug}">` element — NOT as a monochrome
 * `<img>` (which the host tints with `filter: invert()` in dark mode) and NOT
 * as a font glyph (which would collapse every icon to a single colour).
 */

import type { IconProvider, IconDefinition } from 'ui-instance-tree'

// Inline every CWM SVG at build time. `?raw` yields the file source as a string,
// `eager` resolves them synchronously so the catalog is ready without awaiting.
const svgModules = import.meta.glob('../cwm-icons/icons/svg/**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

interface CwmIcon {
  /** Unique id within the provider: package path + class, e.g. 'analysis/olap/Schema' */
  name: string
  /** Human-readable label: the bare class name, e.g. 'Schema' */
  label: string
  /** Category: the CWM package path, e.g. 'analysis/olap' */
  category: string
  /** CSS-safe unique token derived from `name`, e.g. 'analysis-olap-Schema' */
  slug: string
  keywords: string[]
  /** Raw SVG source */
  svg: string
}

/** 'analysis/olap/Schema' -> 'analysis-olap-Schema' (CSS class safe, collision-free) */
function toSlug(name: string): string {
  return name.replace(/\//g, '-')
}

/** 'CubeDimensionAssociation' -> ['cube', 'dimension', 'association'] */
function splitCamel(base: string): string[] {
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean)
}

function buildCatalog(): CwmIcon[] {
  const icons: CwmIcon[] = []

  for (const [path, raw] of Object.entries(svgModules)) {
    // Path looks like '../cwm-icons/icons/svg/analysis/olap/Schema.svg'
    const marker = '/svg/'
    const idx = path.indexOf(marker)
    if (idx === -1) continue
    const rel = path.slice(idx + marker.length).replace(/\.svg$/, '') // 'analysis/olap/Schema'
    const parts = rel.split('/')
    const base = parts[parts.length - 1]
    const category = parts.slice(0, -1).join('/')

    icons.push({
      name: rel,
      label: base,
      category,
      slug: toSlug(rel),
      keywords: Array.from(new Set([...parts.map((p) => p.toLowerCase()), ...splitCamel(base)])),
      svg: raw
    })
  }

  icons.sort((a, b) => a.name.localeCompare(b.name))
  return icons
}

/** Encode a raw SVG string into a CSS-safe `data:` URL. */
function toDataUrl(svg: string): string {
  // encodeURIComponent escapes '#', '"', newlines etc., so the result is safe
  // inside url("...") and as an <img> src.
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`
}

const STYLE_ELEMENT_ID = 'cwm-icons-styles'

export class CwmIconsProvider implements IconProvider {
  readonly id = 'cwm-icons'
  readonly name = 'CWM Icons'
  readonly version = '1.1.0'

  private catalog: CwmIcon[] = buildCatalog()
  private byName = new Map(this.catalog.map((i) => [i.name, i]))
  private iconCache: IconDefinition[] | null = null
  private loaded = false

  getIcons(): IconDefinition[] {
    if (!this.iconCache) {
      this.iconCache = this.catalog.map((i) => ({
        name: i.name,
        label: i.label,
        category: i.category,
        keywords: i.keywords
      }))
    }
    return this.iconCache
  }

  getCategories(): string[] {
    return Array.from(new Set(this.catalog.map((i) => i.category))).sort()
  }

  getIconsByCategory(category: string): IconDefinition[] {
    return this.getIcons().filter((i) => i.category === category)
  }

  searchIcons(query: string): IconDefinition[] {
    const q = query.toLowerCase().trim()
    if (!q) return this.getIcons()

    return this.getIcons().filter((i) => {
      if (i.name.toLowerCase().includes(q)) return true
      if (i.label.toLowerCase().includes(q)) return true
      if (i.category.toLowerCase().includes(q)) return true
      if (i.keywords?.some((k) => k.includes(q))) return true
      return false
    })
  }

  /**
   * Resolve an icon name to its CSS class. The class carries the SVG as a
   * `background-image` (see loadStyles) and is rendered via `<i class="...">`.
   */
  resolveIconClass(iconName: string, _variant?: string): string {
    return `cwm-icon cwm-icon--${toSlug(iconName)}`
  }

  /**
   * Inject the background-image rules for every CWM icon (once).
   */
  async loadStyles(): Promise<void> {
    if (this.loaded) return
    if (typeof document === 'undefined') {
      this.loaded = true
      return
    }

    if (!document.getElementById(STYLE_ELEMENT_ID)) {
      const rules = this.catalog
        .map((i) => `.cwm-icon--${i.slug}{background-image:url("${toDataUrl(i.svg)}")}`)
        .join('\n')

      const style = document.createElement('style')
      style.id = STYLE_ELEMENT_ID
      style.textContent = `
.cwm-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  vertical-align: -0.125em;
}
${rules}
`
      document.head.appendChild(style)
    }

    this.loaded = true
  }

  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Raw SVG source for an icon name (useful for previews / export).
   */
  getSvg(iconName: string): string | undefined {
    return this.byName.get(iconName)?.svg
  }
}
