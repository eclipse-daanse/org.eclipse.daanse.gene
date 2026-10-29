/**
 * The Markdown viewer as a view on an `.md` file - the default for Markdown,
 * so a click on the file shows it rendered. The reference to the Markdown
 * viewer plugin is mandatory: no plugin, no view.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

const MD_VIEWER = serviceId<unknown>('ui.md-viewer.components')

@component({ service: [EDITOR_ART] })
export class MdView implements EditorArt {
  readonly id = 'md'
  readonly name = 'Markdown-Ansicht'
  readonly icon = 'pi pi-file-edit'
  readonly extensions = ['.md', '.markdown']

  @bind(MD_VIEWER)
  setPlugin(): void {}

  @unbind(MD_VIEWER)
  unsetPlugin(): void {}

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.openMdFile(file, content)
  }
}
