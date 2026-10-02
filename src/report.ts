import { z } from 'zod';
import {
  brandingSchema,
  viewportSchema,
  documentSchema,
  manualSchema,
  selectionSchema,
  calloutSchema,
  skippedSchema,
} from './config.js';
import { captureSchema, validateCapture } from './capture.js';
import type { RunReport } from './types.js';

const rectangle = z
  .object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const screenshot = z.string().regex(/^screenshots\/[A-Za-z0-9_-]+(?:\.raw)?\.png$/);
export const reportSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1),
    generatedAt: z.iso.datetime(),
    language: z.string(),
    status: z.enum(['passed', 'failed']),
    browser: z.enum(['chromium', 'firefox', 'webkit']),
    exportError: z.string().optional(),
    profile: z.string().optional(),
    branding: brandingSchema.optional(),
    viewport: viewportSchema.optional(),
    rebuiltAt: z.iso.datetime().optional(),
    sourceReportSha256: hash.optional(),
    document: documentSchema.optional(),
    manual: manualSchema.optional(),
    selection: selectionSchema.optional(),
    skippedScenarios: z.array(skippedSchema).optional(),
    chapters: z
      .array(
        z
          .object({
            title: z.string(),
            feature: z.string(),
            source: z.string(),
            tags: z.array(z.string()),
            description: z.string(),
            status: z.enum(['passed', 'failed']),
            error: z.string().optional(),
            instructions: z.array(z.string()),
            prerequisites: z.array(z.string().min(1)).optional(),
            callouts: z.array(calloutSchema).optional(),
            steps: z.array(
              z
                .object({
                  text: z.string(),
                  status: z.enum(['passed', 'failed']),
                  error: z.string().optional(),
                  durationMs: z.number().nonnegative().optional(),
                })
                .strict(),
            ),
            captures: z.array(
              z
                .object({
                  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
                  title: z.string().min(1),
                  description: z.string().optional(),
                  image: screenshot,
                  raw: screenshot,
                  width: z.number().int().positive(),
                  height: z.number().int().positive(),
                  sha256: hash,
                  rawSha256: hash.optional(),
                  marks: z.array(
                    captureSchema.shape.marks.unwrap().element.extend({ bounds: rectangle }),
                  ),
                  crop: rectangle.optional(),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** Semantic checks shared by all readers and exporters, beyond the JSON shape. */
export function assertReportIntegrity(report: RunReport): void {
  const ids = new Set<string>(),
    paths = new Set<string>();
  for (const chapter of report.chapters) {
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
      for (const mark of capture.marks)
        if (
          mark.bounds.x + mark.bounds.width > capture.width + 1 ||
          mark.bounds.y + mark.bounds.height > capture.height + 1 ||
          (mark.from && (mark.from.x >= capture.width || mark.from.y >= capture.height))
        )
          throw new Error('Annotation lies outside the evidence screenshot');
    }
  }
  if (
    report.status === 'passed' &&
    (report.exportError !== undefined ||
      report.skippedScenarios?.length ||
      report.chapters.some(
        (c) =>
          c.status !== 'passed' ||
          c.error !== undefined ||
          !c.steps.length ||
          !c.captures.length ||
          c.steps.some((s) => s.status !== 'passed' || s.error !== undefined),
      ))
  )
    throw new Error('Report claims success with unsuccessful or incomplete execution evidence');
}

export function requireSuccessfulEvidence(report: RunReport): void {
  assertReportIntegrity(report);
  if (report.status !== 'passed')
    throw new Error('Cannot export unsuccessful execution evidence from a failed run');
}
