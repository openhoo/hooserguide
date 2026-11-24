import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export function contained(root: string, path: string) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Resolve symlinks before creating any new directory in a possibly missing suffix. */
export async function prospectivePath(path: string) {
  let ancestor = path;
  for (;;) {
    try {
      await lstat(ancestor);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || ancestor === dirname(ancestor))
        throw error;
      ancestor = dirname(ancestor);
    }
  }
  return resolve(await realpath(ancestor), relative(ancestor, path));
}
