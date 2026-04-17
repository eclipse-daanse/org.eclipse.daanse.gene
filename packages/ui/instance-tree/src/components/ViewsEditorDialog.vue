<script setup lang="ts">
/**
 * ViewsEditorDialog Component
 *
 * Modal dialog for editing tree views.
 * Shows all loaded EPackages and EClasses to toggle type visibility.
 */

import { ref, computed, watch } from 'tsm:vue'
import { Dialog } from 'tsm:primevue'
import { Tree } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { Dropdown } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { Checkbox } from 'tsm:primevue'
import { useSharedViews, getTypeUri } from '../composables/useViews'

// Available icons for perspective - comprehensive PrimeIcons list
const availableIcons = [
  // Common
  { label: 'Filter', value: 'pi pi-filter' },
  { label: 'Eye', value: 'pi pi-eye' },
  { label: 'Star', value: 'pi pi-star' },
  { label: 'Star Fill', value: 'pi pi-star-fill' },
  { label: 'Bookmark', value: 'pi pi-bookmark' },
  { label: 'Bookmark Fill', value: 'pi pi-bookmark-fill' },
  { label: 'Tag', value: 'pi pi-tag' },
  { label: 'Tags', value: 'pi pi-tags' },
  { label: 'Heart', value: 'pi pi-heart' },
  { label: 'Heart Fill', value: 'pi pi-heart-fill' },
  { label: 'Flag', value: 'pi pi-flag' },
  { label: 'Flag Fill', value: 'pi pi-flag-fill' },
  // Shapes
  { label: 'Circle', value: 'pi pi-circle' },
  { label: 'Circle Fill', value: 'pi pi-circle-fill' },
  { label: 'Check Circle', value: 'pi pi-check-circle' },
  { label: 'Times Circle', value: 'pi pi-times-circle' },
  { label: 'Info Circle', value: 'pi pi-info-circle' },
  { label: 'Exclamation Circle', value: 'pi pi-exclamation-circle' },
  { label: 'Question Circle', value: 'pi pi-question-circle' },
  { label: 'Stop Circle', value: 'pi pi-stop-circle' },
  // Objects
  { label: 'Box', value: 'pi pi-box' },
  { label: 'Building', value: 'pi pi-building' },
  { label: 'Briefcase', value: 'pi pi-briefcase' },
  { label: 'Car', value: 'pi pi-car' },
  { label: 'Home', value: 'pi pi-home' },
  { label: 'Wallet', value: 'pi pi-wallet' },
  { label: 'Gift', value: 'pi pi-gift' },
  { label: 'Shopping Cart', value: 'pi pi-shopping-cart' },
  { label: 'Shopping Bag', value: 'pi pi-shopping-bag' },
  { label: 'Credit Card', value: 'pi pi-credit-card' },
  { label: 'Money Bill', value: 'pi pi-money-bill' },
  { label: 'Truck', value: 'pi pi-truck' },
  { label: 'Map', value: 'pi pi-map' },
  { label: 'Map Marker', value: 'pi pi-map-marker' },
  { label: 'Globe', value: 'pi pi-globe' },
  { label: 'Compass', value: 'pi pi-compass' },
  // People
  { label: 'User', value: 'pi pi-user' },
  { label: 'Users', value: 'pi pi-users' },
  { label: 'User Plus', value: 'pi pi-user-plus' },
  { label: 'User Edit', value: 'pi pi-user-edit' },
  { label: 'ID Card', value: 'pi pi-id-card' },
  // Data
  { label: 'List', value: 'pi pi-list' },
  { label: 'Table', value: 'pi pi-table' },
  { label: 'Database', value: 'pi pi-database' },
  { label: 'Server', value: 'pi pi-server' },
  { label: 'Chart Bar', value: 'pi pi-chart-bar' },
  { label: 'Chart Line', value: 'pi pi-chart-line' },
  { label: 'Chart Pie', value: 'pi pi-chart-pie' },
  { label: 'Th Large', value: 'pi pi-th-large' },
  // Files
  { label: 'File', value: 'pi pi-file' },
  { label: 'File Edit', value: 'pi pi-file-edit' },
  { label: 'File PDF', value: 'pi pi-file-pdf' },
  { label: 'File Excel', value: 'pi pi-file-excel' },
  { label: 'File Word', value: 'pi pi-file-word' },
  { label: 'Folder', value: 'pi pi-folder' },
  { label: 'Folder Open', value: 'pi pi-folder-open' },
  { label: 'Image', value: 'pi pi-image' },
  { label: 'Images', value: 'pi pi-images' },
  { label: 'Video', value: 'pi pi-video' },
  { label: 'Inbox', value: 'pi pi-inbox' },
  { label: 'Paperclip', value: 'pi pi-paperclip' },
  // Communication
  { label: 'Envelope', value: 'pi pi-envelope' },
  { label: 'Send', value: 'pi pi-send' },
  { label: 'Phone', value: 'pi pi-phone' },
  { label: 'Mobile', value: 'pi pi-mobile' },
  { label: 'Comments', value: 'pi pi-comments' },
  { label: 'Comment', value: 'pi pi-comment' },
  { label: 'Bell', value: 'pi pi-bell' },
  { label: 'Megaphone', value: 'pi pi-megaphone' },
  // Technology
  { label: 'Cog', value: 'pi pi-cog' },
  { label: 'Wrench', value: 'pi pi-wrench' },
  { label: 'Sliders H', value: 'pi pi-sliders-h' },
  { label: 'Sliders V', value: 'pi pi-sliders-v' },
  { label: 'Code', value: 'pi pi-code' },
  { label: 'Desktop', value: 'pi pi-desktop' },
  { label: 'Tablet', value: 'pi pi-tablet' },
  { label: 'Wifi', value: 'pi pi-wifi' },
  { label: 'Bluetooth', value: 'pi pi-bluetooth' },
  { label: 'Microchip', value: 'pi pi-microchip' },
  { label: 'Qrcode', value: 'pi pi-qrcode' },
  { label: 'Sitemap', value: 'pi pi-sitemap' },
  { label: 'Share Alt', value: 'pi pi-share-alt' },
  { label: 'Link', value: 'pi pi-link' },
  // Actions
  { label: 'Plus', value: 'pi pi-plus' },
  { label: 'Minus', value: 'pi pi-minus' },
  { label: 'Check', value: 'pi pi-check' },
  { label: 'Times', value: 'pi pi-times' },
  { label: 'Search', value: 'pi pi-search' },
  { label: 'Pencil', value: 'pi pi-pencil' },
  { label: 'Trash', value: 'pi pi-trash' },
  { label: 'Copy', value: 'pi pi-copy' },
  { label: 'Clone', value: 'pi pi-clone' },
  { label: 'Sync', value: 'pi pi-sync' },
  { label: 'Refresh', value: 'pi pi-refresh' },
  { label: 'Undo', value: 'pi pi-undo' },
  { label: 'Replay', value: 'pi pi-replay' },
  { label: 'Download', value: 'pi pi-download' },
  { label: 'Upload', value: 'pi pi-upload' },
  { label: 'Cloud', value: 'pi pi-cloud' },
  { label: 'Cloud Upload', value: 'pi pi-cloud-upload' },
  { label: 'Cloud Download', value: 'pi pi-cloud-download' },
  // Arrows
  { label: 'Arrow Up', value: 'pi pi-arrow-up' },
  { label: 'Arrow Down', value: 'pi pi-arrow-down' },
  { label: 'Arrow Left', value: 'pi pi-arrow-left' },
  { label: 'Arrow Right', value: 'pi pi-arrow-right' },
  { label: 'Arrows H', value: 'pi pi-arrows-h' },
  { label: 'Arrows V', value: 'pi pi-arrows-v' },
  { label: 'Sort', value: 'pi pi-sort' },
  { label: 'Sort Alt', value: 'pi pi-sort-alt' },
  // Media
  { label: 'Play', value: 'pi pi-play' },
  { label: 'Pause', value: 'pi pi-pause' },
  { label: 'Stop', value: 'pi pi-stop' },
  { label: 'Forward', value: 'pi pi-forward' },
  { label: 'Backward', value: 'pi pi-backward' },
  { label: 'Volume Up', value: 'pi pi-volume-up' },
  { label: 'Volume Down', value: 'pi pi-volume-down' },
  { label: 'Volume Off', value: 'pi pi-volume-off' },
  // Misc
  { label: 'Calendar', value: 'pi pi-calendar' },
  { label: 'Clock', value: 'pi pi-clock' },
  { label: 'History', value: 'pi pi-history' },
  { label: 'Stopwatch', value: 'pi pi-stopwatch' },
  { label: 'Sun', value: 'pi pi-sun' },
  { label: 'Moon', value: 'pi pi-moon' },
  { label: 'Bolt', value: 'pi pi-bolt' },
  { label: 'Lock', value: 'pi pi-lock' },
  { label: 'Lock Open', value: 'pi pi-lock-open' },
  { label: 'Key', value: 'pi pi-key' },
  { label: 'Shield', value: 'pi pi-shield' },
  { label: 'Eye Slash', value: 'pi pi-eye-slash' },
  { label: 'Ban', value: 'pi pi-ban' },
  { label: 'Verified', value: 'pi pi-verified' },
  { label: 'Palette', value: 'pi pi-palette' },
  { label: 'Percentage', value: 'pi pi-percentage' },
  { label: 'Hashtag', value: 'pi pi-hashtag' },
  { label: 'At', value: 'pi pi-at' },
  { label: 'Sparkles', value: 'pi pi-sparkles' },
  { label: 'Crown', value: 'pi pi-crown' },
  { label: 'Trophy', value: 'pi pi-trophy' },
  { label: 'Thumbs Up', value: 'pi pi-thumbs-up' },
  { label: 'Thumbs Down', value: 'pi pi-thumbs-down' },
  { label: 'Directions', value: 'pi pi-directions' },
  { label: 'Directions Alt', value: 'pi pi-directions-alt' },
  { label: 'Eject', value: 'pi pi-eject' },
  { label: 'Eraser', value: 'pi pi-eraser' },
  { label: 'Expand', value: 'pi pi-expand' },
  { label: 'External Link', value: 'pi pi-external-link' },
  { label: 'Hourglass', value: 'pi pi-hourglass' },
  { label: 'Language', value: 'pi pi-language' },
  { label: 'Lightbulb', value: 'pi pi-lightbulb' },
  { label: 'Minus Circle', value: 'pi pi-minus-circle' },
  { label: 'Plus Circle', value: 'pi pi-plus-circle' },
  { label: 'Print', value: 'pi pi-print' },
  { label: 'Receipt', value: 'pi pi-receipt' },
  { label: 'Spin', value: 'pi pi-spin' },
  { label: 'Ticket', value: 'pi pi-ticket' },
  { label: 'Warehouse', value: 'pi pi-warehouse' },
  { label: 'Wave Pulse', value: 'pi pi-wave-pulse' },
  { label: 'Hammer', value: 'pi pi-hammer' },
  { label: 'Objects Column', value: 'pi pi-objects-column' },
  { label: 'Book', value: 'pi pi-book' },
  { label: 'Bookmark', value: 'pi pi-bookmark' },
  { label: 'Calculator', value: 'pi pi-calculator' },
  { label: 'Bullseye', value: 'pi pi-bullseye' },
  { label: 'Camera', value: 'pi pi-camera' },
  { label: 'Microphone', value: 'pi pi-microphone' },
  { label: 'Headphones', value: 'pi pi-headphones' },
  { label: 'Flag Banner', value: 'pi pi-flag-fill' }
]
import type { PackageInfo } from '../context/editorContext'
import type { EPackage, EClass, EClassifier } from '@emfts/core'

