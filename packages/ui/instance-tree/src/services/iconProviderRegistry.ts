/**
 * Icon Provider Registry
 *
 * Manages registered icon providers (PrimeIcons, Material Symbols, etc.)
 * Provides global search across all providers.
 */

import { ref, computed } from 'tsm:vue'
import type { IconProvider, IconDefinition, ProviderSearchResult } from './iconProviders'

/**
 * Registry for icon providers
 */
class IconProviderRegistry {
  private providers = new Map<string, IconProvider>()
  private _version = ref(0)

  /**
   * Reactive version counter - increments when providers change
   */
  get version() {
    return this._version
  }

  /**
   * Register an icon provider
   */
  register(provider: IconProvider): void {
    console.log('[IconProviderRegistry] Registering provider:', provider.id, provider.name)
    this.providers.set(provider.id, provider)
    this._version.value++
  }

  /**
   * Unregister an icon provider
   */
  unregister(id: string): boolean {
    const result = this.providers.delete(id)
    if (result) {
      console.log('[IconProviderRegistry] Unregistered provider:', id)
      this._version.value++
    }
    return result
  }

  /**
   * Get a provider by ID
   */
  get(id: string): IconProvider | undefined {
    return this.providers.get(id)
  }

  /**
   * Get all registered providers
   */
  getAll(): IconProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get provider IDs
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys())
  }

  /**
   * Check if a provider is registered
   */
  has(id: string): boolean {
    return this.providers.has(id)
  }

  /**
   * Search across all providers
   */
  searchAllProviders(query: string): ProviderSearchResult[] {
    const results: ProviderSearchResult[] = []

    for (const provider of this.providers.values()) {
      const icons = provider.searchIcons(query)
      if (icons.length > 0) {
        results.push({ provider, icons })
      }
    }

    return results
  }

  /**
   * Get all icons from all providers
   */
  getAllIcons(): { provider: IconProvider; icon: IconDefinition }[] {
    const all: { provider: IconProvider; icon: IconDefinition }[] = []

    for (const provider of this.providers.values()) {
      for (const icon of provider.getIcons()) {
        all.push({ provider, icon })
      }
    }

    return all
  }

  /**
   * Get all categories from all providers
   */
  getAllCategories(): { providerId: string; categories: string[] }[] {
    const result: { providerId: string; categories: string[] }[] = []

    for (const provider of this.providers.values()) {
      result.push({
        providerId: provider.id,
        categories: provider.getCategories()
      })
    }

    return result
  }

  /**
   * Resolve an icon to CSS class
   */
  resolveIconClass(providerId: string, iconName: string, variant?: string): string | null {
    const provider = this.providers.get(providerId)
    if (!provider) return null
    return provider.resolveIconClass(iconName, variant)
  }

  /**
   * Ensure provider styles are loaded
   */
  async ensureStylesLoaded(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId)
    if (provider && !provider.isLoaded() && provider.loadStyles) {
      await provider.loadStyles()
    }
  }
}

// Singleton instance
export const iconProviderRegistry = new IconProviderRegistry()

/**
 * Get the global icon provider registry
 */
export function getIconProviderRegistry(): IconProviderRegistry {
  return iconProviderRegistry
}
