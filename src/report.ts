import { z } from 'zod';
import { brandingSchema, viewportSchema } from './config.js';
import { captureSchema } from './capture.js';

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
