/**
 * Collects the file views and hands them to the registry.
 *
 * Every view registers itself under `gene.editor.art`; this takes all of them.
 * Cardinality 0..n, which is what makes it a collection and not a lookup: a
 * plugin appearing or going away changes the set while this object keeps
 * running, and nobody has to maintain a list of what exists.
 *
 * It is a setter rather than a field so the change reaches the registry at the
 * moment it happens - the loader assigns on every registry event, and the
 * assignment is the notification.
 */
import { component, activate, deactivate, injectAll } from '@eclipse-daanse/tsm'
import { EDITOR_ART, type EditorArt } from 'gene-contracts'
import { editorArtenAusDiensten, setEditorArtenAusDiensten } from './editorRegistry'

@component()
export class EditorArtCollector {
  @injectAll(EDITOR_ART)
  get arts(): EditorArt[] {
    return editorArtenAusDiensten()
  }

  set arts(found: EditorArt[]) {
    setEditorArtenAusDiensten(found)
  }

  /**
   * Nothing to do on start - but without an activate method the component is
   * built only when somebody resolves it, and nobody resolves a collector.
   */
  @activate()
  start(): void {}

  @deactivate()
  stop(): void {
    setEditorArtenAusDiensten([])
  }
}
