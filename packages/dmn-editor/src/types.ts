/**
 * DMN Editor Types
 *
 * TypeScript helper types, constants, and icon mappings for the DMN Editor plugin.
 */

/** DMN Hit Policy values */
export type HitPolicy = 'UNIQUE' | 'FIRST' | 'PRIORITY' | 'ANY' | 'COLLECT' | 'RULE_ORDER' | 'OUTPUT_ORDER'

/** DMN Builtin Aggregator for COLLECT hit policy */
export type BuiltinAggregator = 'COUNT' | 'SUM' | 'MIN' | 'MAX'

/** Hit Policy abbreviations for table display */
export const HIT_POLICY_LABELS: Record<HitPolicy, string> = {
  UNIQUE: 'U',
  FIRST: 'F',
  PRIORITY: 'P',
  ANY: 'A',
  COLLECT: 'C',
  RULE_ORDER: 'R',
  OUTPUT_ORDER: 'O'
}

/** Hit Policy descriptions for tooltips */
export const HIT_POLICY_DESCRIPTIONS: Record<HitPolicy, string> = {
  UNIQUE: 'Unique - Only one rule can match',
  FIRST: 'First - Use first matching rule',
  PRIORITY: 'Priority - Use highest priority match',
  ANY: 'Any - All matching rules must agree',
  COLLECT: 'Collect - Collect all matching outputs',
  RULE_ORDER: 'Rule Order - All matches in rule order',
  OUTPUT_ORDER: 'Output Order - All matches in output priority order'
}

/** Aggregator labels for COLLECT mode */
export const AGGREGATOR_LABELS: Record<BuiltinAggregator, string> = {
  COUNT: 'C#',
  SUM: 'C+',
  MIN: 'C<',
  MAX: 'C>'
}

/** DMN Tree Node types */
export type DmnTreeNodeType = 'definitions' | 'decision' | 'input-data' | 'bkm' | 'knowledge-source' | 'decision-table'

/** Tree node for PrimeVue Tree component */
export interface DmnTreeNode {
  key: string
  label: string
  icon: string
  type: DmnTreeNodeType
  data: any
  children?: DmnTreeNode[]
  leaf?: boolean
  selectable?: boolean
}

/** DMN Icon mappings */
export const DMN_ICONS = {
  definitions: 'pi pi-file',
  decision: 'pi pi-check-circle',
  inputData: 'pi pi-sign-in',
  bkm: 'pi pi-book',
  knowledgeSource: 'pi pi-info-circle',
  decisionTable: 'pi pi-table',
  inputClause: 'pi pi-arrow-right',
  outputClause: 'pi pi-arrow-left',
  rule: 'pi pi-list'
} as const

/** DMN namespace URI */
export const DMN_NS_URI = 'http://www.omg.org/spec/DMN/20191111/MODEL/'

/** DMN namespace prefix */
export const DMN_NS_PREFIX = 'dmn'

/** Default FEEL type references */
export const FEEL_TYPES = ['string', 'number', 'boolean', 'date', 'time', 'dateTime', 'duration'] as const

export type FeelType = typeof FEEL_TYPES[number]

/** Ecore data type to FEEL type mapping */
export const ECORE_TO_FEEL_TYPE: Record<string, FeelType> = {
  EString: 'string',
  EInt: 'number',
  EShort: 'number',
  ELong: 'number',
  EBigInteger: 'number',
  EFloat: 'number',
  EDouble: 'number',
  EBigDecimal: 'number',
  EBoolean: 'boolean',
  EDate: 'date'
}

/** Ecore data type to executor input widget type */
export type InputWidgetType = 'text' | 'number' | 'number-decimal' | 'boolean' | 'date' | 'select'

export const ECORE_TO_WIDGET: Record<string, InputWidgetType> = {
  EString: 'text',
  EInt: 'number',
  EShort: 'number',
  ELong: 'number',
  EBigInteger: 'number',
  EFloat: 'number-decimal',
  EDouble: 'number-decimal',
  EBigDecimal: 'number-decimal',
  EBoolean: 'boolean',
  EDate: 'date'
}
