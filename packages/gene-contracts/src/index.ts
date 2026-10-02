/**
 * Contracts shared between gene modules.
 *
 * Nothing here has behaviour: a `serviceId` is the string it was given, and the
 * interfaces are gone after compilation. That is what lets every module import
 * this without importing any of the others - which is the whole point of having
 * it outside all of them.
 */
export { EDITOR_ART, type EditorArt, type EditorArtPanels, type OpenableFile } from './editorArt'
