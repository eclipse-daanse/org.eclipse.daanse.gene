/**
 * Material Symbols Icon Provider
 *
 * Provides Material Symbols icons with multiple variants.
 */

import type { IconProvider, IconDefinition } from 'ui-instance-tree'
import { MATERIAL_ICONS, getMaterialCategories } from './icons'

type MaterialVariant = 'outlined' | 'rounded' | 'sharp'

export class MaterialSymbolsProvider implements IconProvider {
  readonly id = 'material-symbols'
  readonly name = 'Material Symbols'
  readonly version = '1.0.0'
  readonly defaultVariant: MaterialVariant = 'outlined'

  private loaded = false
  private iconCache: IconDefinition[] | null = null

  /**
   * Get all available icons
   */
  getIcons(): IconDefinition[] {
    if (this.iconCache) {
      return this.iconCache
    }

    this.iconCache = MATERIAL_ICONS.map((icon) => ({
      name: icon.name,
      label: icon.label,
      category: icon.category,
      keywords: icon.keywords,
      variants: ['outlined', 'rounded', 'sharp']
    }))

    return this.iconCache
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return getMaterialCategories()
  }

  /**
   * Get icons filtered by category
   */
  getIconsByCategory(category: string): IconDefinition[] {
    return this.getIcons().filter((icon) => icon.category === category)
  }

  /**
   * Search icons by name, label, or keywords
   */
  searchIcons(query: string): IconDefinition[] {
    const q = query.toLowerCase().trim()
    if (!q) {
      return this.getIcons()
    }

    return this.getIcons().filter((icon) => {
      // Match name
      if (icon.name.toLowerCase().includes(q)) return true
      // Match label
      if (icon.label.toLowerCase().includes(q)) return true
      // Match category
      if (icon.category.toLowerCase().includes(q)) return true
      // Match keywords
      if (icon.keywords?.some((k) => k.toLowerCase().includes(q))) return true
      return false
    })
  }

  /**
   * Resolve icon name to CSS class
   * Material Symbols use "material-symbols-{variant}" class + icon name as text content
   * For CSS-only approach, we use the symbol font with a special class
   */
  resolveIconClass(iconName: string, variant?: string): string {
    const v = (variant as MaterialVariant) || this.defaultVariant
    // Material Symbols fonts work with class "material-symbols-{variant}" and icon name as content
    // Since we need CSS class approach, we'll use data attribute approach
    return `material-symbols-${v} material-icon-${iconName}`
  }

  /**
   * Load CSS from Google Fonts
   */
  async loadStyles(): Promise<void> {
    if (this.loaded) return

    // Load Material Symbols from Google Fonts
    const variants = ['outlined', 'rounded', 'sharp']

    for (const variant of variants) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=Material+Symbols+${variant.charAt(0).toUpperCase() + variant.slice(1)}:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`
      document.head.appendChild(link)
    }

    // Add base styles for icon display
    const style = document.createElement('style')
    style.textContent = `
      .material-symbols-outlined,
      .material-symbols-rounded,
      .material-symbols-sharp {
        font-weight: normal;
        font-style: normal;
        font-size: 24px;
        line-height: 1;
        letter-spacing: normal;
        text-transform: none;
        display: inline-block;
        white-space: nowrap;
        word-wrap: normal;
        direction: ltr;
        -webkit-font-feature-settings: 'liga';
        font-feature-settings: 'liga';
        -webkit-font-smoothing: antialiased;
      }

      .material-symbols-outlined {
        font-family: 'Material Symbols Outlined';
      }

      .material-symbols-rounded {
        font-family: 'Material Symbols Rounded';
      }

      .material-symbols-sharp {
        font-family: 'Material Symbols Sharp';
      }
    `
    document.head.appendChild(style)

    this.loaded = true
  }

  /**
   * Check if styles are loaded
   */
  isLoaded(): boolean {
    return this.loaded
  }
}
