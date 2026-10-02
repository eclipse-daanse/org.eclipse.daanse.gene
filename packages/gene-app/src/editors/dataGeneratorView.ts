/**
 * The data generator as a view on a `.datagen` file.
 *
 * No `open` yet: the generator still comes up through its own plugin, and
 * declaring a view it cannot carry out would be worse than declaring none.
 */
import { component } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt } from 'gene-contracts'

@component({ service: [EDITOR_ART] })
export class DataGeneratorView implements EditorArt {
  readonly id = 'datagen'
  readonly name = 'Daten erzeugen'
  readonly icon = 'pi pi-bolt'
  readonly extensions = ['.datagen']
  readonly replacesPerspective = 'data-generator'
}
