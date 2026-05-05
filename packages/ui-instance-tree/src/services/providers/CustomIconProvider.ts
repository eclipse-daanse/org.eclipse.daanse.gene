/**
 * CustomIconProvider
 *
 * An IconProvider that serves user-uploaded or externally referenced icons.
 * Icons are stored in EditorConfig.customIconLibraries and loaded when a
 * workspace is opened.
 */

import { ref, type Ref } from 'tsm:vue'
import type { IconDefinition, IconProvider } from '../iconProviders'

export interface CustomIconEntry {
  id: string
  label: string
  category: string
  dataUrl: string
  keywords: string
}

export const CUSTOM_ICONS_PROVIDER_ID = 'custom-icons'

export class CustomIconProvider implements IconProvider {
  readonly id = CUSTOM_ICONS_PROVIDER_ID
  readonly name = 'Eigene Icons'

  private _icons: Ref<CustomIconEntry[]>
  private _loaded = true

  constructor(icons: Ref<CustomIconEntry[]>) {
    this._icons = icons
  }

  getIcons(): IconDefinition[] {
    return this._icons.value.map((e) => this._toDefinition(e))
  }

  getCategories(): string[] {
    const cats = new Set(this._icons.value.map((e) => e.category || 'custom'))
    return Array.from(cats)
  }

  getIconsByCategory(category: string): IconDefinition[] {
    return this._icons.value
      .filter((e) => (e.category || 'custom') === category)
      .map((e) => this._toDefinition(e))
  }

  searchIcons(query: string): IconDefinition[] {
    const q = query.toLowerCase()
    return this._icons.value
      .filter((e) => {
        return (
          e.id.toLowerCase().includes(q) ||
          e.label.toLowerCase().includes(q) ||
          (e.keywords || '').toLowerCase().includes(q)
        )
      })
      .map((e) => this._toDefinition(e))
  }

  resolveIconClass(_iconName: string, _variant?: string): string {
    // Custom icons are rendered via <img> using dataUrl, not CSS classes.
    // The CSS class is used as a marker so callers know it's a custom icon.
    return `custom-icon custom-icon--${_iconName}`
  }

  isLoaded(): boolean {
    return this._loaded
  }

  private _toDefinition(e: CustomIconEntry): IconDefinition {
    return {
      name: e.id,
      label: e.label || e.id,
      category: e.category || 'custom',
      keywords: e.keywords ? e.keywords.split(' ').filter(Boolean) : []
    }
  }

  /**
   * Get the dataUrl for a given icon id (for rendering in the picker)
   */
  getDataUrl(iconId: string): string | undefined {
    return this._icons.value.find((e) => e.id === iconId)?.dataUrl
  }
}
