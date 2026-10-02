import { z } from 'zod';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { loadRunDirectory, verifiedCapture, GuideError } from './evidence.js';
import type { Chapter, Capture, RunResult } from './types.js';

export const comparisonSchema = z
  .object({
    beforeStatus: z.enum(['passed', 'failed']),
    afterStatus: z.enum(['passed', 'failed']),
    metadataChanged: z.boolean(),
    chapters: z.array(
      z
        .object({
          feature: z.string(),
          title: z.string(),
          change: z.enum(['added', 'removed', 'changed', 'unchanged']),
          instructionsChanged: z.boolean(),
          captures: z.array(
            z
              .object({
                title: z.string(),
                change: z.enum(['added', 'removed', 'changed', 'unchanged']),
                pixelsChanged: z.boolean().optional(),
                annotationsChanged: z.boolean().optional(),
                rawHashesAvailable: z.boolean().optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    totals: z
      .object({
        added: z.number().int(),
        removed: z.number().int(),
        changed: z.number().int(),
        unchanged: z.number().int(),
      })
      .strict(),
  })
  .strict();

function unique<T>(items: T[], key: (item: T) => string, kind: string) {
  const map = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (map.has(id))
      throw new Error(`Ambiguous ${kind}: ${id}. Use unique titles to compare runs.`);
    map.set(id, item);
  }
  return map;
}
const prose = (c?: Chapter) =>
  c && JSON.stringify([c.description, c.instructions, c.prerequisites ?? [], c.callouts ?? []]);
function compareCaptures(before: Capture[], after: Capture[], pixels: Map<Capture, string>) {
  const a = unique(before, (c) => c.title, 'capture title'),
    b = unique(after, (c) => c.title, 'capture title');
  return [...new Set([...a.keys(), ...b.keys()])].map((title) => {
    const old = a.get(title),
      next = b.get(title);
    if (!old || !next)
      return { title, change: (next ? 'added' : 'removed') as 'added' | 'removed' };
    const rawHashesAvailable = Boolean(old.rawSha256 && next.rawSha256);
    const pixelsChanged = rawHashesAvailable
      ? old.width !== next.width ||
        old.height !== next.height ||
        pixels.get(old) !== pixels.get(next)
      : undefined;
    const annotationsChanged = JSON.stringify(old.marks) !== JSON.stringify(next.marks);
    const changed =
      old.sha256 !== next.sha256 ||
      pixelsChanged ||
      annotationsChanged ||
      old.description !== next.description;
    return {
      title,
      change: (changed ? 'changed' : 'unchanged') as 'changed' | 'unchanged',
      pixelsChanged,
      annotationsChanged,
      rawHashesAvailable,
    };
  });
}

/** Verified evidence comparison; it never opens the target app. */
export async function compareResults(before: RunResult, after: RunResult) {
  const pixels = new Map<Capture, string>();
  for (const run of [before, after])
    for (const chapter of run.report.chapters)
      for (const capture of chapter.captures) {
        await verifiedCapture(run, capture, 'annotated', 64 * 1024 * 1024);
        const raw = await verifiedCapture(run, capture, 'raw', 64 * 1024 * 1024);
        if (capture.width * capture.height > 32 * 1024 * 1024)
          throw new GuideError(
            'ARTIFACT_TOO_LARGE',
            'Pixel comparison exceeds 32 megapixels per image.',
            'Split long screenshots into focused captures.',
          );
        const decoded = await sharp(raw.bytes, { limitInputPixels: 32 * 1024 * 1024 })
          .ensureAlpha()
          .raw()
          .toBuffer();
        pixels.set(capture, createHash('sha256').update(decoded).digest('hex'));
      }
  const key = (c: Chapter) => JSON.stringify([c.feature, c.title]);
  const a = unique(before.report.chapters, key, 'chapter feature/title'),
    b = unique(after.report.chapters, key, 'chapter feature/title');
  const chapters = [...new Set([...a.keys(), ...b.keys()])].map((id) => {
    const old = a.get(id),
      next = b.get(id),
      chapter = next ?? old!;
    const captures = compareCaptures(old?.captures ?? [], next?.captures ?? [], pixels);
    const instructionsChanged = prose(old) !== prose(next);
    const changed =
      JSON.stringify(old?.captures.map((c) => c.title)) !==
        JSON.stringify(next?.captures.map((c) => c.title)) ||
      instructionsChanged ||
      old?.status !== next?.status ||
      old?.error !== next?.error ||
      captures.some((c) => c.change !== 'unchanged');
    const change = !old ? 'added' : !next ? 'removed' : changed ? 'changed' : 'unchanged';
    return {
      feature: chapter.feature,
      title: chapter.title,
      change,
      instructionsChanged,
      captures,
    };
  });
  const metadata = (r: RunResult) =>
    JSON.stringify([
      r.report.title,
      r.report.language,
      r.report.branding,
      r.report.document,
      r.report.manual,
      r.report.profile,
      r.report.viewport,
      r.report.selection,
      r.report.skippedScenarios,
      r.report.exportError,
      r.report.chapters.map((c) => [c.feature, c.title]),
    ]);
  const totals = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const c of chapters) totals[c.change as keyof typeof totals]++;
  return comparisonSchema.parse({
    beforeStatus: before.report.status,
    afterStatus: after.report.status,
    metadataChanged: metadata(before) !== metadata(after),
    chapters,
    totals,
  });
}
export async function compareRuns(before: string, after: string) {
  return compareResults(await loadRunDirectory(before), await loadRunDirectory(after));
}
