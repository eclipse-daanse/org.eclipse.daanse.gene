/**
 * Vue library re-exports
 * Import via: import { ref, computed } from 'tsm:vue'
 *
 * Note: Explicit exports to avoid Vite's dep optimization stripping
 */

// Re-export from vue - use explicit to avoid Vite optimization stripping
export {
  // Reactivity: Core
  ref,
  computed,
  reactive,
  readonly,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
  watch,

  // Reactivity: Utilities
  isRef,
  unref,
  toRef,
  toRefs,
  toValue,
  isProxy,
  isReactive,
  isReadonly,
  shallowRef,
  triggerRef,
  customRef,
  shallowReactive,
  shallowReadonly,
  toRaw,
  markRaw,
  effectScope,
  getCurrentScope,
  onScopeDispose,

  // Lifecycle Hooks
  onMounted,
  onUpdated,
  onUnmounted,
  onBeforeMount,
  onBeforeUpdate,
  onBeforeUnmount,
  onErrorCaptured,
  onRenderTracked,
  onRenderTriggered,
  onActivated,
  onDeactivated,
  onServerPrefetch,

  // Dependency Injection
  provide,
  inject,
  hasInjectionContext,

  // Component
  defineComponent,
  defineAsyncComponent,
  defineCustomElement,

  // Rendering
  h,
  createVNode,
  cloneVNode,
  mergeProps,
  isVNode,
  resolveComponent,
  resolveDirective,
  withDirectives,
  withModifiers,

  // App
  createApp,
  createSSRApp,

  // Other
  nextTick,
  useAttrs,
  useSlots,
  useCssModule,
  useCssVars,
  useId,
  useModel,
  useTemplateRef,

  // Types (exported as type)
  type Ref,
  type ComputedRef,
  type ShallowRef,
  type WritableComputedRef,
  type UnwrapRef,
  type WatchEffect,
  type WatchOptions,
  type WatchCallback,
  type WatchHandle,
  type WatchStopHandle,
  type InjectionKey,
  type App,
  type Component,
  type DefineComponent,
  type ComponentOptions,
  type ComponentPublicInstance,
  type VNode,
  type PropType,
  type Directive,
  type DirectiveBinding,
  type Plugin,
  type Raw
} from 'vue'
