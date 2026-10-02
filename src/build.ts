import { mkdir, mkdtemp, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { brandingSchema } from './config.js';
import { reportSchema } from './report.js';
import { validateCapture } from './capture.js';
import { publishReport } from './artifacts.js';
import type { Branding, RunReport } from './types.js';

export interface BuildOptions {
  output?: string;
  pdf?: boolean;
  branding?: Branding;
}
const buildOptionsSchema = z
  .object({
    output: z.string().min(1).optional(),
    pdf: z.boolean().optional(),
    branding: brandingSchema.optional(),
  })
  .strict();
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export async function build(sourceDirectory: string, input: BuildOptions = {}) {
  const options = buildOptionsSchema.parse(input);
  const source = await realpath(resolve(sourceDirectory));
  const reportBytes = await readFile(join(source, 'report.json'));
  const report = reportSchema.parse(JSON.parse(reportBytes.toString('utf8'))) as RunReport;
  if (
    report.status !== 'passed' ||
    report.exportError ||
    report.chapters.some(
      (c) =>
        c.status !== 'passed' ||
        c.error ||
        !c.captures.length ||
        c.steps.some((s) => s.status !== 'passed' || s.error),
    )
  )
    throw new Error('Cannot rebuild unsuccessful execution evidence');
  const output = resolve(options.output ?? join(dirname(source), 'rebuilt'));
  if (output === source) throw new Error('Build output must differ from the source run');
  await mkdir(output, { recursive: true });
  if ((await realpath(output)) === source)
    throw new Error('Build output must differ from the source run');
  const staging = await mkdtemp(join(output, '.build-'));
  const ids = new Set<string>(),
    paths = new Set<string>();
  async function readArtifact(path: string) {
    const actual = await realpath(join(source, path));
    const rel = relative(source, actual);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new Error(`Artifact escapes the source run: ${path}`);
    return readFile(actual);
  }
  try {
    await mkdir(join(staging, 'screenshots'));
    for (const chapter of report.chapters)
      for (const capture of chapter.captures) {
        if (
          ids.has(capture.id) ||
          paths.has(capture.image) ||
          paths.has(capture.raw) ||
          capture.image === capture.raw
        )
          throw new Error('Evidence contains duplicate screenshot IDs or paths');
        ids.add(capture.id);
        paths.add(capture.image);
        paths.add(capture.raw);
        validateCapture({
          title: capture.title,
          marks: capture.marks.map(({ bounds: _bounds, ...mark }) => mark),
        });
        for (const [path, expectedHash] of [
          [capture.image, capture.sha256],
          [capture.raw, capture.rawSha256],
        ] as const) {
          const bytes = await readArtifact(path);
          if (expectedHash && sha256(bytes) !== expectedHash)
            throw new Error(`Screenshot hash mismatch: ${path}`);
          const meta = await sharp(bytes).metadata();
          if (
            meta.format !== 'png' ||
            meta.width !== capture.width ||
            meta.height !== capture.height
          )
            throw new Error(`Screenshot dimensions or format mismatch: ${path}`);
          await writeFile(join(staging, path), bytes);
        }
        for (const m of capture.marks)
          if (
            m.bounds.x + m.bounds.width > capture.width + 1 ||
            m.bounds.y + m.bounds.height > capture.height + 1 ||
            (m.from && (m.from.x >= capture.width || m.from.y >= capture.height))
          )
            throw new Error('Annotation lies outside the evidence screenshot');
        const overlay = `screenshots/${capture.id}.overlay.svg`;
        const bytes = await readArtifact(overlay).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        });
        if (bytes) await writeFile(join(staging, overlay), bytes);
      }
    report.rebuiltAt = new Date().toISOString();
    report.sourceReportSha256 = sha256(reportBytes);
    if (options.branding) report.branding = { ...report.branding, ...options.branding };
    return await publishReport(report, staging, output, options.pdf ?? true);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
