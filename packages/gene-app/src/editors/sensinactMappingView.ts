/**
 * The SensiNact mapping view, opened by the wizard that owns it.
 */
import { component, bind, unbind, serviceId } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt } from 'gene-contracts'

/** What the SensiNact wizard registers to say "I can open my mapping" */
const SENSINACT_OPEN = serviceId<() => void>('ui.sensinact-wizard.open')

@component({ service: [EDITOR_ART] })
export class SensinactMappingView implements EditorArt {
  readonly id = 'sensinact-mapping'
  readonly name = 'SensiNact-Mapping'
  readonly icon = 'pi pi-share-alt'
  readonly extensions: string[] = []
  readonly nsURIs = ['https://fennec.eclipse.org/event.atlas/mapping/1.0']
  readonly replacesPerspective = 'sensinact-mapping'

  private opener?: () => void

  @bind(SENSINACT_OPEN, { optional: true })
  setOpener(opener: () => void): void {
    this.opener = opener
  }

  @unbind(SENSINACT_OPEN)
  unsetOpener(): void {
    this.opener = undefined
  }

  open(): void {
    this.opener?.()
  }
}
