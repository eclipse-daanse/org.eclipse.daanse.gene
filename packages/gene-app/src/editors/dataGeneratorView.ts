/**
 * The data generator as a view on a `.datagen` file.
 *
 * Opening goes through the loader the data generator plugin registers; the
 * reference is mandatory, so the view is there exactly while the plugin is.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt, type OpenableFile } from 'gene-contracts'

interface DatagenLoader {
  load(content: string, filePath: string): void
}

const DATAGEN_LOADER = serviceId<DatagenLoader>('gene.datagen.loader')

@component({ service: [EDITOR_ART] })
export class DataGeneratorView implements EditorArt {
  readonly id = 'datagen'
  readonly name = 'Daten erzeugen'
  readonly icon = 'pi pi-bolt'
  readonly extensions = ['.datagen']
  readonly replacesPerspective = 'data-generator'

  private loader?: DatagenLoader

  @bind(DATAGEN_LOADER)
  setLoader(loader: DatagenLoader): void {
    this.loader = loader
  }

  @unbind(DATAGEN_LOADER)
  unsetLoader(): void {
    this.loader = undefined
  }

  open(file: OpenableFile, content: string): void {
    this.loader?.load(content, file.path)
  }
}
