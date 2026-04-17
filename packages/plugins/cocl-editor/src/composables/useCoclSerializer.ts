/**
 * C-OCL XMI Serializer
 *
 * Serializes a CoclConstraintSet back to XMI format.
 * Produces output matching the format of .c-ocl files.
 */

import type { CoclConstraintSet, CoclConstraint } from 'ui-problems-panel'

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Serialize a CoclConstraintSet to XMI string
 */
export function serializeCoclToXml(constraintSet: CoclConstraintSet): string {
  const lines: string[] = []

  lines.push('<?xml version="1.0" encoding="UTF-8"?>')

  // Root element with attributes
  const rootAttrs = [
    'xmi:version="2.0"',
    'xmlns:xmi="http://www.omg.org/XMI"',
    'xmlns:cocl="http://www.gme.org/cocl/1.0"',
    `name="${escapeXml(constraintSet.name)}"`,
    `version="${escapeXml(constraintSet.version || '1.0')}"`,
  ]

  if (constraintSet.description) {
    rootAttrs.push(`description="${escapeXml(constraintSet.description)}"`)
  }

  lines.push(`<cocl:OclConstraintSet ${rootAttrs.join('\n    ')}>`)

  // Target model namespace URIs
  for (const nsUri of constraintSet.targetModelNsURIs) {
    lines.push(`  <targetModelNsURIs>${escapeXml(nsUri)}</targetModelNsURIs>`)
  }

  if (constraintSet.targetModelNsURIs.length > 0 && constraintSet.constraints.length > 0) {
    lines.push('')
  }

  // Constraints
  for (const constraint of constraintSet.constraints) {
    lines.push(serializeConstraint(constraint))
  }

  lines.push('')
  lines.push('</cocl:OclConstraintSet>')

  return lines.join('\n')
}

/**
 * Serialize a single constraint element
 */
function serializeConstraint(constraint: CoclConstraint): string {
  const attrs: string[] = []

  attrs.push(`name="${escapeXml(constraint.name)}"`)

  if (constraint.description) {
    attrs.push(`description="${escapeXml(constraint.description)}"`)
  }

  attrs.push(`expression="${escapeXml(constraint.expression)}"`)
  attrs.push(`severity="${constraint.severity}"`)
  attrs.push(`role="${constraint.role}"`)
  attrs.push(`contextClass="${escapeXml(constraint.contextClass)}"`)

  if (constraint.featureName) {
    attrs.push(`featureName="${escapeXml(constraint.featureName)}"`)
  }

  attrs.push(`active="${constraint.active}"`)

  if (constraint.overrides) {
    attrs.push(`overrides="${constraint.overrides}"`)
  }

  const indent = '  '
  const attrIndent = '      '

  return `${indent}<constraints ${attrs.join(`\n${attrIndent}`)}/>`
}
