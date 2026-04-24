<script setup lang="ts">
/**
 * MetamodelerEditor Component
 *
 * Property editor for selected metamodel elements.
 * Provides forms for editing EPackage, EClass, EAttribute, EReference properties.
 */

import { computed, ref, watch } from 'tsm:vue'
import { InputText } from 'tsm:primevue'
import { InputNumber } from 'tsm:primevue'
import { Checkbox } from 'tsm:primevue'
import { Dropdown } from 'tsm:primevue'
import { Textarea } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import type { EPackage, EClass, EAttribute, EReference, EEnum, EEnumLiteral } from '@emfts/core'
import { useSharedMetamodeler } from '../composables/useMetamodeler'

const metamodeler = useSharedMetamodeler()

// Determine element type
const elementType = computed<'package' | 'class' | 'attribute' | 'reference' | 'enum' | 'literal' | 'none'>(() => {
  const el = metamodeler.selectedElement.value
  if (!el) return 'none'

  // Check for package
  if ('getNsURI' in el && 'getEClassifiers' in el) return 'package'

  // Check for class
  if ('isAbstract' in el && 'isInterface' in el && 'getEAttributes' in el) return 'class'

  // Check for enum literal (must check BEFORE enum, since EEnumLiteral has getEEnum)
  if ('getEEnum' in el && typeof (el as any).getEEnum === 'function') return 'literal'

  // Check for enum (has getELiterals)
  if ('getELiterals' in el && typeof (el as any).getELiterals === 'function') return 'enum'

  // Check for attribute
  if ('getEAttributeType' in el) return 'attribute'

  // Check for reference
  if ('getEReferenceType' in el && 'isContainment' in el) return 'reference'

  // Fallback: check eClass name
  try {
    const eClassName = (el as any).eClass?.()?.getName?.()
    if (eClassName === 'EEnum') return 'enum'
    if (eClassName === 'EEnumLiteral') return 'literal'
  } catch { /* ignore */ }

  return 'none'
})

// Package properties
const pkgName = ref('')
const pkgNsURI = ref('')
const pkgNsPrefix = ref('')

// Class properties
const className = ref('')
const classAbstract = ref(false)
const classInterface = ref(false)

// Attribute properties
const attrName = ref('')
const attrType = ref('')
const attrLowerBound = ref(0)
const attrUpperBound = ref(1)
const attrDerived = ref(false)

// Reference properties
const refName = ref('')
const refType = ref('')
const refLowerBound = ref(0)
const refUpperBound = ref(1)
const refContainment = ref(false)

// Enum properties
const enumName = ref('')

// Enum Literal properties
const litName = ref('')
const litValue = ref(0)
const litLiteral = ref('')

// Standard EDataTypes
const dataTypes = [
  { label: 'EString', value: 'EString' },
  { label: 'EInt', value: 'EInt' },
  { label: 'EBoolean', value: 'EBoolean' },
  { label: 'EDouble', value: 'EDouble' },
  { label: 'EFloat', value: 'EFloat' },
  { label: 'ELong', value: 'ELong' },
  { label: 'EDate', value: 'EDate' },
  { label: 'EBigDecimal', value: 'EBigDecimal' },
  { label: 'EBigInteger', value: 'EBigInteger' }
]

// Watch for selection changes and load properties
watch(() => metamodeler.selectedElement.value, (el) => {
  if (!el) return

  if (elementType.value === 'package') {
    const pkg = el as EPackage
    pkgName.value = pkg.getName() || ''
    pkgNsURI.value = pkg.getNsURI() || ''
    pkgNsPrefix.value = pkg.getNsPrefix() || ''
  } else if (elementType.value === 'class') {
    const eClass = el as EClass
    className.value = eClass.getName() || ''
    classAbstract.value = eClass.isAbstract()
    classInterface.value = eClass.isInterface()
  } else if (elementType.value === 'attribute') {
    const attr = el as EAttribute
    attrName.value = attr.getName() || ''
    attrType.value = attr.getEAttributeType()?.getName() || 'EString'
    attrLowerBound.value = attr.getLowerBound()
    attrUpperBound.value = attr.getUpperBound()
    attrDerived.value = attr.isDerived()
  } else if (elementType.value === 'reference') {
    const ref = el as EReference
    refName.value = ref.getName() || ''
    // getEReferenceType() throws if type not set, so use try-catch
    try {
      refType.value = ref.getEReferenceType()?.getName() || ''
    } catch {
      refType.value = ''
    }
    refLowerBound.value = ref.getLowerBound()
    refUpperBound.value = ref.getUpperBound()
    refContainment.value = ref.isContainment()
  } else if (elementType.value === 'enum') {
    const eEnum = el as any
    enumName.value = eEnum.getName?.() || ''
  } else if (elementType.value === 'literal') {
    const lit = el as EEnumLiteral
    litName.value = lit.getName() || ''
    litValue.value = lit.getValue()
    litLiteral.value = lit.getLiteral() || ''
  }
}, { immediate: true })

