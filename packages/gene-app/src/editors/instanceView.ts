/**
 * The instance editor as a view on an `.xmi` file.
 */
import { component } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

@component({ service: [EDITOR_ART] })
export class InstanceView implements EditorArt {
  readonly id = 'instance'
  readonly name = 'Instanz-Editor'
  readonly icon = 'pi pi-database'
  readonly extensions = ['.xmi']
  readonly priority = 10
  readonly replacesPerspective = 'model-editor'

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.loadInstances(file, content)
  }
}