const props = defineProps<{
  visible: boolean
  packages: PackageInfo[]  // All loaded packages (PackageInfo wrapper)
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const views = useSharedViews()

// Dialog visibility
const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
})

// New view dialog
const showNewViewDialog = ref(false)
const newViewName = ref('')

// Tree expanded keys
const expandedKeys = ref<Record<string, boolean>>({})

// View options for dropdown
const viewOptions = computed(() => {
  return [
    { id: null, name: '(No View - Show All)' },
    ...views.views.value.map(v => ({ id: v.id, name: v.name }))
  ]
})

const selectedViewId = computed({
  get: () => views.activeViewId.value,
  set: (id) => views.setActiveView(id)
})

/**
 * Build tree nodes from packages
 */
const modelTreeNodes = computed(() => {
  const nodes: any[] = []

  for (const pkgInfo of props.packages) {
    const pkgNode = packageInfoToTreeNode(pkgInfo)
    if (pkgNode) {
      nodes.push(pkgNode)
    }
  }

  return nodes
})

/**
 * Convert PackageInfo to tree node
 */
function packageInfoToTreeNode(pkgInfo: PackageInfo): any {
  const pkg = pkgInfo.ePackage
  const nsURI = pkgInfo.nsURI
  const name = pkgInfo.name

  const children: any[] = []

  // Add classifiers (EClasses, EDataTypes, EEnums)
  const classifiers = pkg.getEClassifiers()
  if (classifiers) {
    const classifierList = typeof classifiers.toArray === 'function'
      ? classifiers.toArray()
      : Array.from(classifiers as Iterable<EClassifier>)

    for (const classifier of classifierList) {
      // Only show EClasses (not EDataTypes or EEnums)
      if (classifier.eClass().getName() === 'EClass') {
        const eClass = classifier as EClass
        children.push({
          key: `class-${nsURI}-${eClass.getName()}`,
          label: eClass.getName(),
          icon: eClass.isAbstract() ? 'pi pi-code' : 'pi pi-box',
          data: { type: 'class', eClass, pkgInfo },
          leaf: true
        })
      }
    }
  }

  // Add subpackages (as EPackage, not PackageInfo)
  const subPackages = pkg.getESubpackages()
  if (subPackages) {
    const subList = typeof subPackages.toArray === 'function'
      ? subPackages.toArray()
      : Array.from(subPackages as Iterable<EPackage>)

    for (const subPkg of subList) {
      const subNode = ePackageToTreeNode(subPkg)
      if (subNode) {
        children.push(subNode)
      }
    }
  }

  return {
    key: `pkg-${nsURI}`,
    label: name,
    icon: 'pi pi-folder',
    data: { type: 'package', pkgInfo },
    children: children.length > 0 ? children : undefined,
    leaf: children.length === 0
  }
}

