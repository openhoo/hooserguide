import { mkdir, mkdtemp, writeFile, realpath, rename, rm, readFile, rmdir } from 'node:fs/promises';
import { resolve, isAbsolute, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { loadRunSnapshot } from './evidence.js';
import { contained, prospectivePath } from './output-path.js';
export { contained } from './output-path.js';
import { requireSuccessfulEvidence } from './report.js';
import { renderManual } from './render.js';
import { renderPdf } from './pdf.js';
import { stagePortableEvidence, writeStagedArchive } from './bundle.js';

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
/** Allocate only after checking the nearest existing ancestor, including symlinks. */
export async function freshDirectory(root: string, output: string, sourceEvidence?: string) {
  if (isAbsolute(output))
    throw new Error('Pages output must be a relative directory inside the workspace');
  const destination = resolve(root, output);
  if (destination === root || !contained(root, destination))
    throw new Error('Pages output must be inside the workspace');
  const prospective = await prospectivePath(destination);
  if (!contained(root, prospective))
    throw new Error('Pages output ancestor resolves outside the workspace');
  if (
    sourceEvidence &&
    (contained(sourceEvidence, prospective) || contained(prospective, sourceEvidence))
  )
    throw new Error('Pages output must be separate from the source evidence');
  await mkdir(dirname(destination), { recursive: true });
  if (!contained(root, await realpath(dirname(destination))))
    throw new Error('Pages output parent resolves outside the workspace');
  try {
    await mkdir(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error('Pages output already exists; choose a fresh directory');
    throw error;
  }
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
  const { run, reportBytes: original } = await loadRunSnapshot(source);
  requireSuccessfulEvidence(run.report);
  const requested = resolve(root, options.output);
  if (contained(run.directory, requested) || contained(requested, run.directory))
    throw new Error('Pages output must be separate from the source evidence');
  const destination = await freshDirectory(root, options.output, run.directory);
  let staging: string | undefined;
  try {
    const actualDestination = await realpath(destination);
    if (contained(run.directory, actualDestination) || contained(actualDestination, run.directory))
      throw new Error('Pages output must be separate from the source evidence');
    staging = await mkdtemp(join(dirname(destination), '.pages-'));
    const report = await stagePortableEvidence(run, staging, controls.signal, options.bundle);
    report.rebuiltAt = new Date().toISOString();
    // The hash identifies the original report without copying its machine-specific source paths.
    report.sourceReportSha256 = createHash('sha256').update(original).digest('hex');
    await writeFile(join(staging, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (run.artifacts.pdf) await renderPdf(report, staging);
    await renderManual(report, staging);
    await writeFile(join(staging, '.nojekyll'), '');
    if (options.bundle) {
      await writeStagedArchive(
        staging,
        report,
        Boolean(run.artifacts.pdf),
        join(staging, 'handbook.zip'),
        report.sourceReportSha256,
        controls.signal,
      );
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
