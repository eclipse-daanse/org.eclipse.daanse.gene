/**
 * Test Plugin
 *
 * Demonstrates importing Vue from gene-app via TSM
 */

import { ref, computed, watch } from 'tsm:vue'
import type { ModuleContext } from '@eclipse-daanse/tsm'

// Create a reactive counter using Vue from gene-app
const count = ref(0)
const doubled = computed(() => count.value * 2)

export const counter = {
  get value() {
    return count.value
  },
  get doubled() {
    return doubled.value
  },
  increment() {
    count.value++
  },
  decrement() {
    count.value--
  },
  reset() {
    count.value = 0
  }
}

export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Test Plugin activating...')

  // Watch for changes
  watch(count, (newVal, oldVal) => {
    context.log.info(`Counter changed: ${oldVal} -> ${newVal}`)
  })

  // Register counter service
  context.services.register('test.counter', counter)

  // Expose to window for testing in console
  ;(window as any).testCounter = counter

  context.log.info('Test Plugin activated!')
  context.log.info('Try in console: testCounter.increment(), testCounter.value, testCounter.doubled')
}

export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Test Plugin deactivating...')
  context.services.unregister('test.counter')
  delete (window as any).testCounter
}