// Save handlers
function savePackage() {
  const pkg = metamodeler.selectedElement.value as EPackage
  if (!pkg) return

  pkg.setName(pkgName.value)
  pkg.setNsURI(pkgNsURI.value)
  pkg.setNsPrefix(pkgNsPrefix.value)
  metamodeler.dirty.value = true
}

function saveClass() {
  const eClass = metamodeler.selectedElement.value as EClass
  if (!eClass) return

  metamodeler.updateClass(eClass, {
    name: className.value,
    isAbstract: classAbstract.value,
    isInterface: classInterface.value
  })
}

function saveAttribute() {
  const attr = metamodeler.selectedElement.value as EAttribute
  if (!attr) return

  metamodeler.updateAttribute(attr, {
    name: attrName.value,
    lowerBound: attrLowerBound.value,
    upperBound: attrUpperBound.value
  })
}

function saveReference() {
  const ref = metamodeler.selectedElement.value as EReference
  if (!ref) return

  metamodeler.updateReference(ref, {
    name: refName.value,
    lowerBound: refLowerBound.value,
    upperBound: refUpperBound.value,
    isContainment: refContainment.value
  })
}

function saveEnum() {
  const eEnum = metamodeler.selectedElement.value as any
  if (!eEnum) return

  eEnum.setName?.(enumName.value)
  metamodeler.dirty.value = true
  metamodeler.triggerUpdate()
}

function saveLiteral() {
  const lit = metamodeler.selectedElement.value as EEnumLiteral
  if (!lit) return

  lit.setName(litName.value)
  lit.setValue(litValue.value)
  lit.setLiteral(litLiteral.value)
  metamodeler.dirty.value = true
  metamodeler.triggerUpdate()
}

// Delete handler
function deleteElement() {
  const el = metamodeler.selectedElement.value
  if (el) {
    metamodeler.deleteElement(el)
  }
}
</script>

