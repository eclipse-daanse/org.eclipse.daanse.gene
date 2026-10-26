/**
 * "Editor wird geladen" - the state behind the central loading overlay while
 * a file opens in an editor.
 *
 * Parsing, validating and drawing block the page for a moment. The overlay
 * gets two frames to show before the work starts and stays until the tab has
 * drawn. Calls may nest (a file that loads what it references): the overlay
 * stays up until the outermost one is done, and goes away on errors too.
 */
import { ref, nextTick, type Ref } from 'tsm:vue'

export interface EditorLoading {
  /** Whether an editor is being opened */
  active: Ref<boolean>
  /** The file being opened, for the overlay */
  name: Ref<string>
  /** Runs the work with the overlay up */
  run<T>(name: string | undefined, work: () => Promise<T>): Promise<T>
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

export function createEditorLoading(frame: () => Promise<void> = nextFrame): EditorLoading {
  const active = ref(false)
  const name = ref('')
  let running = 0

  async function run<T>(fileName: string | undefined, work: () => Promise<T>): Promise<T> {
    running++
    name.value = fileName ?? ''
    active.value = true
    try {
      await frame()
      await frame()
      const result = await work()
      await nextTick()
      await frame()
      return result
    } finally {
      running--
      if (running === 0) active.value = false
    }
  }

  return { active, name, run }
}
