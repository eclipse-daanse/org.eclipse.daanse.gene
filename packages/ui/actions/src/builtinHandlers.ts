/**
 * Built-in action handlers provided by the action module
 */

import type { ActionHandler, HandlerContext, ActionResult } from './types'

/** Export selected object as XMI string */
export const exportXmiHandler: ActionHandler = {
  async execute(ctx: HandlerContext): Promise<ActionResult> {
    const obj = ctx.input.primaryObject
    if (!obj) {
      return { status: 'ERROR', logs: [{ message: 'No object selected', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
    }

    try {
      // Use emfts serializer
      const { XMIResource } = await import('@emfts/core')
      const resource = new XMIResource()
      resource.getContents().push(obj)
      const xmiContent = resource.saveToString()

      return {
        status: 'SUCCESS',
        logs: [{ message: 'XMI exported successfully', level: 'INFO', timestamp: new Date() }],
        artifacts: [{
          type: 'FILE',
          name: 'export.xmi',
          fileName: `${obj.eClass().getName() || 'export'}.xmi`,
          mimeType: 'application/xml',
          content: xmiContent,
          data: xmiContent,
          handling: 'DOWNLOAD'
        }]
      }
    } catch (e: any) {
      return { status: 'ERROR', logs: [{ message: `Export failed: ${e.message}`, level: 'ERROR', timestamp: new Date() }], artifacts: [] }
    }
  }
}

/** Copy object URI to clipboard */
export const copyUriHandler: ActionHandler = {
  async execute(ctx: HandlerContext): Promise<ActionResult> {
    const obj = ctx.input.primaryObject
    if (!obj) {
      return { status: 'ERROR', logs: [{ message: 'No object selected', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
    }

    const eClass = obj.eClass()
    const uri = `${eClass.getEPackage()?.getNsURI()}#//${eClass.getName()}`

    try {
      await navigator.clipboard.writeText(uri)
      return {
        status: 'SUCCESS',
        logs: [{ message: `Copied to clipboard: ${uri}`, level: 'INFO', timestamp: new Date() }],
        artifacts: []
      }
    } catch (e: any) {
      return { status: 'WARNING', logs: [{ message: `Clipboard write failed: ${e.message}. URI: ${uri}`, level: 'WARN', timestamp: new Date() }], artifacts: [] }
    }
  }
}

/** Copy object as JSON to clipboard */
export const copyJsonHandler: ActionHandler = {
  async execute(ctx: HandlerContext): Promise<ActionResult> {
    const obj = ctx.input.primaryObject
    if (!obj) {
      return { status: 'ERROR', logs: [{ message: 'No object selected', level: 'ERROR', timestamp: new Date() }], artifacts: [] }
    }

    try {
      const json = serializeToJson(obj)
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2))
      return {
        status: 'SUCCESS',
        logs: [{ message: 'JSON copied to clipboard', level: 'INFO', timestamp: new Date() }],
        artifacts: []
      }
    } catch (e: any) {
      return { status: 'ERROR', logs: [{ message: `Copy failed: ${e.message}`, level: 'ERROR', timestamp: new Date() }], artifacts: [] }
    }
  }
}

function serializeToJson(obj: any, depth = 0): any {
  if (depth > 5) return '...'
  const result: any = { _type: obj.eClass()?.getName() }
  const eClass = obj.eClass()
  if (!eClass) return result

  for (const feature of eClass.getEAllStructuralFeatures?.() || []) {
    const name = feature.getName()
    if (!name) continue
    try {
      const value = obj.eGet(feature)
      if (value === undefined || value === null) continue
      if (feature.eClass?.()?.getName?.() === 'EReference') {
        if (feature.isContainment?.()) {
          if (Array.isArray(value)) {
            result[name] = value.map((v: any) => serializeToJson(v, depth + 1))
          } else {
            result[name] = serializeToJson(value, depth + 1)
          }
        }
        // Skip non-containment references to avoid circular refs
      } else {
        result[name] = value
      }
    } catch { /* skip */ }
  }
  return result
}
