/**
 * The context class as OCL writes it.
 *
 * C-OCL names a class with dots (`university.Student`) or as a URI
 * (`nsURI#//Student`). OCL separates packages with `::` - `context
 * university.Student` does not parse, the language server cannot tell the type
 * of `self`, and `self.` suggested nothing of the class.
 */
export function oclContextName(contextClass: string | null | undefined): string {
  if (!contextClass) return ''
  const hashIdx = contextClass.indexOf('#//')
  if (hashIdx >= 0) return contextClass.substring(hashIdx + 3)
  return contextClass.split('.').filter(Boolean).join('::')
}
