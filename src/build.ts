import { mkdir, mkdtemp, writeFile, realpath, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { brandingSchema, documentSchema, manualSchema } from './config.js';
import { reportSchema, requireSuccessfulEvidence } from './report.js';
import { readRunArtifact, verifiedCapture } from './evidence.js';
import { publishReport } from './artifacts.js';
import type { Branding, DocumentMetadata, ManualOptions, RunReport } from './types.js';

export interface BuildOptions {
  output?: string;
  pdf?: boolean;
  branding?: Branding;
  document?: DocumentMetadata;
  manual?: ManualOptions;
}
const buildOptionsSchema = z
  .object({
    output: z.string().min(1).optional(),
    pdf: z.boolean().optional(),
    branding: brandingSchema.optional(),
    document: documentSchema.optional(),
    manual: manualSchema.optional(),
  })
  .strict();
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export async function build(
  sourceDirectory: string,
  input: BuildOptions = {},
  controls: { signal?: AbortSignal } = {},
) {
  if (controls.signal?.aborted) throw new Error('Build cancelled');
  const options = buildOptionsSchema.parse(input);
  const source = await realpath(resolve(sourceDirectory));
  const reportBytes = await readRunArtifact(source, 'report.json');
  const report = reportSchema.parse(JSON.parse(reportBytes.toString('utf8'))) as RunReport;
  requireSuccessfulEvidence(report);
  const output = resolve(options.output ?? join(dirname(source), 'rebuilt'));
  if (output === source) throw new Error('Build output must differ from the source run');
  await mkdir(output, { recursive: true });
  if ((await realpath(output)) === source)
    throw new Error('Build output must differ from the source run');
  const staging = await mkdtemp(join(output, '.build-'));
  try {
    await mkdir(join(staging, 'screenshots'));
    for (const chapter of report.chapters)
      for (const capture of chapter.captures) {
        if (controls.signal?.aborted) throw new Error('Build cancelled');
        for (const variant of ['annotated', 'raw'] as const) {
          const shot = await verifiedCapture(
            { report, directory: source, artifacts: { report: join(source, 'report.json') } },
            capture,
            variant,
            64 * 1024 * 1024,
          );
          await writeFile(
            join(staging, variant === 'raw' ? capture.raw : capture.image),
            shot.bytes,
          );
        }
        const overlay = `screenshots/${capture.id}.overlay.svg`;
        const bytes = await readRunArtifact(source, overlay, 64 * 1024 * 1024).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        });
        if (bytes) await writeFile(join(staging, overlay), bytes);
      }
    report.rebuiltAt = new Date().toISOString();
    report.sourceReportSha256 = sha256(reportBytes);
    if (options.document) report.document = { ...report.document, ...options.document };
    if (options.manual) report.manual = { ...report.manual, ...options.manual };
    if (options.branding) report.branding = { ...report.branding, ...options.branding };
    return await publishReport(report, staging, output, options.pdf ?? true, controls.signal);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
