<template>
  <Dialog
    v-model:visible="visible"
    modal
    :closable="false"
    :showHeader="false"
    position="top"
    :style="{ width: '600px', marginTop: '80px' }"
    :contentStyle="{ padding: 0 }"
    @hide="onHide"
  >
    <div class="command-palette">
      <div class="command-palette-input">
        <i class="pi pi-search" />
        <InputText
          ref="inputRef"
          v-model="query"
          placeholder="Type a command..."
          class="command-palette-search"
          @keydown="onInputKeydown"
        />
      </div>

      <div v-if="filteredCommands.length > 0" class="command-palette-list">
        <div
          v-for="(group, idx) in groupedCommands"
          :key="group.category"
        >
          <div class="command-palette-category">{{ group.category }}</div>
          <div
            v-for="cmd in group.commands"
            :key="cmd.commandId"
            class="command-palette-item"
            :class="{ 'command-palette-item--active': cmd.commandId === activeCommandId }"
            @click="executeCommand(cmd)"
            @mouseenter="activeCommandId = cmd.commandId"
          >
            <i v-if="cmd.icon" :class="cmd.icon" class="command-palette-item-icon" />
            <span class="command-palette-item-label">{{ cmd.label }}</span>
            <span v-if="cmd.keybinding" class="command-palette-item-keybinding">
              {{ formatKeybinding(cmd.keybinding) }}
            </span>
          </div>
        </div>
      </div>

      <div v-else class="command-palette-empty">
        No commands found
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, inject } from 'tsm:vue'
import { Dialog, InputText } from 'tsm:primevue'
import type { CommandDefinition } from '../EcoreCommandParser'
import type { CommandRegistryImpl, CommandContext } from '../CommandRegistry'

const props = defineProps<{
  commandRegistry: CommandRegistryImpl
  contextProvider: () => CommandContext
}>()

const visible = ref(false)
const query = ref('')
const activeCommandId = ref('')
const inputRef = ref<InstanceType<typeof InputText> | null>(null)

const allCommands = computed(() => {
  const context = props.contextProvider()
  return props.commandRegistry.getExecutableCommands(context)
})

const filteredCommands = computed(() => {
  if (!query.value) return allCommands.value
  const q = query.value.toLowerCase()
  return allCommands.value.filter(cmd => fuzzyMatch(cmd, q))
})

const groupedCommands = computed(() => {
  const groups = new Map<string, CommandDefinition[]>()
  for (const cmd of filteredCommands.value) {
    const cat = cmd.category || 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(cmd)
  }
  return Array.from(groups.entries()).map(([category, commands]) => ({ category, commands }))
})

const flatCommandIds = computed(() => filteredCommands.value.map(c => c.commandId))

function open() {
  query.value = ''
  activeCommandId.value = flatCommandIds.value[0] || ''
  visible.value = true
  nextTick(() => {
    const el = inputRef.value?.$el?.querySelector?.('input') || inputRef.value?.$el
    if (el?.focus) el.focus()
  })
}

function close() {
  visible.value = false
}

function onHide() {
  query.value = ''
  activeCommandId.value = ''
}

function onInputKeydown(e: KeyboardEvent) {
  const ids = flatCommandIds.value
  const currentIdx = ids.indexOf(activeCommandId.value)

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = currentIdx < ids.length - 1 ? currentIdx + 1 : 0
    activeCommandId.value = ids[next] || ''
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = currentIdx > 0 ? currentIdx - 1 : ids.length - 1
    activeCommandId.value = ids[prev] || ''
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = filteredCommands.value.find(c => c.commandId === activeCommandId.value)
    if (cmd) executeCommand(cmd)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

function executeCommand(cmd: CommandDefinition) {
  close()
  props.commandRegistry.execute(cmd.commandId).catch(err => {
    console.error(`[CommandPalette] Error executing ${cmd.commandId}:`, err)
  })
}

function fuzzyMatch(cmd: CommandDefinition, query: string): boolean {
  const target = `${cmd.label} ${cmd.category} ${cmd.commandId}`.toLowerCase()
  const terms = query.split(/\s+/)
  return terms.every(t => target.includes(t))
}

function formatKeybinding(kb: string): string {
  return kb
    .split('+')
    .map(k => k.charAt(0).toUpperCase() + k.slice(1))
    .join('+')
}

// Reset active item when filtered list changes
watch(flatCommandIds, (ids) => {
  if (!ids.includes(activeCommandId.value)) {
    activeCommandId.value = ids[0] || ''
  }
})

defineExpose({ open, close, visible })
</script>

<style scoped>
.command-palette {
  background: var(--p-surface-0);
  border-radius: 8px;
  overflow: hidden;
}

.command-palette-input {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--p-surface-200);
  gap: 8px;
}

.command-palette-input i {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.command-palette-search {
  flex: 1;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  padding: 4px 0;
  font-size: 0.875rem;
}

.command-palette-list {
  max-height: 400px;
  overflow-y: auto;
  padding: 4px 0;
}

.command-palette-category {
  padding: 6px 12px 2px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
  letter-spacing: 0.05em;
}

.command-palette-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  gap: 8px;
  font-size: 0.8125rem;
}

.command-palette-item:hover,
.command-palette-item--active {
  background: var(--p-surface-100);
}

.command-palette-item-icon {
  font-size: 0.875rem;
  width: 20px;
  text-align: center;
  color: var(--p-text-muted-color);
}

.command-palette-item-label {
  flex: 1;
}

.command-palette-item-keybinding {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  background: var(--p-surface-200);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.command-palette-empty {
  padding: 16px;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}
</style>
