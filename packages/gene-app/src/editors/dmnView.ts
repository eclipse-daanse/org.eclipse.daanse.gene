/**
 * The DMN decision table editor as a view on a `.dmn` file.
 *
 * The reference to the DMN editor plugin is mandatory: no plugin, no view.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

const DMN_EDITOR = serviceId<unknown>('ui.dmn-editor.components')

@component({ service: [EDITOR_ART] })
export class DmnView implements EditorArt {
  readonly id = 'dmn'
  readonly name = 'DMN-Entscheidungstabelle'
  readonly icon = 'pi pi-table'
  readonly extensions = ['.dmn']
  readonly replacesPerspective = 'dmn-editor'

  @bind(DMN_EDITOR)
  setPlugin(): void {}

  @unbind(DMN_EDITOR)
  unsetPlugin(): void {}

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.loadDmnFile(file, content)
  }
}