/**
 * Convert EPackage (subpackage) to tree node
 */
function ePackageToTreeNode(pkg: EPackage): any {
  const nsURI = pkg.getNsURI?.() || 'unknown'
  const name = pkg.getName?.() || 'Unknown'

  const children: any[] = []

  // Add classifiers
  const classifiers = pkg.getEClassifiers()
  if (classifiers) {
    const classifierList = typeof classifiers.toArray === 'function'
      ? classifiers.toArray()
      : Array.from(classifiers as Iterable<EClassifier>)

    for (const classifier of classifierList) {
      if (classifier.eClass().getName() === 'EClass') {
        const eClass = classifier as EClass
        children.push({
          key: `class-${nsURI}-${eClass.getName()}`,
          label: eClass.getName(),
          icon: eClass.isAbstract() ? 'pi pi-code' : 'pi pi-box',
          data: { type: 'class', eClass },
          leaf: true
        })
      }
    }
  }

  // Recursively add subpackages
  const subPackages = pkg.getESubpackages()
  if (subPackages) {
    const subList = typeof subPackages.toArray === 'function'
      ? subPackages.toArray()
      : Array.from(subPackages as Iterable<EPackage>)

    for (const subPkg of subList) {
      const subNode = ePackageToTreeNode(subPkg)
      if (subNode) {
        children.push(subNode)
      }
    }
  }

  return {
    key: `pkg-${nsURI}`,
    label: name,
    icon: 'pi pi-folder',
    data: { type: 'package', pkg },
    children: children.length > 0 ? children : undefined,
    leaf: children.length === 0
  }
}

