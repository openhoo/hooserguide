import { zip, type AsyncZippable } from 'fflate';
import { mkdir, mkdtemp, open, rm, realpath, writeFile } from 'node:fs/promises';
import { dirname, basename, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { requireSuccessfulEvidence } from './report.js';
import { loadRunSnapshot, readRunArtifact, verifiedCapture } from './evidence.js';
import { renderManual } from './render.js';
import { renderPdf } from './pdf.js';
import type { RunReport, RunResult } from './types.js';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const maxBundleBytes = 128 * 1024 * 1024;

function checkBudget(bytes: number) {
  if (bytes > maxBundleBytes) throw new Error('Bundle evidence exceeds 128 MiB');
}

/** Stage only the verified screenshots and portable source names shared by Pages and ZIP. */
export async function stagePortableEvidence(
  run: RunResult,
  staging: string,
  signal: AbortSignal | undefined,
  forBundle: boolean,
): Promise<RunReport> {
  await mkdir(join(staging, 'screenshots'));
  const report = structuredClone(run.report);
  let total = 0;
  for (const chapter of report.chapters) {
    chapter.source = basename(chapter.source.replaceAll('\\', '/'));
    for (const capture of chapter.captures)
      for (const variant of ['annotated', 'raw'] as const) {
        signal?.throwIfAborted();
        const shot = await verifiedCapture(run, capture, variant, 64 * 1024 * 1024);
        total += shot.bytes.length;
        if (forBundle) checkBudget(total);
        await writeFile(join(staging, variant === 'raw' ? capture.raw : capture.image), shot.bytes);
      }
  }
  for (const skipped of report.skippedScenarios ?? [])
    skipped.source = basename(skipped.source.replaceAll('\\', '/'));
  return report;
}

/** Archive the fresh private staging directory. Never call this on supplied run exports. */
export async function writeStagedArchive(
  staging: string,
  report: RunReport,
  pdf: boolean,
  path: string,
  sourceReportSha256: string,
  signal?: AbortSignal,
) {
  const files: AsyncZippable = Object.create(null);
  const entries: { path: string; sha256: string; bytes: number }[] = [];
  let total = 0;
  const names = [
    ...report.chapters.flatMap((c) => c.captures.flatMap((shot) => [shot.image, shot.raw])),
    'report.json',
    'index.html',
    'handbook.md',
    ...(pdf ? ['handbook.pdf', 'pdf-layout.json'] : []),
  ];
  for (const name of names) {
    signal?.throwIfAborted();
    if (Object.hasOwn(files, name)) throw new Error(`Duplicate bundle artifact: ${name}`);
    const limit = name === 'report.json' || name === 'pdf-layout.json' ? 2 : 64;
    const bytes = await readRunArtifact(staging, name, limit * 1024 * 1024);
    total += bytes.length;
    checkBudget(total);
    files[name] = [bytes, { mtime: new Date('2020-01-01T00:00:00Z') }];
    entries.push({ path: name, sha256: sha256(bytes), bytes: bytes.length });
  }
  const manifest = {
    schemaVersion: 1,
    sourceReportSha256,
    reportSources: 'basenames',
    files: entries,
  };
  files['bundle-manifest.json'] = [
    Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
    { mtime: new Date('2020-01-01T00:00:00Z') },
  ];
  if (signal?.aborted) throw new Error('Bundle cancelled');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    let done = false;
    const abort = () => {
      signal?.removeEventListener('abort', abort);
      terminate();
      reject(new Error('Bundle cancelled'));
    };
    const terminate = zip(files, { level: 6 }, (error, bytes) => {
      done = true;
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(bytes);
    });
    if (!done) {
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    }
  });
  if (signal?.aborted) throw new Error('Bundle cancelled');
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(bytes);
    if (signal?.aborted) throw new Error('Bundle cancelled');
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
}

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
    const report = await stagePortableEvidence(run, staging, controls.signal, true);
    await writeFile(join(staging, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    // Existing manual exports are not hashed execution evidence; always regenerate them.
    controls.signal?.throwIfAborted();
    const pdf = Boolean(run.artifacts.pdf);
    if (pdf) await renderPdf(report, staging);
    await renderManual(report, staging);
    return await writeStagedArchive(staging, report, pdf, path, sha256(original), controls.signal);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
