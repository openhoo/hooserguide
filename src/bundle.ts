import { zip, type AsyncZippable } from 'fflate';
import { mkdir, mkdtemp, open, rm, realpath, writeFile } from 'node:fs/promises';
import { dirname, basename, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { requireSuccessfulEvidence } from './report.js';
import { loadRunSnapshot, readRunArtifact, verifiedCapture } from './evidence.js';
import { renderManual } from './render.js';
import { renderPdf } from './pdf.js';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** Portable allowlisted package: manuals and masked evidence, never config, plugins or auth state. */
export async function bundle(
  source: string,
  destination?: string,
  controls: { signal?: AbortSignal } = {},
) {
  if (controls.signal?.aborted) throw new Error('Bundle cancelled');
  const { run, reportBytes: original } = await loadRunSnapshot(source);
  requireSuccessfulEvidence(run.report);
  const path = resolve(destination ?? `${run.directory}.zip`);
  if (!path.toLowerCase().endsWith('.zip')) throw new Error('Bundle output must end in .zip');
  const staging = await mkdtemp(join(tmpdir(), 'hooserguide-bundle-'));
  try {
    await mkdir(join(staging, 'screenshots'));
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
    for (const chapter of run.report.chapters)
      for (const capture of chapter.captures)
        for (const variant of ['annotated', 'raw'] as const) {
          const shot = await verifiedCapture(run, capture, variant, 64 * 1024 * 1024);
          const name = variant === 'raw' ? capture.raw : capture.image;
          add(name, shot.bytes);
          await writeFile(join(staging, name), shot.bytes);
        }
    const report = structuredClone(run.report);
    for (const chapter of report.chapters)
      chapter.source = basename(chapter.source.replaceAll('\\', '/'));
    for (const skipped of report.skippedScenarios ?? [])
      skipped.source = basename(skipped.source.replaceAll('\\', '/'));
    add('report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
    // Existing manual exports are not hashed execution evidence. Regenerate them
    // from the verified images and portable report before sharing a bundle.
    if (controls.signal?.aborted) throw new Error('Bundle cancelled');
    if (run.artifacts.pdf) await renderPdf(report, staging);
    await renderManual(report, staging);
    for (const name of [
      'index.html',
      'handbook.md',
      ...(run.artifacts.pdf ? ['handbook.pdf', 'pdf-layout.json'] : []),
    ])
      add(name, await readRunArtifact(staging, name, 64 * 1024 * 1024));
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
      await handle.close();
    } catch (error) {
      await handle.close().catch(() => {});
      await rm(path, { force: true });
      throw error;
    }
    return {
      path: await realpath(path),
      bytes: bytes.length,
      sha256: sha256(bytes),
      files: entries.length + 1,
      sourceReportSha256: manifest.sourceReportSha256,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
