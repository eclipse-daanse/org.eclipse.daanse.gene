/**
 * The metamodel editor as a view on an `.ecore` file.
 */
import { component } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type EditorArtPanels, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

@component({ service: [EDITOR_ART] })
export class MetamodelView implements EditorArt {
  readonly id = 'metamodel'
  readonly name = 'Metamodell-Editor'
  readonly icon = 'pi pi-sitemap'
  readonly extensions = ['.ecore']
  readonly priority = 10
  readonly replacesPerspective = 'metamodeler'

  readonly panels: EditorArtPanels = { tree: 'metamodeler-tree', secondary: ['model-browser'], bottom: ['ocl-problems'] }

  open(file: OpenableFile, content: string): Promise<void> | void {
    return getWorkspaceActions()?.openMetamodelInEditor(file, content)
  }
}
