/**
 * The DMN decision table editor as a view on a `.dmn` file.
 */
import { component } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

@component({ service: [EDITOR_ART] })
export class DmnView implements EditorArt {
  readonly id = 'dmn'
  readonly name = 'DMN-Entscheidungstabelle'
  readonly icon = 'pi pi-table'
  readonly extensions = ['.dmn']
  readonly replacesPerspective = 'dmn-editor'

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.loadDmnFile(file, content)
  }
}
