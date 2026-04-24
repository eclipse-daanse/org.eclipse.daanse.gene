/**
 * InternalExecutor - Executes local TypeScript action handlers
 */

import { injectable, singleton } from '@eclipse-daanse/tsm'
import type { ActionHandler, HandlerContext, ActionResult } from './types'

@injectable()
@singleton()
export class InternalExecutorImpl {
  private handlers = new Map<string, ActionHandler>()

  registerHandler(handlerId: string, handler: ActionHandler): void {
    this.handlers.set(handlerId, handler)
    console.log(`[InternalExecutor] Handler registered: ${handlerId}`)
  }

  unregisterHandler(handlerId: string): void {
    this.handlers.delete(handlerId)
    console.log(`[InternalExecutor] Handler unregistered: ${handlerId}`)
  }

  hasHandler(handlerId: string): boolean {
    return this.handlers.has(handlerId)
  }

  getRegisteredHandlerIds(): string[] {
    return Array.from(this.handlers.keys())
  }

  async execute(handlerId: string, context: HandlerContext): Promise<ActionResult> {
    const handler = this.handlers.get(handlerId)
    if (!handler) {
      return {
        status: 'ERROR',
        logs: [{
          message: `Handler not found: ${handlerId}`,
          level: 'ERROR',
          timestamp: new Date()
        }],
        artifacts: []
      }
    }

    try {
      return await handler.execute(context)
    } catch (error: any) {
      return {
        status: 'ERROR',
        logs: [{
          message: `Handler execution failed: ${error.message || String(error)}`,
          detail: error.stack,
          level: 'ERROR',
          timestamp: new Date()
        }],
        artifacts: []
      }
    }
  }
}
