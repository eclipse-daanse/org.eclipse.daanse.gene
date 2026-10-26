/**
 * "Validate OCL" for one document: every resource it holds.
 *
 * A document of an instance tab may hold several resources - the file and
 * what it references. All of them are validated; the problems panel opens
 * when something was found.
 */
import type { Resource } from '@emfts/core'

export interface ProblemsLike {
  validateResource(resource: Resource): Promise<void>
  hasErrors?: { value: boolean }
}

export interface EventBusLike {
  emit(event: string, payload?: unknown): void
}

/** Validates the document's resources; returns how many were validated */
export async function validateDocument(
  resources: readonly Resource[],
  problems: ProblemsLike,
  bus?: EventBusLike | null,
): Promise<number> {
  for (const resource of resources) {
    await problems.validateResource(resource)
  }
  if (problems.hasErrors?.value) bus?.emit('show-problems')
  return resources.length
}
