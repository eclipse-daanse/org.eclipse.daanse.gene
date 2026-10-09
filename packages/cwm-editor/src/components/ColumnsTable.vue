<script setup lang="ts">
/**
 * The columns of a relational table as a table (PH-8): Name, Typ, PK, Null,
 * Description. Columns are rows here, not sections of their own.
 *
 * Test ids follow PH-C1: the table carries `<testId>`, each row
 * `<testId>.Row@<slug(column name)>`.
 */
import type { TableView } from '../composables/documentation'
import { slug } from '../composables/documentation'

defineProps<{
  table: TableView
  /** data-testid of the table, e.g. cwm.Editor.ContextView.ObjectRow@Table-customer.Row.Body.Columns */
  testId?: string
}>()

const emit = defineEmits<{
  navigate: [object: any]
}>()

function nullText(nullable: string): string {
  if (nullable === 'columnNoNulls') return 'nein'
  if (nullable === 'columnNullable') return 'ja'
  return nullable
}
</script>

<template>
  <table class="columns-table" :data-testid="testId">
    <thead>
      <tr>
        <th>Name</th>
        <th>Typ</th>
        <th class="col-pk">PK</th>
        <th class="col-null">Null</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="col in table.columns"
        :key="col.name"
        :data-testid="testId ? `${testId}.Row@${slug(col.name)}` : undefined"
      >
        <td class="col-name">
          <a class="link" @click="emit('navigate', col.column)">{{ col.name || '(ohne Namen)' }}</a>
          <span v-if="col.foreignKey" class="fk" :title="'Fremdschlüssel → ' + col.foreignKey">
            → <a class="link" @click="emit('navigate', col.foreignKeyTable)">{{ col.foreignKey }}</a>
          </span>
        </td>
        <td class="col-type">{{ col.type }}</td>
        <td class="col-pk">
          <i v-if="col.primaryKey" class="pi pi-check" title="Primärschlüssel"></i>
        </td>
        <td class="col-null">{{ nullText(col.nullable) }}</td>
        <td class="col-desc">{{ col.description }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.columns-table {
  margin-top: 0.6rem;
  border-collapse: collapse;
  width: 100%;
  font-size: 0.85rem;
}

.columns-table th,
.columns-table td {
  text-align: left;
  vertical-align: top;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--surface-border);
}

.columns-table th {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.columns-table tbody tr:hover {
  background: var(--surface-hover);
}

.col-name {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  white-space: nowrap;
}

.col-type {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  white-space: nowrap;
}

.col-pk,
.col-null {
  white-space: nowrap;
  text-align: center;
}

.col-pk i {
  color: var(--primary-color);
  font-size: 0.75rem;
}

.col-desc {
  color: var(--text-color-secondary);
}

.link {
  cursor: pointer;
  color: var(--primary-color);
}

.link:hover {
  text-decoration: underline;
}

.fk {
  margin-left: 0.4rem;
  color: var(--text-color-secondary);
  font-family: inherit;
}
</style>
