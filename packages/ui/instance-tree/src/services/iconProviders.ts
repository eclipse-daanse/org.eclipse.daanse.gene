/**
 * Icon Provider System
 *
 * Interfaces and types for pluggable icon providers.
 * Allows loading different icon sets (PrimeIcons, Material Symbols, etc.) via plugins.
 */

/**
 * Definition of a single icon
 */
export interface IconDefinition {
  /** Icon identifier (e.g., 'star', 'home') */
  name: string
  /** Human-readable label (e.g., 'Star', 'Home') */
  label: string
  /** Category for grouping (e.g., 'common', 'navigation') */
  category: string
  /** Additional search keywords */
  keywords?: string[]
  /** Available variants (e.g., ['outlined', 'filled', 'rounded']) */
  variants?: string[]
}

/**
 * Icon provider interface
 * Implementations provide a catalog of icons and resolve them to CSS classes
 */
export interface IconProvider {
  /** Unique provider ID (e.g., 'primeicons', 'material-symbols') */
  id: string
  /** Display name (e.g., 'PrimeIcons', 'Material Symbols') */
  name: string
  /** Provider version */
  version?: string
  /** Default variant if provider supports variants */
  defaultVariant?: string

  /**
   * Get all available icons
   */
  getIcons(): IconDefinition[]

  /**
   * Get all available categories
   */
  getCategories(): string[]

  /**
   * Get icons filtered by category
   */
  getIconsByCategory(category: string): IconDefinition[]

  /**
   * Search icons by name, label, or keywords
   */
  searchIcons(query: string): IconDefinition[]

  /**
   * Resolve icon name to CSS class
   * @param iconName The icon name (e.g., 'star')
   * @param variant Optional variant (e.g., 'outlined')
   * @returns CSS class string (e.g., 'pi pi-star')
   */
  resolveIconClass(iconName: string, variant?: string): string

  /**
   * Load required CSS/fonts (called once when provider is first used)
   */
  loadStyles?(): Promise<void>

  /**
   * Check if styles are loaded
   */
  isLoaded(): boolean
}

/**
 * Search result from a provider
 */
export interface ProviderSearchResult {
  provider: IconProvider
  icons: IconDefinition[]
}

/**
 * Selected icon with provider info
 */
export interface SelectedIcon {
  providerId: string
  iconName: string
  variant?: string
  cssClass: string
}
