/**
 * The C-OCL constraint editor as a view on a constraints file.
 *
 * The reference to the constraint editor plugin is mandatory: no plugin, no view.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

const COCL_EDITOR = serviceId<unknown>('ui.cocl-editor.components')

@component({ service: [EDITOR_ART] })
export class ConstraintsView implements EditorArt {
  readonly id = 'cocl'
  readonly name = 'Constraints'
  readonly icon = 'pi pi-check-square'
  readonly extensions = ['.c-ocl', '.cocl']
  readonly replacesPerspective = 'cocl-editor'

  @bind(COCL_EDITOR)
  setPlugin(): void {}

  @unbind(COCL_EDITOR)
  unsetPlugin(): void {}

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.loadCoclFile(file, content)
  }
}