/**
 * Check if a class is hidden
 */
function isClassHidden(eClass: EClass): boolean {
  if (!views.activeView.value || !views.activeView.value.enabled) return false

  const typeUri = getTypeUri(eClass)
  for (const filter of views.activeView.value.filters) {
    if (filter.filterType === 'ECLASS_TYPE' && filter.hidden && filter.targetTypeUri === typeUri) {
      return true
    }
  }
  return false
}

/**
 * Check if all classes in a package are hidden
 */
function isPackageHidden(node: any): boolean {
  if (!views.activeView.value || !views.activeView.value.enabled) return false

  const classes = getClassesFromPackageNode(node)
  if (classes.length === 0) return false

  return classes.every(eClass => isClassHidden(eClass))
}

/**
 * Check if some (but not all) classes in a package are hidden
 */
function isPackagePartiallyHidden(node: any): boolean {
  if (!views.activeView.value || !views.activeView.value.enabled) return false

  const classes = getClassesFromPackageNode(node)
  if (classes.length === 0) return false

  const hiddenCount = classes.filter(eClass => isClassHidden(eClass)).length
  return hiddenCount > 0 && hiddenCount < classes.length
}

/**
 * Get all EClasses from a package node (including subpackages)
 */
function getClassesFromPackageNode(node: any): EClass[] {
  const classes: EClass[] = []

  function traverse(n: any) {
    if (n.data?.type === 'class' && n.data.eClass) {
      classes.push(n.data.eClass)
    }
    if (n.children) {
      for (const child of n.children) {
        traverse(child)
      }
    }
  }

  if (node.children) {
    for (const child of node.children) {
      traverse(child)
    }
  }

  return classes
}