<template>
  <div class="metamodeler-editor">
    <!-- Header -->
    <div class="editor-header">
      <span class="header-title">Properties</span>
      <span v-if="metamodeler.dirty.value" class="dirty-indicator">*</span>
    </div>

    <!-- No selection -->
    <div v-if="elementType === 'none'" class="empty-state">
      <i class="pi pi-info-circle"></i>
      <p>Select an element to edit its properties</p>
    </div>

    <!-- Package Editor -->
    <div v-else-if="elementType === 'package'" class="editor-content">
      <div class="editor-section">
        <h3>EPackage</h3>

        <div class="field">
          <label for="pkgName">Name</label>
          <InputText id="pkgName" v-model="pkgName" class="w-full" @change="savePackage" />
        </div>

        <div class="field">
          <label for="pkgNsURI">Namespace URI</label>
          <InputText id="pkgNsURI" v-model="pkgNsURI" class="w-full" @change="savePackage" />
        </div>

        <div class="field">
          <label for="pkgNsPrefix">Namespace Prefix</label>
          <InputText id="pkgNsPrefix" v-model="pkgNsPrefix" class="w-full" @change="savePackage" />
        </div>
      </div>
    </div>

    <!-- Class Editor -->
    <div v-else-if="elementType === 'class'" class="editor-content">
      <div class="editor-section">
        <h3>EClass</h3>

        <div class="field">
          <label for="className">Name</label>
          <InputText id="className" v-model="className" class="w-full" @change="saveClass" />
        </div>

        <div class="field-checkbox">
          <Checkbox v-model="classAbstract" inputId="classAbstract" :binary="true" @change="saveClass" />
          <label for="classAbstract">Abstract</label>
        </div>

        <div class="field-checkbox">
          <Checkbox v-model="classInterface" inputId="classInterface" :binary="true" @change="saveClass" />
          <label for="classInterface">Interface</label>
        </div>

        <div class="field">
          <label>Super Types</label>
          <p class="hint">
            {{ (metamodeler.selectedElement.value as EClass)?.getESuperTypes?.()?.map(st => st.getName()).join(', ') || 'None' }}
          </p>
        </div>
      </div>

      <div class="editor-actions">
        <Button label="Delete Class" icon="pi pi-trash" severity="danger" size="small" @click="deleteElement" />
      </div>
    </div>

    <!-- Attribute Editor -->
    <div v-else-if="elementType === 'attribute'" class="editor-content">
      <div class="editor-section">
        <h3>EAttribute</h3>

        <div class="field">
          <label for="attrName">Name</label>
          <InputText id="attrName" v-model="attrName" class="w-full" @change="saveAttribute" />
        </div>

        <div class="field">
          <label for="attrType">Type</label>
          <Dropdown
            id="attrType"
            v-model="attrType"
            :options="dataTypes"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            placeholder="Select type"
          />
        </div>

        <div class="field-row">
          <div class="field">
            <label for="attrLower">Lower Bound</label>
            <InputNumber id="attrLower" v-model="attrLowerBound" :min="0" class="w-full" @update:modelValue="saveAttribute" />
          </div>
          <div class="field">
            <label for="attrUpper">Upper Bound</label>
            <InputNumber id="attrUpper" v-model="attrUpperBound" :min="-1" class="w-full" @update:modelValue="saveAttribute" />
          </div>
        </div>

        <div class="field-checkbox">
          <Checkbox v-model="attrDerived" inputId="attrDerived" :binary="true" />
          <label for="attrDerived">Derived</label>
        </div>
      </div>

      <div class="editor-actions">
        <Button label="Delete Attribute" icon="pi pi-trash" severity="danger" size="small" @click="deleteElement" />
      </div>
    </div>

    <!-- Reference Editor -->
    <div v-else-if="elementType === 'reference'" class="editor-content">
      <div class="editor-section">
        <h3>EReference</h3>

        <div class="field">
          <label for="refName">Name</label>
          <InputText id="refName" v-model="refName" class="w-full" @change="saveReference" />
        </div>

        <div class="field">
          <label for="refType">Target Type</label>
          <InputText id="refType" v-model="refType" class="w-full" disabled />
          <p class="hint">Set via context menu on the tree</p>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="refLower">Lower Bound</label>
            <InputNumber id="refLower" v-model="refLowerBound" :min="0" class="w-full" @update:modelValue="saveReference" />
          </div>
          <div class="field">
            <label for="refUpper">Upper Bound</label>
            <InputNumber id="refUpper" v-model="refUpperBound" :min="-1" class="w-full" @update:modelValue="saveReference" />
          </div>
        </div>

        <div class="field-checkbox">
          <Checkbox v-model="refContainment" inputId="refContainment" :binary="true" @change="saveReference" />
          <label for="refContainment">Containment</label>
        </div>
      </div>

      <div class="editor-actions">
        <Button label="Delete Reference" icon="pi pi-trash" severity="danger" size="small" @click="deleteElement" />
      </div>
    </div>

    <!-- Enum Editor -->
    <div v-else-if="elementType === 'enum'" class="editor-content">
      <div class="editor-section">
        <h3>EEnum</h3>

        <div class="field">
          <label for="enumName">Name</label>
          <InputText id="enumName" v-model="enumName" class="w-full" @change="saveEnum" />
        </div>

        <div class="field">
          <label>Literals</label>
          <p class="hint">
            {{ ((metamodeler.selectedElement.value as any)?.getELiterals?.() || []).map((l: any) => l.getName?.() || '?').join(', ') || 'None' }}
          </p>
          <p class="hint">Right-click on the enum in the tree to add literals.</p>
        </div>
      </div>

      <div class="editor-actions">
        <Button label="Delete Enum" icon="pi pi-trash" severity="danger" size="small" @click="deleteElement" />
      </div>
    </div>

    <!-- Enum Literal Editor -->
    <div v-else-if="elementType === 'literal'" class="editor-content">
      <div class="editor-section">
        <h3>EEnumLiteral</h3>

        <div class="field">
          <label for="litName">Name</label>
          <InputText id="litName" v-model="litName" class="w-full" @change="saveLiteral" />
        </div>

        <div class="field">
          <label for="litValue">Value</label>
          <InputNumber id="litValue" v-model="litValue" class="w-full" @update:modelValue="saveLiteral" />
        </div>

        <div class="field">
          <label for="litLiteral">Literal</label>
          <InputText id="litLiteral" v-model="litLiteral" class="w-full" @change="saveLiteral" />
        </div>
      </div>

      <div class="editor-actions">
        <Button label="Delete Literal" icon="pi pi-trash" severity="danger" size="small" @click="deleteElement" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.metamodeler-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 8px;
  height: 40px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.header-title {
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.dirty-indicator {
  color: var(--primary-color);
  font-weight: bold;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
  flex: 1;
}

.empty-state i {
  font-size: 2rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.editor-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.editor-section {
  margin-bottom: 1.5rem;
}

.editor-section h3 {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary-color);
  text-transform: uppercase;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.field label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.field-row {
  display: flex;
  gap: 1rem;
}

.field-row .field {
  flex: 1;
}

.field-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.hint {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin: 0.25rem 0 0 0;
}

.editor-actions {
  padding: 1rem;
  border-top: 1px solid var(--surface-border);
}

.w-full {
  width: 100%;
}
</style>
