/**
 * The eorm mapping view.
 *
 * It is the case the whole registry exists for: the same file opens as this
 * view or as an ordinary instance tree, and "Open with" offers both.
 *
 * The opener is a dynamic reference. The wizard is a plugin that may load after
 * this view has been declared, and may be undeployed while it is still
 * declared - so the view stays and is handed the change, rather than being
 * rebuilt around it.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt } from 'gene-contracts'

/** What the eorm wizard registers to say "I can open my mapping" */
const EORM_OPEN = serviceId<() => void>('ui.eorm-wizard.open')

@component({ service: [EDITOR_ART] })
export class EormView implements EditorArt {
  readonly id = 'eorm'
  readonly name = 'eorm-Mapping'
  readonly icon = 'pi pi-table'
  readonly extensions: string[] = []
  readonly nsURIs = ['https://eclipse.org/fennec/persistence/eorm/1.0.0']
  readonly replacesPerspective = 'eorm-mapping'

  private opener?: () => void

  @bind(EORM_OPEN, { optional: true })
  setOpener(opener: () => void): void {
    this.opener = opener
  }

  @unbind(EORM_OPEN)
  unsetOpener(): void {
    this.opener = undefined
  }

  open(): void {
    this.opener?.()
  }
}
