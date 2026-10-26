/**
 * Constraint files that belong to a workspace: the `.c-ocl` files beside it.
 *
 * A workspace file lists models and instances but no constraint files, so a
 * reference filter like "only courses of the student's own university" lay
 * next to the workspace and was never loaded - unless somebody opened it by
 * hand. Now every constraint file in the workspace's own folder comes along
 * when the workspace opens. Only that folder: a workspace at the root of a
 * source must not pull in every constraint file below it.
 */

/** What is needed of an explorer entry */
export interface FileLike {
  name: string
  path: string
  isDirectory?: boolean
  children?: FileLike[]
}

const CONSTRAINT_EXTENSIONS = ['.c-ocl', '.cocl']

function isConstraintFile(entry: FileLike): boolean {
  const name = entry.name.toLowerCase()
  return !entry.isDirectory && CONSTRAINT_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** The folder a path lies in; '' for the root of the source */
function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}

/** The entries directly in a folder of a source tree */
function entriesIn(tree: FileLike[], folder: string): FileLike[] {
  if (!folder) return tree
  for (const entry of tree) {
    if (!entry.isDirectory) continue
    if (entry.path === folder) return entry.children ?? []
    if (folder.startsWith(entry.path + '/')) return entriesIn(entry.children ?? [], folder)
  }
  return []
}

/** The constraint files beside a workspace file, sorted by name */
export function constraintFilesBeside<T extends FileLike>(workspacePath: string, tree: T[]): T[] {
  return (entriesIn(tree, folderOf(workspacePath)) as T[])
    .filter(isConstraintFile)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface ConstraintLoading<T extends FileLike> {
  read(entry: T): Promise<string | null | undefined>
  load(content: string, path: string): Promise<boolean>
}

/** Loads the constraint files beside a workspace; returns the paths that loaded */
export async function loadConstraintFilesBeside<T extends FileLike>(
  workspacePath: string,
  tree: T[],
  io: ConstraintLoading<T>,
): Promise<string[]> {
  const loaded: string[] = []
  for (const entry of constraintFilesBeside(workspacePath, tree)) {
    try {
      const content = await io.read(entry)
      if (content && (await io.load(content, entry.path))) loaded.push(entry.path)
    } catch (e) {
      console.warn('[Workspace] Constraint file could not be loaded:', entry.path, e)
    }
  }
  return loaded
}
