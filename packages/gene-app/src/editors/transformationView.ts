/**
 * The transformation editor as a view on a `.qvtr`/`.qvto` file.
 *
 * The reference to the transformation plugin is mandatory: no plugin, no view.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

const TRANSFORMATION = serviceId<unknown>('ui.transformation.components')

@component({ service: [EDITOR_ART] })
export class TransformationView implements EditorArt {
  readonly id = 'transformation'
  readonly name = 'Transformation'
  readonly icon = 'pi pi-arrows-h'
  readonly extensions = ['.qvtr', '.qvto']
  readonly replacesPerspective = 'transformation'

  @bind(TRANSFORMATION)
  setPlugin(): void {}

  @unbind(TRANSFORMATION)
  unsetPlugin(): void {}

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.loadTransformation(file, content)
  }
}
