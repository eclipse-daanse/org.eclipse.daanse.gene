/**
 * The metamodel editor as a view on an `.ecore` file.
 *
 * The editor itself is the metamodeler plugin. The reference to it is
 * mandatory: without the plugin this view is not registered, so "Open with"
 * does not offer an editor that is not there - and it comes back the moment
 * the plugin does.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

/** What the metamodeler plugin registers; opening a model goes through it */
const METAMODELER = serviceId<unknown>('ui.metamodeler.composables')

@component({ service: [EDITOR_ART] })
export class MetamodelView implements EditorArt {
  readonly id = 'metamodel'
  readonly name = 'Metamodell-Editor'
  readonly icon = 'pi pi-sitemap'
  readonly extensions = ['.ecore']
  readonly priority = 10
  readonly replacesPerspective = 'metamodeler'

  @bind(METAMODELER)
  setPlugin(): void {}

  @unbind(METAMODELER)
  unsetPlugin(): void {}

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.openMetamodelInEditor(file, content)
  }
}
