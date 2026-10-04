/**
 * The text editor as a view on an `.xmi`, `.ecore` or `.xml` file.
 *
 * Never the default: the structured views outrank it, this one is reached
 * through "Open with" - for a look at the raw XML, or a fix by hand.
 */
import { component } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

@component({ service: [EDITOR_ART] })
export class XmlView implements EditorArt {
  readonly id = 'xml'
  readonly name = 'XML-Editor'
  readonly icon = 'pi pi-code'
  readonly extensions = ['.xmi', '.ecore', '.xml']
  readonly priority = -10
  readonly replacesPerspective = 'xml-editor'

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.openXmlFile(file, content)
  }
}