/**
 * Toggle visibility for all classes in a package
 */
function togglePackageVisibility(node: any) {
  if (!views.activeView.value) {
    views.ensureActiveView()
  }

  const classes = getClassesFromPackageNode(node)
  const allHidden = isPackageHidden(node)

  for (const eClass of classes) {
    const typeUri = getTypeUri(eClass)
    const existingFilter = views.activeView.value?.filters.find(
      f => f.filterType === 'ECLASS_TYPE' && f.targetTypeUri === typeUri
    )

    if (allHidden) {
      // Show all - set hidden to false
      if (existingFilter) {
        existingFilter.hidden = false
      }
    } else {
      // Hide all
      if (existingFilter) {
        existingFilter.hidden = true
      } else {
        views.hideType(typeUri, 'TYPE_ONLY')
      }
    }
  }

  views.version.value++
}

/**
 * Toggle visibility for a class
 */
function toggleClassVisibility(node: any, includeSubtypes: boolean = false) {
  if (!views.activeView.value) {
    views.ensureActiveView()
  }

  const eClass = node.data?.eClass as EClass
  if (!eClass) return

  const typeUri = getTypeUri(eClass)
  const scope = includeSubtypes ? 'TYPE_AND_SUBTYPES' : 'TYPE_ONLY'

  // Check if already hidden
  const existingFilter = views.activeView.value?.filters.find(
    f => f.filterType === 'ECLASS_TYPE' && f.targetTypeUri === typeUri
  )

  if (existingFilter) {
    existingFilter.hidden = !existingFilter.hidden
    if (includeSubtypes) {
      existingFilter.scope = scope
    }
    views.version.value++
  } else {
    views.hideType(typeUri, scope)
  }
}

/**
 * Create a new view
 */
function handleCreateView() {
  if (!newViewName.value.trim()) return

  const view = views.createView(newViewName.value.trim())
  views.setActiveView(view.id)

  showNewViewDialog.value = false
  newViewName.value = ''
}

/**
 * Delete the active view
 */
function handleDeleteView() {
  if (!views.activeView.value) return

  if (confirm(`Delete view "${views.activeView.value.name}"?`)) {
    views.deleteView(views.activeView.value.id)
  }
}

/**
 * Clear all filters in active view
 */
function handleClearFilters() {
  if (!views.activeView.value) return

  views.activeView.value.filters.length = 0
  views.version.value++
}

/**
 * Expand all nodes
 */
function expandAll() {
  const keys: Record<string, boolean> = {}
  function traverse(nodes: any[]) {
    for (const node of nodes) {
      if (node.key) {
        keys[node.key] = true
      }
      if (node.children) {
        traverse(node.children)
      }
    }
  }
  traverse(modelTreeNodes.value)
  expandedKeys.value = keys
}

/**
 * Collapse all nodes
 */
function collapseAll() {
  expandedKeys.value = {}
}

/**
 * Handle perspective toggle
 */
function handlePerspectiveToggle() {
  if (!views.activeView.value) return

  if (views.activeView.value.showInActivityBar) {
    views.enableAsPerspective(
      views.activeView.value.id,
      views.activeView.value.perspectiveIcon || 'pi pi-filter'
    )
  } else {
    views.disableAsPerspective(views.activeView.value.id)
  }
}

