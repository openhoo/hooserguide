import { constants } from 'node:fs';
import { access, lstat, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const entry = (path: string) =>
  lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });

/** Check all planned parents and leaves before creating the first project file. */
export async function preflightScaffold(
  root: string,
  targets: readonly string[],
  conflict = 'Refusing to overwrite ',
) {
  if (!targets.length) return;
  // The caller may explicitly choose a directory through a symlink (including /var on macOS).
  // Below that chosen root, do not follow a scaffold subdirectory into another project.
  let anchor = root;
  while (!(await entry(anchor))) anchor = dirname(anchor);
  if (!(await stat(anchor)).isDirectory())
    throw new Error(`Scaffold parent is not a directory: ${anchor}`);
  const checked = new Map<string, boolean>([[anchor, true]]);
  const writable = (path: string) => access(path, constants.W_OK | constants.X_OK);
  async function directory(path: string): Promise<boolean> {
    const known = checked.get(path);
    if (known !== undefined) return known;
    const parent = dirname(path);
    const parentExists = await directory(parent);
    const existing = await entry(path);
    if (existing && !existing.isDirectory())
      throw new Error(`Expected a scaffold directory at ${path}`);
    if (!existing && parentExists) await writable(parent);
    checked.set(path, !!existing);
    return !!existing;
  }
  for (const name of targets) {
    const path = join(root, name),
      parent = dirname(path);
    const exists = await directory(parent);
    if (await entry(path)) throw new Error(conflict + path);
    if (exists) await writable(parent);
  }
}
