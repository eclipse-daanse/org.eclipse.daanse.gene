/**
 * XMI Viewer Types
 *
 * Type definitions for the XMI file viewer extension system.
 */

import type { Component } from 'tsm:vue'

/**
 * File viewer contribution interface
 */
export interface FileViewerContribution {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** File extensions this viewer handles (e.g., ['.xmi', '.ecore']) */
  extensions: string[]
  /** MIME types this viewer handles */
  mimeTypes?: string[]
  /** Priority (higher = preferred) */
  priority?: number
  /** The Vue component to render */
  component: Component
  /** Check if this viewer can handle the content */
  canHandle?: (content: string, extension: string) => boolean
}

/**
 * XMI file metadata parsed from content
 */
export interface XmiFileInfo {
  /** Name extracted from content or filename */
  name: string
  /** Root element type */
  rootElement: string
  /** Approximate element count */
  elementCount: number
  /** File size in bytes */
  fileSize: number
  /** Namespace URIs found */
  namespaces: string[]
  /** Is this a workspace file? */
  isWorkspace: boolean
}

/**
 * Syntax highlighting theme colors
 */
export interface XmlSyntaxTheme {
  /** XML declaration color */
  declaration: string
  /** Comment color */
  comment: string
  /** Tag name color */
  tag: string
  /** Bracket color */
  bracket: string
  /** Attribute name color */
  attrName: string
  /** Attribute value color */
  attrValue: string
  /** Namespace prefix color */
  namespace: string
  /** Namespace URI color */
  nsValue: string
  /** xsi:type attribute color */
  xsiType: string
  /** Type value color */
  typeValue: string
  /** Truncation indicator color */
  truncated: string
  /** Background color */
  background: string
  /** Foreground/text color */
  foreground: string
  /** Header background */
  headerBackground: string
  /** Header text */
  headerText: string
}