/**
 * Handle icon change
 */
function handleIconChange() {
  if (!views.activeView.value || !views.activeView.value.showInActivityBar) return

  views.updatePerspectiveIcon(
    views.activeView.value.id,
    views.activeView.value.perspectiveIcon || 'pi pi-filter'
  )
}

// Expand all packages on open
watch(() => props.visible, (visible) => {
  if (visible) {
    expandAll()
  }
})
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    header="Edit Views"
    :modal="true"
    :style="{ width: '700px', height: '80vh' }"
    :contentStyle="{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }"
  >
    <!-- View selector toolbar -->
    <div class="toolbar">
      <div class="view-selector">
        <Dropdown
          v-model="selectedViewId"
          :options="viewOptions"
          optionLabel="name"
          optionValue="id"
          placeholder="Select a view"
          class="view-dropdown"
        />
        <Button
          icon="pi pi-plus"
          text
          rounded
          @click="showNewViewDialog = true"
          v-tooltip.bottom="'New View'"
        />
        <Button
          icon="pi pi-trash"
          text
          rounded
          severity="danger"
          :disabled="!views.activeView.value"
          @click="handleDeleteView"
          v-tooltip.bottom="'Delete View'"
        />
      </div>
      <div class="tree-actions">
        <Button
          icon="pi pi-angle-double-down"
          text
          rounded
          size="small"
          @click="expandAll"
          v-tooltip.bottom="'Expand All'"
        />
        <Button
          icon="pi pi-angle-double-up"
          text
          rounded
          size="small"
          @click="collapseAll"
          v-tooltip.bottom="'Collapse All'"
        />
      </div>
    </div>

    <!-- Active view info -->
    <div v-if="views.activeView.value" class="active-view-info">
      <div class="view-main-row">
        <Checkbox
          :modelValue="views.activeView.value.enabled"
          @update:modelValue="views.updateView(views.activeView.value!.id, { enabled: $event })"
          binary
          inputId="view-enabled"
        />
        <label for="view-enabled" class="view-name">
          {{ views.activeView.value.name }}
        </label>
        <span class="filter-count">
          {{ views.activeView.value.filters.filter(f => f.hidden).length }} hidden
        </span>
        <Button
          v-if="views.activeView.value.filters.length > 0"
          label="Clear All"
          text
          size="small"
          @click="handleClearFilters"
        />
      </div>

      <!-- Perspective configuration -->
      <div class="perspective-row">
        <Checkbox
          v-model="views.activeView.value.showInActivityBar"
          binary
          inputId="show-in-activity-bar"
          @update:modelValue="handlePerspectiveToggle"
        />
        <label for="show-in-activity-bar">Activity Bar</label>

        <Dropdown
          v-if="views.activeView.value.showInActivityBar"
          v-model="views.activeView.value.perspectiveIcon"
          :options="availableIcons"
          optionLabel="label"
          optionValue="value"
          placeholder="Icon"
          class="icon-dropdown"
          @update:modelValue="handleIconChange"
        >
          <template #value="slotProps">
            <div v-if="slotProps.value" class="icon-option">
              <i :class="slotProps.value"></i>
            </div>
            <span v-else>Icon</span>
          </template>
          <template #option="slotProps">
            <div class="icon-option">
              <i :class="slotProps.option.value"></i>
              <span>{{ slotProps.option.label }}</span>
            </div>
          </template>
        </Dropdown>
      </div>
    </div>

    <div v-else class="no-view-hint">
      Select or create a view to start hiding elements
    </div>

    <!-- Model tree with visibility toggles -->
    <div class="tree-container">
      <Tree
        :value="modelTreeNodes"
        v-model:expandedKeys="expandedKeys"
        class="views-tree"
      >
        <template #default="{ node }">
          <div
            class="tree-node"
            :class="{
              'node-hidden': (node.data?.type === 'class' && isClassHidden(node.data.eClass)) || (node.data?.type === 'package' && isPackageHidden(node)),
              'node-partial': node.data?.type === 'package' && isPackagePartiallyHidden(node)
            }"
          >
            <div class="node-content">
              <span class="node-label">{{ node.label }}</span>
              <span v-if="node.data?.eClass?.isAbstract?.()" class="abstract-tag">abstract</span>
            </div>
            <!-- Package actions -->
            <div v-if="views.activeView.value && node.data?.type === 'package'" class="node-actions">
              <Button
                :icon="isPackageHidden(node) ? 'pi pi-eye' : 'pi pi-eye-slash'"
                text
                rounded
                size="small"
                :severity="isPackageHidden(node) ? 'success' : isPackagePartiallyHidden(node) ? 'warning' : 'secondary'"
                @click.stop="togglePackageVisibility(node)"
                v-tooltip.left="isPackageHidden(node) ? 'Show All Types' : 'Hide All Types'"
              />
            </div>
            <!-- Class actions -->
            <div v-if="views.activeView.value && node.data?.type === 'class'" class="node-actions">
              <Button
                :icon="isClassHidden(node.data.eClass) ? 'pi pi-eye' : 'pi pi-eye-slash'"
                text
                rounded
                size="small"
                :severity="isClassHidden(node.data.eClass) ? 'success' : 'secondary'"
                @click.stop="toggleClassVisibility(node, false)"
                v-tooltip.left="isClassHidden(node.data.eClass) ? 'Show Type' : 'Hide Type'"
              />
              <Button
                icon="pi pi-sitemap"
                text
                rounded
                size="small"
                @click.stop="toggleClassVisibility(node, true)"
                v-tooltip.left="'Hide Type + Subtypes'"
              />
            </div>
          </div>
        </template>
      </Tree>
    </div>

    <!-- Footer -->
    <template #footer>
      <Button label="Close" @click="dialogVisible = false" />
    </template>

    <!-- New View Dialog -->
    <Dialog
      v-model:visible="showNewViewDialog"
      header="Create New View"
      :modal="true"
      :style="{ width: '350px' }"
    >
      <div class="new-view-form">
        <label for="new-view-name">View Name</label>
        <InputText
          id="new-view-name"
          v-model="newViewName"
          placeholder="My View"
          class="w-full"
          @keyup.enter="handleCreateView"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewViewDialog = false" />
        <Button label="Create" @click="handleCreateView" :disabled="!newViewName.trim()" />
      </template>
    </Dialog>
  </Dialog>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-ground);
}

