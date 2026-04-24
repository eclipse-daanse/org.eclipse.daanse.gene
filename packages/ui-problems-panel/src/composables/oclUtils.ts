/**
 * OCL Utility Functions
 *
 * Centralized OCL annotation source detection and constants.
 */

/** Primary OCL delegate URI (Fennec standard) */
export const OCL_DELEGATE_URI = 'http://www.eclipse.org/fennec/m2x/ocl/1.0'

/** All recognized OCL annotation source URIs */
export const OCL_ANNOTATION_SOURCES = [
  OCL_DELEGATE_URI,
  'http://www.eclipse.org/emf/2002/Ecore/OCL',
  'http://www.eclipse.org/OCL/Pivot'
] as const

/**
 * Check if an annotation source is an OCL source
 */
export function isOclAnnotationSource(source: string | null | undefined): boolean {
  return !!source && (OCL_ANNOTATION_SOURCES as readonly string[]).includes(source)
}
