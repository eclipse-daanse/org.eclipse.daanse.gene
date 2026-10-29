/**
 * The CWM editor as a view on an `.xmi` or `.xml` file - the documentation part.
 *
 * Reached through "Open with": the instance tree stays the default for an
 * XMI. The tab holds an instance document like any other; its toolbar is
 * the CWM editor's own (menu "cwm-editor").
 */
import { component } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

@component({ service: [EDITOR_ART] })
export class CwmView implements EditorArt {
  readonly id = 'cwm'
  readonly name = 'CWM-Dokumentation'
  readonly icon = 'pi pi-book'
  readonly extensions = ['.xmi', '.xml']
  readonly priority = -5
  readonly replacesPerspective = 'cwm-editor'

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.openCwmEditor(file, content)
  }
}
