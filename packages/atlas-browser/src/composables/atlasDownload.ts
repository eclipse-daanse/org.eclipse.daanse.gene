/**
 * A download from the Atlas: what is to be saved, and the dialog's state.
 *
 * The tree and the detail panel both offer "Download"; one dialog serves both.
 * It is mounted once, in the tree, and opened through this shared state.
 */
import { shallowRef } from 'tsm:vue'

export interface AtlasDownloadRequest {
  /** The file's content as the Atlas delivered it */
  content: string
  /** Suggested file name */
  filename: string
}

const request = shallowRef<AtlasDownloadRequest | null>(null)

export function useAtlasDownload() {
  return {
    request,
    open(next: AtlasDownloadRequest): void {
      request.value = next
    },
    close(): void {
      request.value = null
    },
  }
}
