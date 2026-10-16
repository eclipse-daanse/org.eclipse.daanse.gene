/**
 * Pluggable boolean expression evaluator for DiagramModel conditions.
 * Minimal OCL subset handles common predicates out of the box.
 */
import type { EObject } from '@emfts/core'

export interface ExpressionLike {
  language?: string
  body?: string
}

function wrap(o: EObject): unknown {
  return new Proxy(o as any, {
    get(target, prop) {
      if (typeof prop !== 'string') return target[prop]
      if (prop in target) return target[prop]
      const f = target.eClass?.()?.getEStructuralFeature?.(prop)
      return f ? target.eGet(f) : undefined
    },
  })
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true' || (typeof v === 'number' && v !== 0)
}

function readOperand(token: string, ctx: EObject): unknown {
  const t = token.trim()
  if (t.startsWith('self.')) {
    let cur: any = ctx
    for (const seg of t.slice(5).split('.')) {
      const f = cur?.eClass?.()?.getEStructuralFeature?.(seg)
      cur = f ? cur.eGet(f) : undefined
    }
    return cur
  }
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1)
  }
  return t
}

function evalOclSubset(body: string, ctx: EObject): boolean {
  const b = body.trim()
  if (/\bor\b/.test(b)) return b.split(/\bor\b/).some((p) => evalOclSubset(p, ctx))
  if (/\band\b/.test(b)) return b.split(/\band\b/).every((p) => evalOclSubset(p, ctx))
  let t = b
  let negate = false
  if (t.toLowerCase().startsWith('not ')) {
    negate = true
    t = t.slice(4).trim()
  }
  const m = t.match(/^(.*?)\s*(=|<>)\s*(.*)$/)
  let result: boolean
  if (m) {
    const eq = String(readOperand(m[1], ctx)) === String(readOperand(m[3], ctx))
    result = m[2] === '=' ? eq : !eq
  } else {
    result = truthy(readOperand(t, ctx))
  }
  return negate ? !result : result
}

/*
 * Helpers for JS expressions. `self` is the object behind a proxy that reads
 * features by name; `it` is the object itself, for identity checks. get()
 * reads a feature (lists as arrays), all() always gives an array, cls() the
 * class name, isA() checks the class or a supertype by name.
 */
function list(v: unknown): any[] {
  if (v == null) return []
  if (Array.isArray(v)) return v
  const anyV = v as { toArray?: () => any[] }
  return typeof anyV.toArray === 'function' ? anyV.toArray() : [v]
}

function getFeature(o: any, name: string): any {
  const f = o?.eClass?.()?.getEStructuralFeature?.(name)
  if (!f) return undefined
  const v = o.eGet(f)
  return f.isMany?.() ? list(v) : v
}

const HELPERS = {
  get: getFeature,
  all: (o: any, name: string) => list(getFeature(o, name)),
  cls: (o: any) => String(o?.eClass?.()?.getName?.() ?? ''),
  isA: (o: any, name: string) => {
    const c = o?.eClass?.()
    if (!c) return false
    if (c.getName?.() === name) return true
    return list(c.getEAllSuperTypes?.()).some((s: any) => s.getName?.() === name)
  },
  literal: (v: any) => (v == null ? '' : String(v.getLiteral?.() ?? v.getName?.() ?? v))
}

function runJs(body: string, ctx: EObject): unknown {
  const fn = new Function('self', 'it', 'get', 'all', 'cls', 'isA', 'literal', `"use strict"; return (${body});`)
  return fn(wrap(ctx), ctx, HELPERS.get, HELPERS.all, HELPERS.cls, HELPERS.isA, HELPERS.literal)
}

export function evaluateBoolean(expr: ExpressionLike | null | undefined, ctx: EObject): boolean {
  if (!expr || !expr.body) return true
  const lang = (expr.language || 'JS').toUpperCase()
  try {
    if (lang === 'JS') {
      return Boolean(runJs(expr.body, ctx))
    }
    if (lang === 'OCL') {
      return evalOclSubset(expr.body, ctx)
    }
    return true
  } catch {
    return true
  }
}
