/**
 * Which section of the Model Atlas tab is open: Transitions, Schemas or the
 * Schema Explorer.
 *
 * Shared, so the tree can ask for a section - selecting a schema shows its
 * details - and so the choice survives the tab being rebuilt on a tab switch.
 */
import { ref } from 'tsm:vue'

export type AtlasSection = 'transitions' | 'schemas' | 'explorer'

const activeSection = ref<AtlasSection>('transitions')

export function useAtlasSection() {
  function show(section: AtlasSection): void {
    activeSection.value = section
  }
  return { activeSection, show }
}
