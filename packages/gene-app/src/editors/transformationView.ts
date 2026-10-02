/**
 * The transformation editor as a view on a QVT file.
 */
import { component } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

@component({ service: [EDITOR_ART] })
export class TransformationView implements EditorArt {
  readonly id = 'transformation'
  readonly name = 'Transformation'
  readonly icon = 'pi pi-arrows-h'
  readonly extensions = ['.qvtr', '.qvto']
  readonly replacesPerspective = 'transformation'

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.loadTransformation(file, content)
  }
}
