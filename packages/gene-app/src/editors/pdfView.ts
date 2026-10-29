/**
 * The PDF viewer as a view on a `.pdf` file - the default for PDFs, so a
 * click on the file opens it. The reference to the PDF viewer plugin is
 * mandatory: no plugin, no view.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'
import { getWorkspaceActions } from '../services/WorkspaceActionService'

const PDF_VIEWER = serviceId<unknown>('ui.pdf-viewer.components')

@component({ service: [EDITOR_ART] })
export class PdfView implements EditorArt {
  readonly id = 'pdf'
  readonly name = 'PDF-Viewer'
  readonly icon = 'pi pi-file-pdf'
  readonly extensions = ['.pdf']

  @bind(PDF_VIEWER)
  setPlugin(): void {}

  @unbind(PDF_VIEWER)
  unsetPlugin(): void {}

  open(file: OpenableFile): Promise<void> | void {
    return getWorkspaceActions()?.openPdfFile(file)
  }
}
