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


  /*
   * Every file gets a tab of its own, so there is nothing to ask: the file
   * opens standalone, with what it references. Merging into the tab in front
   * stays available from the explorer's "Add Instances to Workspace".
   */
  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.loadInstances(file, content, 'STANDALONE')
  }
}
