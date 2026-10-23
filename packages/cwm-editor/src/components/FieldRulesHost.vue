<script setup lang="ts">
/**
 * Holds the field rule dialog for the context view. Opening it changes only
 * this small component - not the view, whose re-render over thousands of
 * rows made the dialog take a second to appear.
 */
import { ref, shallowRef, toRaw } from 'tsm:vue'
import FieldRulesDialog from './FieldRulesDialog.vue'

const props = defineProps<{
  /** EClasses a rule can name - asked for when the dialog opens */
  classes: () => any[]
}>()

const isOpen = ref(false)
const focus = shallowRef<{ eClass: any; attributeName: string } | null>(null)
const classList = shallowRef<any[]>([])

function open(o?: any, attributeName?: string): void {
  focus.value = o && attributeName ? { eClass: toRaw(o).eClass(), attributeName } : null
  classList.value = props.classes()
  isOpen.value = true
}

defineExpose({ open })
</script>

<template>
  <FieldRulesDialog v-if="isOpen" :classes="classList" :focus="focus" @close="isOpen = false" />
</template>
