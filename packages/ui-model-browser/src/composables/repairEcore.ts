/**
 * Repair legacy .ecore serialization where intra-document cross-references were
 * written as ABSOLUTE nsURI hrefs (e.g. href="http://…/base#//Thing") instead of
 * intra-document fragments (href="#//base/Thing"). Such files were produced by
 * older versions (pre cross-subpackage fragment fix) and crash on load in EMF's
 * forward-reference resolution (`getESuperTypes is not a function`).
 *
 * This lives with the model loader (loadEcoreFile) rather than any single editor
 * plugin, since the same legacy files break every .ecore load path.
 *
 * The repair is a pure string transform keyed on the ROOT package nsURI:
 * any attribute value of the form `<rootNsURI>[/<sub>]#//<fragment>` is rewritten
 * to `#//[<sub>/]<fragment>`. Package nsURI declarations (nsURI="…") are left
 * untouched (they have `"` after the URI, not `#//`), and external references
 * (e.g. Ecore datatypes at eclipse.org) are untouched (different nsURI).
 */
export function repairLegacyEcoreHrefs(content: string): string {
  const rootMatch = content.match(/<ecore:EPackage[^>]*\bnsURI="([^"]+)"/)
  if (!rootMatch) return content
  const root = rootMatch[1]
  const esc = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // `<root>/<sub…>#//` → `#//<sub…>/`   (cross-subpackage self-refs)
  let out = content.replace(new RegExp(esc + '/([^"#\\s]*)#//', 'g'), '#//$1/')
  // `<root>#//` → `#//`                 (root-level self-refs)
  out = out.replace(new RegExp(esc + '#//', 'g'), '#//')
  // Same-document typed refs no longer need the `ecore:EClass ` type prefix.
  out = out.replace(/="ecore:EClass #\/\//g, '="#//')

  return out
}

/**
 * True if the content contains absolute self-nsURI hrefs that would crash the
 * loader — i.e. the file needs repair before it can be loaded.
 */
export function needsLegacyHrefRepair(content: string): boolean {
  const rootMatch = content.match(/<ecore:EPackage[^>]*\bnsURI="([^"]+)"/)
  if (!rootMatch) return false
  const root = rootMatch[1]
  const esc = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(esc + '(/[^"#\\s]*)?#//').test(content)
}