/**
 * The C-OCL constraint editor as a view on a constraints file.
 */
import { component } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

@component({ service: [EDITOR_ART] })
export class ConstraintsView implements EditorArt {
  readonly id = 'cocl'
  readonly name = 'Constraints'
  readonly icon = 'pi pi-check-square'
  readonly extensions = ['.c-ocl', '.cocl']
  readonly replacesPerspective = 'cocl-editor'

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.loadCoclFile(file, content)
  }
}
