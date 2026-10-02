/**
 * What a file view is, and what it is called in the service registry.
 *
 * A file does not have *one* view. An eorm mapping opens as an eorm view or as
 * an ordinary instance tree, an `.ecore` as the metamodel editor or as raw XMI.
 * Every view registers itself under {@link EDITOR_ART}; whoever has to pick one
 * collects them all and decides, and so no list of views exists anywhere.
 *
 * The contract lives outside every module on purpose. A view ships with the
 * plugin it belongs to, and the place that collects them must not have to know
 * that plugin - they only share this file.
 */
import { serviceId } from '@eclipse-daanse/tsm'
import type { Component } from 'vue'

/** The little a view needs to know about the file it is handed. */
export interface OpenableFile {
  name: string
  path: string
}

export interface EditorArt {
  /** Short name, e.g. 'metamodel', 'instance', 'eorm' */
  id: string
  /** What the "Open with" menu shows */
  name: string
  icon?: string
  /** Extensions, with the dot: ['.ecore'] */
  extensions: string[]
  /**
   * Metamodels this view is meant for. A match here beats a view that only
   * knows the extension.
   */
  nsURIs?: string[]
  /** Among equally precise candidates the higher number wins. Default 0. */
  priority?: number
  /** The view itself - the contents of the tab. */
  component?: Component
  /** Opens the file in this view. */
  open?: (file: OpenableFile, content: string) => void | Promise<void>
  /**
   * The perspective this view supersedes.
   *
   * It therefore no longer belongs in the activity bar: on the left are the
   * navigators - explorer, model atlas - and what edits a file follows from
   * whichever tab is in front.
   */
  replacesPerspective?: string
}

/**
 * Every file view registers under this id.
 *
 * Cardinality 0..n: a collector takes all of them, and a view appearing or
 * going away changes the set while everything keeps running.
 */
export const EDITOR_ART = serviceId<EditorArt>('gene.editor.art')
