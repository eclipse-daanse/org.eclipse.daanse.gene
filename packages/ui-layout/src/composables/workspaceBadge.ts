/**
 * How the loaded workspace shows in the title bar: its name and a small
 * square with the first letter.
 *
 * The name is the one the workspace file gives itself (`name="uni"`); a
 * workspace without one - or with the default a new configuration gets - is
 * called after its file. The colour comes from the name, so two workspaces
 * look different at a glance and the same one always looks the same.
 */

/** The name a fresh configuration gets before anybody names it */
const DEFAULT_CONFIG_NAME = 'Workspace Configuration'

export interface WorkspaceBadge {
  /** Shown beside the square */
  name: string
  /** The letter in the square */
  initial: string
  /** Background of the square, an HSL colour derived from the name */
  color: string
  /** The workspace file, for the tooltip */
  path: string
}

/** The file name without folder and `.wsp` */
function fileBaseName(path: string): string {
  const file = path.split('/').pop() ?? path
  return file.replace(/\.(wsp|workspace)$/i, '')
}

/** A hue from the name - stable, spread over the colour circle */
function hueOf(name: string): number {
  let hash = 0
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return hash % 360
}

/** The badge of the loaded workspace, or null when none is loaded */
export function workspaceBadge(path: string | null | undefined, configName?: string | null): WorkspaceBadge | null {
  if (!path) return null
  const given = configName?.trim()
  const name = given && given !== DEFAULT_CONFIG_NAME ? given : fileBaseName(path)
  const initial = ([...name.trim()][0] ?? '?').toUpperCase()
  return { name, initial, color: `hsl(${hueOf(name)} 55% 42%)`, path }
}
