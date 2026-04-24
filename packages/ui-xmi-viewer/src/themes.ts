/**
 * XML Syntax Highlighting Themes
 *
 * VS Code-inspired themes for XMI/XML syntax highlighting.
 */

import type { XmlSyntaxTheme } from './types'

/**
 * Dark theme (VS Code Dark+)
 */
export const darkTheme: XmlSyntaxTheme = {
  declaration: '#808080',
  comment: '#6a9955',
  tag: '#569cd6',
  bracket: '#808080',
  attrName: '#9cdcfe',
  attrValue: '#ce9178',
  namespace: '#c586c0',
  nsValue: '#4ec9b0',
  xsiType: '#dcdcaa',
  typeValue: '#4ec9b0',
  truncated: '#6a9955',
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  headerBackground: '#2d2d2d',
  headerText: '#858585'
}

/**
 * Light theme (VS Code Light+)
 */
export const lightTheme: XmlSyntaxTheme = {
  declaration: '#808080',
  comment: '#008000',
  tag: '#800000',
  bracket: '#808080',
  attrName: '#ff0000',
  attrValue: '#0000ff',
  namespace: '#800080',
  nsValue: '#267f99',
  xsiType: '#795e26',
  typeValue: '#267f99',
  truncated: '#008000',
  background: '#ffffff',
  foreground: '#000000',
  headerBackground: '#f3f3f3',
  headerText: '#616161'
}

/**
 * Get theme by name
 */
export function getTheme(isDark: boolean): XmlSyntaxTheme {
  return isDark ? darkTheme : lightTheme
}
