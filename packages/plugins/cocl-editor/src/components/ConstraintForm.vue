<script setup lang="ts">
/**
 * ConstraintForm - Right-side form for editing a single constraint.
 * Includes OCL Monaco Editor for expression editing.
 * Context class is selected via the SearchDialog (opened by parent).
 */

import { computed } from 'tsm:vue'
import { InputText, Dropdown, Button } from 'tsm:primevue'
import type { CoclConstraint, CoclRole, CoclSeverity } from 'ui-problems-panel'
import { OclMonacoEditor } from 'transformation'

const props = defineProps<{
  constraint: CoclConstraint | null
  featureNameOptions: string[]
}>()

const emit = defineEmits<{
  'update:constraint': [constraint: CoclConstraint]
  'open-class-search': []
  'open-class-tree': []
}>()

const roleOptions = [
  { label: 'Validation', value: 'VALIDATION' },
  { label: 'Derived', value: 'DERIVED' },
  { label: 'Reference Filter', value: 'REFERENCE_FILTER' }
]

const severityOptions = [
  { label: 'Trace', value: 'TRACE' },
  { label: 'Info', value: 'INFO' },
  { label: 'Warning', value: 'WARN' },
  { label: 'Error', value: 'ERROR' },
  { label: 'Fatal', value: 'FATAL' }
]

// --- Form logic ---
const showFeatureName = computed(() => {
  return props.constraint?.role === 'DERIVED' || props.constraint?.role === 'REFERENCE_FILTER'
})

const editorContextClass = computed(() => {
  return props.constraint?.contextClass || ''
})

function updateField<K extends keyof CoclConstraint>(field: K, value: CoclConstraint[K]) {
  if (!props.constraint) return
  emit('update:constraint', { ...props.constraint, [field]: value })
}

function updateExpression(value: string) {
  updateField('expression', value)
}
</script>

<template>
  <div class="constraint-form" v-if="constraint">
    <div class="form-grid">
      <div class="form-field">
        <label>Name</label>
        <InputText
          :modelValue="constraint.name"
          @update:modelValue="updateField('name', $event)"
          placeholder="Constraint name"
          class="w-full"
          size="small"
        />
      </div>

      <div class="form-field">
        <label>Description</label>
        <InputText
          :modelValue="constraint.description || ''"
          @update:modelValue="updateField('description', $event)"
          placeholder="Optional description"
          class="w-full"
          size="small"
        />
      </div>

      <div class="form-row">
        <div class="form-field flex-1">
          <label>Context Class</label>
          <div class="class-picker">
            <InputText
              :modelValue="constraint.contextClass"
              @update:modelValue="updateField('contextClass', $event)"
              placeholder="package.ClassName"
              class="class-input"
              size="small"
            />
            <Button
              icon="pi pi-search"
              severity="secondary"
              size="small"
              @click="emit('open-class-search')"
              title="Search class"
            />
            <Button
              icon="pi pi-sitemap"
              severity="secondary"
              size="small"
              @click="emit('open-class-tree')"
              title="Browse model tree"
            />
          </div>
        </div>

        <div class="form-field" style="width: 160px">
          <label>Role</label>
          <Dropdown
            :modelValue="constraint.role"
            @update:modelValue="updateField('role', $event as CoclRole)"
            :options="roleOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            size="small"
          />
        </div>
      </div>

      <div class="form-field" v-if="showFeatureName">
        <label>{{ constraint?.role === 'DERIVED' ? 'Derived Attribute' : 'Reference' }}</label>
        <Dropdown
          :modelValue="constraint.featureName || ''"
          @update:modelValue="updateField('featureName', $event)"
          :options="featureNameOptions"
          :editable="true"
          :placeholder="constraint?.role === 'DERIVED' ? 'Select attribute...' : 'Select reference...'"
          class="w-full"
          size="small"
        />
      </div>

      <div class="form-field" style="width: 160px">
        <label>Severity</label>
        <Dropdown
          :modelValue="constraint.severity"
          @update:modelValue="updateField('severity', $event as CoclSeverity)"
          :options="severityOptions"
          optionLabel="label"
          optionValue="value"
          class="w-full"
          size="small"
        />
      </div>

      <div class="form-field">
        <label>Expression</label>
        <OclMonacoEditor
          :modelValue="constraint.expression"
          @update:modelValue="updateExpression"
          :height="150"
          :singleLine="false"
          :contextClass="editorContextClass"
        />
      </div>

      <div class="form-row toggles">
        <label class="toggle-label">
          <input
            type="checkbox"
            :checked="constraint.active"
            @change="updateField('active', ($event.target as HTMLInputElement).checked)"
          />
          Active
        </label>
        <label class="toggle-label">
          <input
            type="checkbox"
            :checked="constraint.overrides"
            @change="updateField('overrides', ($event.target as HTMLInputElement).checked)"
          />
          Overrides
        </label>
      </div>
    </div>
  </div>

  <div v-else class="no-selection">
    <i class="pi pi-info-circle"></i>
    <span>Select a constraint to edit</span>
  </div>

</template>

<style scoped>
.constraint-form {
  padding: 12px 16px;
  overflow-y: auto;
  height: 100%;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.form-row {
  display: flex;
  gap: 10px;
}

.flex-1 {
  flex: 1;
}

.w-full {
  width: 100%;
}

.class-picker {
  display: flex;
  gap: 4px;
}

.class-input {
  flex: 1;
}

.toggles {
  padding-top: 4px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: var(--text-color, #1e293b);
  cursor: pointer;
  user-select: none;
}

.toggle-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--primary-color, #6366f1);
}

.no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-color-secondary, #64748b);
  font-size: 0.875rem;
}

.no-selection i {
  font-size: 1.5rem;
  opacity: 0.5;
}

</style>
