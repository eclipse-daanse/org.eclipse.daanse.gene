/**
 * useFeelEngine - FEEL Parser + Evaluator wrapper
 *
 * Uses the `feelin` library for DMN FEEL expression parsing and evaluation.
 * Provides:
 * - Expression parsing and syntax validation
 * - Unary test evaluation (for input entries like `>= 60`, `"Gold"`)
 * - Full expression evaluation (for output entries)
 * - Decision table execution with hit policy support
 */

import {
  evaluate as feelEvaluate,
  unaryTest as feelUnaryTest,
  SyntaxError as FeelSyntaxError
} from 'feelin'

export interface ParseResult {
  valid: boolean
  error?: string
  position?: { from: number; to: number }
}

export interface ExecutionResult {
  matchedRules: number[]
  outputs: Record<string, any>[]
  appliedOutput: Record<string, any> | Record<string, any>[] | null
}

/**
 * Validate a FEEL expression (parse only, no evaluation)
 */
export function validateCell(expression: string): ParseResult {
  if (!expression || expression === '-') {
    return { valid: true }
  }

  try {
    // Try evaluating with empty context to check syntax
    feelEvaluate(expression, {})
    return { valid: true }
  } catch (e: any) {
    if (e instanceof FeelSyntaxError) {
      return {
        valid: false,
        error: e.message,
        position: e.position
      }
    }
    // Some runtime errors are not syntax errors
    // (e.g. undefined variable references) - these are still valid syntax
    return { valid: true }
  }
}

/**
 * Validate a FEEL unary test expression
 */
export function validateUnaryTest(expression: string): ParseResult {
  if (!expression || expression === '-') {
    return { valid: true }
  }

  try {
    feelUnaryTest(expression, { '?': 0 })
    return { valid: true }
  } catch (e: any) {
    if (e instanceof FeelSyntaxError) {
      return {
        valid: false,
        error: e.message,
        position: e.position
      }
    }
    return { valid: true }
  }
}

/**
 * Evaluate a FEEL expression
 */
export function evaluateExpression(expression: string, context: Record<string, any>): { value: any; error?: string } {
  if (!expression || expression === '') {
    return { value: null }
  }

  try {
    const result = feelEvaluate(expression, context)
    return { value: result.value }
  } catch (e: any) {
    return { value: null, error: e.message || String(e) }
  }
}

/**
 * Evaluate a FEEL unary test expression against an input value
 * Returns true if the test passes, false otherwise
 */
export function evaluateUnaryTest(
  expression: string,
  inputValue: any,
  context: Record<string, any>
): { matches: boolean; error?: string } {
  // '-' means "any value matches" (don't care)
  if (!expression || expression === '-') {
    return { matches: true }
  }

  try {
    // feelin's unaryTest expects the input value as '?' in the context
    const testContext = { ...context, '?': inputValue }
    const result = feelUnaryTest(expression, testContext)
    return { matches: result.value === true }
  } catch (e: any) {
    return { matches: false, error: e.message || String(e) }
  }
}

/**
 * Execute a decision table against input values
 *
 * @param inputClauses - Array of { label, typeRef } for each input column
 * @param outputClauses - Array of { label, name, typeRef } for each output column
 * @param rules - Array of { inputEntries: string[], outputEntries: string[] }
 * @param inputValues - Map of input label → value
 * @param hitPolicy - Hit policy to apply
 * @param aggregation - Aggregation for COLLECT hit policy
 */
export function executeDecisionTable(
  inputClauses: Array<{ label: string; typeRef: string }>,
  outputClauses: Array<{ label: string; name: string; typeRef: string }>,
  rules: Array<{ inputEntries: string[]; outputEntries: string[] }>,
  inputValues: Record<string, any>,
  hitPolicy: string,
  aggregation?: string
): ExecutionResult {
  const matchedRules: number[] = []
  const outputs: Record<string, any>[] = []

  // Build context from input values
  const context: Record<string, any> = { ...inputValues }

  // Evaluate each rule
  for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
    const rule = rules[ruleIdx]
    let allMatch = true

    // Check each input entry against the corresponding input value
    for (let colIdx = 0; colIdx < rule.inputEntries.length; colIdx++) {
      const entry = rule.inputEntries[colIdx]
      const clause = inputClauses[colIdx]
      if (!clause) continue

      const inputVal = inputValues[clause.label]
      const result = evaluateUnaryTest(entry, inputVal, context)

      if (!result.matches) {
        allMatch = false
        break
      }
    }

    if (allMatch) {
      matchedRules.push(ruleIdx)

      // Evaluate output entries
      const outputRow: Record<string, any> = {}
      for (let colIdx = 0; colIdx < rule.outputEntries.length; colIdx++) {
        const entry = rule.outputEntries[colIdx]
        const clause = outputClauses[colIdx]
        if (!clause) continue

        const result = evaluateExpression(entry, context)
        outputRow[clause.name || clause.label] = result.value
      }
      outputs.push(outputRow)
    }
  }

  // Apply hit policy
  const appliedOutput = applyHitPolicy(hitPolicy, outputs, matchedRules, aggregation)

  return { matchedRules, outputs, appliedOutput }
}

/**
 * Apply hit policy to matched outputs
 */
function applyHitPolicy(
  hitPolicy: string,
  outputs: Record<string, any>[],
  matchedRules: number[],
  aggregation?: string
): Record<string, any> | Record<string, any>[] | null {
  if (outputs.length === 0) return null

  switch (hitPolicy) {
    case 'UNIQUE':
    case 'ANY':
      // Return the single match (or first if multiple - ANY assumes they agree)
      return outputs[0] || null

    case 'FIRST':
      // Return the first match
      return outputs[0] || null

    case 'PRIORITY':
      // Return the first match (simplified - real priority needs output value ordering)
      return outputs[0] || null

    case 'RULE_ORDER':
    case 'OUTPUT_ORDER':
      // Return all matches in order
      return outputs

    case 'COLLECT':
      if (!aggregation) return outputs

      // Apply aggregation
      const values = outputs.flatMap(o => Object.values(o).filter(v => typeof v === 'number'))

      switch (aggregation) {
        case 'COUNT':
          return { result: outputs.length }
        case 'SUM':
          return { result: values.reduce((a, b) => a + b, 0) }
        case 'MIN':
          return { result: Math.min(...values) }
        case 'MAX':
          return { result: Math.max(...values) }
        default:
          return outputs
      }

    default:
      return outputs[0] || null
  }
}