.view-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.view-dropdown {
  min-width: 200px;
}

.tree-actions {
  display: flex;
  gap: 0.25rem;
}

.active-view-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface-50);
  border-bottom: 1px solid var(--surface-border);
}

.view-main-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.perspective-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 1.5rem;
  font-size: 0.875rem;
}

.perspective-row label {
  color: var(--text-color-secondary);
}

.icon-dropdown {
  width: 110px;
}

.icon-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon-option i {
  width: 1rem;
  text-align: center;
}

.view-name {
  font-weight: 500;
}

.filter-count {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  background: var(--surface-200);
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
}

.no-view-hint {
  padding: 1rem;
  text-align: center;
  color: var(--text-color-secondary);
  background: var(--surface-50);
  border-bottom: 1px solid var(--surface-border);
}

.tree-container {
  flex: 1;
  overflow: auto;
  padding: 0.5rem;
}

.views-tree {
  background: transparent;
}

.views-tree :deep(.p-tree-node-content) {
  padding: 0.25rem 0.5rem;
}

.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 0.5rem;
}

.tree-node.node-hidden {
  opacity: 0.5;
}

.tree-node.node-hidden .node-label {
  text-decoration: line-through;
}

.tree-node.node-partial {
  opacity: 0.75;
}

.tree-node.node-partial .node-label {
  font-style: italic;
}

.node-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.node-label {
  font-size: 0.875rem;
}

.abstract-tag {
  font-size: 0.625rem;
  color: var(--text-color-secondary);
  background: var(--surface-200);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-style: italic;
}

.node-actions {
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.tree-node:hover .node-actions {
  opacity: 1;
}

.node-actions :deep(.p-button) {
  width: 24px;
  height: 24px;
  padding: 0;
}

.new-view-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.new-view-form label {
  font-weight: 500;
  font-size: 0.875rem;
}

.w-full {
  width: 100%;
}
</style>
