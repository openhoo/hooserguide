import { zip, type AsyncZippable } from 'fflate';
import { mkdir, open, rm, realpath } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadRunDirectory, readRunArtifact, verifiedCapture } from './evidence.js';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** Portable allowlisted package: manuals and masked evidence, never config, plugins or auth state. */
export async function bundle(
  source: string,
  destination?: string,
  controls: { signal?: AbortSignal } = {},
) {
  if (controls.signal?.aborted) throw new Error('Bundle cancelled');
  const run = await loadRunDirectory(source);
  if (
    run.report.status !== 'passed' ||
    run.report.exportError ||
    run.report.skippedScenarios?.length ||
    run.report.chapters.some(
      (c) =>
        c.status !== 'passed' ||
        c.error ||
        !c.captures.length ||
        !c.steps.length ||
        c.steps.some((s) => s.status !== 'passed' || s.error),
    )
  )
    throw new Error('Cannot bundle unsuccessful execution evidence');
  const path = resolve(destination ?? `${run.directory}.zip`);
  if (!path.toLowerCase().endsWith('.zip')) throw new Error('Bundle output must end in .zip');
  const files: AsyncZippable = Object.create(null);
  const entries: { path: string; sha256: string; bytes: number }[] = [];
  let total = 0;
  const add = (name: string, bytes: Buffer) => {
    if (controls.signal?.aborted) throw new Error('Bundle cancelled');
    if (Object.hasOwn(files, name)) throw new Error(`Duplicate bundle artifact: ${name}`);
    total += bytes.length;
    if (total > 128 * 1024 * 1024) throw new Error('Bundle evidence exceeds 128 MiB');
    files[name] = [bytes, { mtime: new Date('2020-01-01T00:00:00Z') }];
    entries.push({ path: name, sha256: sha256(bytes), bytes: bytes.length });
  };
  for (const name of ['index.html', 'handbook.md', ...(run.artifacts.pdf ? ['handbook.pdf'] : [])])
    add(name, await readRunArtifact(run.directory, name, 64 * 1024 * 1024));
  for (const chapter of run.report.chapters)
    for (const capture of chapter.captures)
      for (const variant of ['annotated', 'raw'] as const) {
        const shot = await verifiedCapture(run, capture, variant, 64 * 1024 * 1024);
        add(variant === 'raw' ? capture.raw : capture.image, shot.bytes);
      }
  try {
    add('pdf-layout.json', await readRunArtifact(run.directory, 'pdf-layout.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const original = await readRunArtifact(run.directory, 'report.json');
  const report = structuredClone(run.report);
  for (const chapter of report.chapters)
    chapter.source = basename(chapter.source.replaceAll('\\', '/'));
  for (const skipped of report.skippedScenarios ?? [])
    skipped.source = basename(skipped.source.replaceAll('\\', '/'));
  add('report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  const manifest = {
    schemaVersion: 1,
    sourceReportSha256: sha256(original),
    reportSources: 'basenames',
    files: entries,
  };
  files['bundle-manifest.json'] = [
    Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
    { mtime: new Date('2020-01-01T00:00:00Z') },
  ];
  if (controls.signal?.aborted) throw new Error('Bundle cancelled');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    let done = false;
    const abort = () => {
      controls.signal?.removeEventListener('abort', abort);
      terminate();
      reject(new Error('Bundle cancelled'));
    };
    const terminate = zip(files, { level: 6 }, (error, bytes) => {
      done = true;
      controls.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(bytes);
    });
    if (!done) {
      controls.signal?.addEventListener('abort', abort, { once: true });
      if (controls.signal?.aborted) abort();
    }
  });
  if (controls.signal?.aborted) throw new Error('Bundle cancelled');
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(bytes);
    if (controls.signal?.aborted) throw new Error('Bundle cancelled');
  } catch (error) {
    await handle.close();
    await rm(path, { force: true });
    throw error;
  }
  await handle.close();
  return {
    path: await realpath(path),
    bytes: bytes.length,
    sha256: sha256(bytes),
    files: entries.length + 1,
    sourceReportSha256: manifest.sourceReportSha256,
  };
}
