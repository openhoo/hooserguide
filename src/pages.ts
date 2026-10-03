import {
  mkdir,
  mkdtemp,
  writeFile,
  realpath,
  lstat,
  rename,
  rm,
  readFile,
  rmdir,
} from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, join, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { loadRunDirectory, verifiedCapture, readRunArtifact } from './evidence.js';
import { requireSuccessfulEvidence } from './report.js';
import { renderManual } from './render.js';
import { renderPdf } from './pdf.js';
import { bundle } from './bundle.js';

export interface PagesOptions {
  /** A fresh directory inside root; existing files are never removed. */
  output?: string;
  root?: string;
  bundle?: boolean;
}
const optionsSchema = z
  .object({
    output: z.string().min(1).default('public'),
    root: z.string().min(1).optional(),
    bundle: z.boolean().default(true),
  })
  .strict();
export const contained = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/** Allocate only after checking the nearest existing ancestor, including symlinks. */
export async function freshDirectory(root: string, output: string) {
  if (isAbsolute(output))
    throw new Error('Pages output must be a relative directory inside the workspace');
  const destination = resolve(root, output);
  if (destination === root || !contained(root, destination))
    throw new Error('Pages output must be inside the workspace');
  let ancestor = destination;
  for (;;) {
    try {
      await lstat(ancestor);
      const actual = await realpath(ancestor);
      if (!contained(root, actual))
        throw new Error('Pages output ancestor resolves outside the workspace');
      if (ancestor === destination)
        throw new Error('Pages output already exists; choose a fresh directory');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      ancestor = dirname(ancestor);
    }
  }
  await mkdir(dirname(destination), { recursive: true });
  if (!contained(root, await realpath(dirname(destination))))
    throw new Error('Pages output parent resolves outside the workspace');
  await mkdir(destination);
  return destination;
}

/** Regenerate static exports from verified successful evidence; no app execution or unchecked file copying. */
export async function preparePages(
  source: string,
  input: PagesOptions = {},
  controls: { signal?: AbortSignal } = {},
) {
  const options = optionsSchema.parse(input);
  controls.signal?.throwIfAborted();
  const root = await realpath(resolve(options.root ?? process.cwd()));
  const run = await loadRunDirectory(source);
  requireSuccessfulEvidence(run.report);
  const requested = resolve(root, options.output);
  if (contained(run.directory, requested) || contained(requested, run.directory))
    throw new Error('Pages output must be separate from the source evidence');
  const destination = await freshDirectory(root, options.output);
  let staging: string | undefined;
  try {
    staging = await mkdtemp(join(dirname(destination), '.pages-'));
    await mkdir(join(staging, 'screenshots'));
    const report = structuredClone(run.report);
    for (const chapter of report.chapters)
      chapter.source = basename(chapter.source.replaceAll('\\', '/'));
    for (const skipped of report.skippedScenarios ?? [])
      skipped.source = basename(skipped.source.replaceAll('\\', '/'));
    for (const chapter of report.chapters)
      for (const capture of chapter.captures) {
        for (const variant of ['annotated', 'raw'] as const) {
          controls.signal?.throwIfAborted();
          const shot = await verifiedCapture(run, capture, variant, 64 * 1024 * 1024);
          await writeFile(
            join(staging, variant === 'raw' ? capture.raw : capture.image),
            shot.bytes,
          );
        }
      }
    report.rebuiltAt = new Date().toISOString();
    // The hash identifies the original report without copying its machine-specific source paths.
    const original = await readRunArtifact(run.directory, 'report.json');
    report.sourceReportSha256 = createHash('sha256').update(original).digest('hex');
    await writeFile(join(staging, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (run.artifacts.pdf) await renderPdf(report, staging);
    await renderManual(report, staging);
    await writeFile(join(staging, '.nojekyll'), '');
    if (options.bundle) {
      await bundle(staging, join(staging, 'handbook.zip'), controls);
      // A relative download remains valid for project subpaths and custom domains.
      const html = await readFile(join(staging, 'index.html'), 'utf8');
      await writeFile(
        join(staging, 'index.html'),
        html.replace(
          '<a href="handbook.md">',
          '<a href="handbook.zip">ZIP</a><a href="handbook.md">',
        ),
      );
    }
    controls.signal?.throwIfAborted();
    await rename(staging, destination);
    staging = undefined;
    return {
      status: 'passed' as const,
      directory: destination,
      sourceDirectory: run.directory,
      sourceReportSha256: report.sourceReportSha256,
      pdf: Boolean(run.artifacts.pdf),
      bundle: options.bundle,
    };
  } catch (error) {
    if (staging) await rm(staging, { recursive: true, force: true });
    // Remove only the empty reservation created by this invocation.
    await rmdir(destination).catch(() => {});
    throw error;
  }
}
