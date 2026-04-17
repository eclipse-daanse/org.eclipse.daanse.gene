/**
 * Core Extension Module
 *
 * Extends the remote 'core' module with additional features.
 * The 'core' module runs on a remote server (e.g., http://localhost:5200)
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
// Types vom Remote-Modul (werden zur Dev-Zeit aus .tsm/types geladen)
import type { CoreService } from 'core'

/**
 * Enhanced Core Service - erweitert den Remote CoreService
 */
export class EnhancedCoreService {
  private coreService: CoreService

  constructor(coreService: CoreService) {
    this.coreService = coreService
  }

  /**
   * Original getMessage mit Prefix
   */
  getEnhancedMessage(): string {
    return `[Enhanced] ${this.coreService.getMessage()}`
  }

  /**
   * Neue Funktionalität
   */
  getTimestamp(): string {
    return new Date().toISOString()
  }

  /**
   * Kombinierte Ausgabe
   */
  getFullStatus(): { message: string; timestamp: string; initialized: boolean } {
    return {
      message: this.getEnhancedMessage(),
      timestamp: this.getTimestamp(),
      initialized: this.coreService.initialized
    }
  }
}

// Singleton instance
let enhancedService: EnhancedCoreService | null = null

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Core Extension...')

  // Get the remote core service from DI container
  const coreService = context.services.getRequired<CoreService>('core.service')

  // Create enhanced service
  enhancedService = new EnhancedCoreService(coreService)

  // Register enhanced service
  context.services.register('core.enhanced', enhancedService)

  context.log.info('Core Extension activated')
  context.log.info(`Status: ${JSON.stringify(enhancedService.getFullStatus())}`)
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Core Extension...')

  context.services.unregister('core.enhanced')
  enhancedService = null

  context.log.info('Core Extension deactivated')
}
