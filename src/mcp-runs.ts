import { readFile, realpath, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { reportSchema } from './report.js';
import type { RunReport, RunResult, Capture } from './types.js';

export const runIdSchema = z
  .string()
  .regex(/^(?:run|build)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/)
  .describe(
    'Directory basename returned as runId; only runs under the configured output are allowed.',
  );
export class McpToolError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint: string,
    public retryable = false,
  ) {
    super(message);
  }
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function artifactPath(directory: string, path: string, maxBytes: number) {
  const root = await realpath(directory),
    actual = await realpath(join(root, path)),
    rel = relative(root, actual);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new McpToolError(
      'UNSAFE_PATH',
      'Artifact resolves outside its run directory.',
      'Use an original managed run without escaping symlinks.',
    );
  const info = await stat(actual);
  if (!info.isFile() || info.size > maxBytes)
    throw new McpToolError(
      'ARTIFACT_TOO_LARGE',
      'Artifact is not a regular file or exceeds the tool size limit.',
      'Use local artifact tools for large files or create smaller focused captures.',
    );
  return actual;
}
export async function readRunArtifact(directory: string, path: string, maxBytes = 2 * 1024 * 1024) {
  return readFile(await artifactPath(directory, path, maxBytes));
}
export async function loadManagedRun(output: string, runId: string): Promise<RunResult> {
  runIdSchema.parse(runId);
  const root = await realpath(output),
    directory = await realpath(join(root, runId));
  if (dirname(directory) !== root || basename(directory) !== runId)
    throw new McpToolError(
      'UNSAFE_PATH',
      'Run resolves outside its managed location.',
      'Select a runId returned by hooserguide_status.',
    );
  const report = reportSchema.parse(
    JSON.parse((await readRunArtifact(directory, 'report.json')).toString('utf8')),
  ) as RunReport;
  const artifacts: RunResult['artifacts'] = { report: join(directory, 'report.json') };
  if (report.status === 'passed' && !report.exportError) {
    for (const [kind, name] of [
      ['html', 'index.html'],
      ['markdown', 'handbook.md'],
      ['pdf', 'handbook.pdf'],
    ] as const) {
      try {
        await artifactPath(directory, name, 64 * 1024 * 1024);
        artifacts[kind] = join(directory, name);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || kind !== 'pdf') throw e;
      }
    }
  }
  return { report, directory, artifacts };
}
export async function managedRunIds(output: string) {
  try {
    return (await readdir(output, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && runIdSchema.safeParse(d.name).success)
      .map((d) => d.name)
      .sort((a, b) => b.replace(/^(run|build)-/, '').localeCompare(a.replace(/^(run|build)-/, '')));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}
export function summarizeRun(result: RunResult) {
  const r = result.report;
  return {
    runId: basename(result.directory),
    status: r.status,
    directory: result.directory,
    artifacts: result.artifacts,
    generatedAt: r.generatedAt,
    rebuiltAt: r.rebuiltAt,
    sourceReportSha256: r.sourceReportSha256,
    profile: r.profile,
    viewport: r.viewport,
    exportError: r.exportError,
    chapters: r.chapters.map((c, i) => ({
      chapter: i + 1,
      title: c.title,
      status: c.status,
      captures: c.captures.length,
      error: c.error,
    })),
  };
}
export async function verifiedCapture(
  result: RunResult,
  capture: Capture,
  variant: 'annotated' | 'raw',
) {
  const path = variant === 'raw' ? capture.raw : capture.image;
  const bytes = await readRunArtifact(result.directory, path, 8 * 1024 * 1024);
  const expected = variant === 'raw' ? capture.rawSha256 : capture.sha256;
  if (expected && digest(bytes) !== expected)
    throw new McpToolError(
      'HASH_MISMATCH',
      'Screenshot differs from its execution report.',
      'Regenerate the guide or restore the original evidence; do not review this image as verified.',
    );
  const meta = await sharp(bytes).metadata();
  if (meta.format !== 'png' || meta.width !== capture.width || meta.height !== capture.height)
    throw new McpToolError(
      'INVALID_ARTIFACT',
      'Screenshot dimensions or format differ from the report.',
      'Use original evidence or regenerate the guide.',
    );
  return {
    bytes,
    hashVerified: Boolean(expected),
    sha256: digest(bytes),
    path: join(result.directory, path),
  };
}
