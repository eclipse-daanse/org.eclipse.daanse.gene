/**
 * EcoreCommandParser - Parses Ecore XML and extracts CommandDefinitions
 *
 * Finds EClasses that extend CommandInterface (via eSuperTypes),
 * then for each EOperation with a @Command annotation, extracts metadata.
 */

export interface CommandDefinition {
  commandId: string
  label: string
  category: string
  scope: string
  icon?: string
  keybinding?: string
  when?: string
  parameters: CommandParameter[]
  moduleId: string
  enabled: boolean
}

export interface CommandParameter {
  name: string
  type: string
  required: boolean
}

const COMMAND_ANNOTATION_SOURCE = 'http://gene/model/command/Command'

const ECORE_TYPE_MAP: Record<string, string> = {
  'EString': 'string',
  'EInt': 'number',
  'EBoolean': 'boolean',
  'EFloat': 'number',
  'EDouble': 'number',
  'ELong': 'number',
}

/**
 * Parse an Ecore XML string and extract CommandDefinitions.
 * Uses DOM parsing (browser-native) — no EMF runtime dependency for parsing.
 */
export function parseCommandEcore(ecoreXml: string, moduleId: string): CommandDefinition[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(ecoreXml, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    console.error('[EcoreCommandParser] XML parse error:', parseError.textContent)
    return []
  }

  const commands: CommandDefinition[] = []
  const classifiers = doc.querySelectorAll('eClassifiers')

  for (const classifier of classifiers) {
    const type = classifier.getAttribute('xsi:type')
    if (type !== 'ecore:EClass') continue

    // Check if this class extends CommandInterface (via eSuperTypes)
    const superTypes = classifier.getAttribute('eSuperTypes') || ''
    if (!superTypes.includes('CommandInterface') && !superTypes.includes('command.ecore#//CommandInterface')) {
      continue
    }

    // Find EOperations with @Command annotation
    const operations = classifier.querySelectorAll('eOperations')
    for (const op of operations) {
      const opName = op.getAttribute('name')
      if (!opName) continue

      const annotation = findAnnotation(op, COMMAND_ANNOTATION_SOURCE)
      if (!annotation) continue

      const details = parseAnnotationDetails(annotation)

      const commandId = details.commandId || `${moduleId}.${opName}`
      const label = details.label || opName
      const category = details.category || 'TOOLS'
      const scope = details.scope || 'GLOBAL'

      // Parse parameters from EParameters
      const parameters: CommandParameter[] = []
      const eParams = op.querySelectorAll('eParameters')
      for (const param of eParams) {
        const paramName = param.getAttribute('name')
        if (!paramName) continue

        const eType = param.getAttribute('eType') || ''
        const tsType = mapEcoreType(eType)
        const lowerBound = param.getAttribute('lowerBound')
        const required = lowerBound ? parseInt(lowerBound, 10) > 0 : false

        parameters.push({ name: paramName, type: tsType, required })
      }

      commands.push({
        commandId,
        label,
        category,
        scope,
        icon: details.icon || undefined,
        keybinding: details.keybinding || undefined,
        when: details.when || undefined,
        parameters,
        moduleId,
        enabled: true
      })
    }
  }

  return commands
}

function findAnnotation(element: Element, source: string): Element | null {
  const annotations = element.querySelectorAll('eAnnotations')
  for (const ann of annotations) {
    if (ann.getAttribute('source') === source) return ann
  }
  return null
}

function parseAnnotationDetails(annotation: Element): Record<string, string> {
  const details: Record<string, string> = {}
  const detailElements = annotation.querySelectorAll('details')
  for (const detail of detailElements) {
    const key = detail.getAttribute('key')
    const value = detail.getAttribute('value')
    if (key && value) details[key] = value
  }
  return details
}

function mapEcoreType(ecoreType: string): string {
  // Extract type name from full reference like "ecore:EDataType http://...#//EString"
  const parts = ecoreType.split('#//')
  const typeName = parts.length > 1 ? parts[parts.length - 1] : ecoreType

  return ECORE_TYPE_MAP[typeName] || 'string'
}
