/**
 * XML Syntax Highlighter Composable
 *
 * Provides theme-aware XML/XMI syntax highlighting.
 */

import { computed } from 'tsm:vue'
import type { XmlSyntaxTheme, XmiFileInfo } from '../types'
import { getTheme } from '../themes'

export interface UseXmlHighlighterOptions {
  /** Maximum content length before truncation */
  maxLength?: number
  /** Whether to use dark theme */
  isDark?: boolean
}

/**
 * Composable for XML syntax highlighting
 */
export function useXmlHighlighter(options: UseXmlHighlighterOptions = {}) {
  const { maxLength = 5000, isDark = true } = options

  const theme = computed(() => getTheme(isDark))

  /**
   * Generate CSS variables for the current theme
   */
  function getThemeCssVars(t: XmlSyntaxTheme): Record<string, string> {
    return {
      '--xml-declaration': t.declaration,
      '--xml-comment': t.comment,
      '--xml-tag': t.tag,
      '--xml-bracket': t.bracket,
      '--xml-attr-name': t.attrName,
      '--xml-attr-value': t.attrValue,
      '--xml-namespace': t.namespace,
      '--xml-ns-value': t.nsValue,
      '--xml-xsi-type': t.xsiType,
      '--xml-type-value': t.typeValue,
      '--xml-truncated': t.truncated,
      '--xml-background': t.background,
      '--xml-foreground': t.foreground,
      '--xml-header-bg': t.headerBackground,
      '--xml-header-text': t.headerText
    }
  }

  /**
   * Highlight XML content with syntax coloring
   */
  function highlightXml(content: string): string {
    if (!content) return ''

    // Truncate if too long
    let truncated = false
    if (content.length > maxLength) {
      content = content.substring(0, maxLength)
      truncated = true
    }

    // Escape HTML first
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

    // Apply syntax highlighting
    const highlighted = escaped
      // XML declaration
      .replace(
        /(&lt;\?xml[^?]*\?&gt;)/g,
        '<span class="xml-declaration">$1</span>'
      )
      // Comments
      .replace(
        /(&lt;!--[\s\S]*?--&gt;)/g,
        '<span class="xml-comment">$1</span>'
      )
      // Namespace declarations (xmlns:xxx="...")
      .replace(
        /(xmlns(?::[a-zA-Z0-9_-]+)?)(=)(&quot;[^&]*&quot;)/g,
        '<span class="xml-namespace">$1</span>$2<span class="xml-ns-value">$3</span>'
      )
      // XMI type references (xsi:type="...") - before general attributes
      .replace(
        /(xsi:type)(=)(&quot;[^&]*&quot;)/g,
        '<span class="xml-xsi-type">$1</span>$2<span class="xml-type-value">$3</span>'
      )
      // Attribute names and values
      .replace(
        /\s([a-zA-Z_][a-zA-Z0-9_:-]*)(=)(&quot;[^&]*&quot;)/g,
        ' <span class="xml-attr-name">$1</span>$2<span class="xml-attr-value">$3</span>'
      )
      // Self-closing tags
      .replace(
        /(&lt;)([a-zA-Z_][a-zA-Z0-9_:-]*)([^&]*?)(\/&gt;)/g,
        '$1<span class="xml-tag">$2</span>$3<span class="xml-bracket">$4</span>'
      )
      // Opening tags
      .replace(
        /(&lt;)([a-zA-Z_][a-zA-Z0-9_:-]*)([^\/&]*?)(&gt;)/g,
        '$1<span class="xml-tag">$2</span>$3$4'
      )
      // Closing tags
      .replace(
        /(&lt;\/)([a-zA-Z_][a-zA-Z0-9_:-]*)(&gt;)/g,
        '$1<span class="xml-tag">$2</span>$3'
      )
      // Brackets
      .replace(/(&lt;)/g, '<span class="xml-bracket">$1</span>')
      .replace(/(&gt;)/g, '<span class="xml-bracket">$1</span>')

    if (truncated) {
      return highlighted + '\n<span class="xml-truncated">... (truncated)</span>'
    }

    return highlighted
  }

  /**
   * Parse basic info from XMI content
   */
  function parseXmiInfo(content: string, fileName: string): XmiFileInfo {
    // Get root element
    const rootMatch = content.match(/<([a-zA-Z]+:)?([a-zA-Z]+)[\s>]/)
    const rootElement = rootMatch ? rootMatch[2] : 'Unknown'

    // Count elements (rough estimate)
    const elementMatches = content.match(/<[a-zA-Z]/g)
    const elementCount = elementMatches ? elementMatches.length : 0

    // Try to find name attribute
    const nameMatch = content.match(/name="([^"]+)"/)
    const name = nameMatch ? nameMatch[1] : fileName.replace(/\.[^.]+$/, '')

    // Extract namespaces
    const nsMatches = content.matchAll(/xmlns(?::[a-zA-Z0-9_-]+)?="([^"]+)"/g)
    const namespaces = Array.from(nsMatches, m => m[1])

    // Check if workspace file
    const isWorkspace = isWorkspaceXmi(content)

    return {
      name,
      rootElement,
      elementCount,
      fileSize: content.length,
      namespaces,
      isWorkspace
    }
  }

  /**
   * Check if XMI content is a workspace file (EditorConfig root)
   */
  function isWorkspaceXmi(content: string): boolean {
    // Check for EditorConfig root element
    if (content.includes('<EditorConfig') || content.includes(':EditorConfig')) {
      return true
    }
    // Check for fennecui namespace
    if (content.includes('fennec/ts/generic/ui') || content.includes('fennecui')) {
      return true
    }
    return false
  }

  /**
   * Format file size in human readable format
   */
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return {
    theme,
    getThemeCssVars,
    highlightXml,
    parseXmiInfo,
    isWorkspaceXmi,
    formatFileSize
  }
}
