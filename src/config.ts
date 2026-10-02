import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import parseTagExpression from '@cucumber/tag-expressions';
import type { BrowserProfile, Config } from './types.js';

export const viewportSchema = z
  .object({ width: z.number().int().min(320), height: z.number().int().min(240) })
  .strict();
export const brandingSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    subtitle: z.string().optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
  })
  .strict();
export const profileSchema = z
  .object({
    viewport: viewportSchema.optional(),
    deviceScaleFactor: z.number().min(1).max(4).optional(),
    browser: z.enum(['chromium', 'firefox', 'webkit']).optional(),
    isMobile: z.boolean().optional(),
    hasTouch: z.boolean().optional(),
    colorScheme: z.enum(['light', 'dark', 'no-preference']).optional(),
  })
  .strict();

export const documentSchema = z
  .object({
    version: z.string().trim().min(1).optional(),
    productVersion: z.string().trim().min(1).optional(),
    audience: z.string().trim().min(1).optional(),
    summary: z.string().optional(),
  })
  .strict();
export const manualSchema = z
  .object({
    pageSize: z.enum(['A4', 'Letter']).optional(),
    orientation: z.enum(['portrait', 'landscape']).optional(),
    margin: z.number().min(24).max(72).optional(),
    contents: z.boolean().optional(),
    showGeneratedAt: z.boolean().optional(),
  })
  .strict();
export const captureDefaultsSchema = z
  .object({
    fullPage: z.boolean().optional(),
    padding: z.number().int().min(0).max(500).optional(),
    autoLabels: z.enum(['numbers', 'letters']).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
  })
  .strict();
export const selectionSchema = z
  .object({
    tagExpression: z
      .string()
      .trim()
      .min(1)
      .refine((v) => {
        try {
          parseTagExpression(v);
          return true;
        } catch {
          return false;
        }
      }, 'Invalid Cucumber tag expression')
      .optional(),
    scenario: z.string().trim().min(1).optional(),
  })
  .strict();
export const calloutSchema = z
  .object({ kind: z.enum(['note', 'tip', 'warning']), text: z.string().min(1) })
  .strict();
export const skippedSchema = z
  .object({
    title: z.string(),
    feature: z.string(),
    source: z.string(),
    reason: z.enum(['fail-fast', 'cancelled']),
  })
  .strict();

export const targetSchema = z.union([
  z.string().min(1),
  z.object({ css: z.string().min(1) }).strict(),
  z.object({ role: z.string().min(1), name: z.string() }).strict(),
  z.object({ label: z.string().min(1) }).strict(),
  z.object({ text: z.string().min(1) }).strict(),
  z.object({ testId: z.string().min(1) }).strict(),
]);
export const configSchema = z
  .object({
    $schema: z.string().optional(),
    title: z.string().min(1),
    baseURL: z
      .url()
      .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol), 'Use an HTTP(S) URL'),
    features: z.array(z.string().min(1)).min(1),
    output: z.string().min(1).default('output'),
    viewport: viewportSchema.optional(),
    deviceScaleFactor: z.number().min(1).max(4).optional(),
    browser: z.enum(['chromium', 'firefox', 'webkit']).optional(),
    headed: z.boolean().optional(),
    storageState: z.string().optional(),
    timeoutMs: z.number().int().min(100).max(120000).optional(),
    plugins: z.array(z.string()).optional(),
    masks: z.array(targetSchema).optional(),
    tag: z
      .string()
      .regex(/^@[\w-]+$/)
      .optional(),
    ...selectionSchema.shape,
    failFast: z.boolean().optional(),
    document: documentSchema.optional(),
    manual: manualSchema.optional(),
    captureDefaults: captureDefaultsSchema.optional(),
    language: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)
      .default('en'),
    pdf: z.boolean().default(true),
    profiles: z.record(z.string().regex(/^[A-Za-z0-9_-]+$/), profileSchema).optional(),
    profile: z.string().min(1).optional(),
    branding: brandingSchema.optional(),
  })
  .strict();

export function defineConfig(config: Config): Config {
  return config;
}
export function selectProfile(config: Config): BrowserProfile {
  const profile =
    config.profile && config.profiles && Object.hasOwn(config.profiles, config.profile)
      ? config.profiles[config.profile]
      : undefined;
  if (config.profile && !profile) throw new Error(`Unknown browser profile: ${config.profile}`);
  const selected = {
    viewport: config.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: config.deviceScaleFactor ?? 1,
    browser: config.browser ?? 'chromium',
    ...profile,
  };
  if (selected.isMobile && selected.browser === 'firefox')
    throw new Error(
      'Firefox does not support isMobile; use viewport-only responsiveness or another browser',
    );
  return selected;
}
export function resolveConfig(input: unknown, root = process.cwd()): Config {
  const c = configSchema.parse(input) as Config;
  selectProfile(c);
  return {
    ...c,
    features: c.features.map((p) => resolve(root, p)),
    output: resolve(root, c.output),
    storageState: c.storageState ? resolve(root, c.storageState) : undefined,
    plugins: c.plugins?.map((p) => resolve(root, p)),
  };
}
export async function loadConfig(
  path = 'hooserguide.config.json',
  overrides: Partial<
    Pick<
      Config,
      'profile' | 'output' | 'headed' | 'pdf' | 'tagExpression' | 'scenario' | 'failFast'
    >
  > = {},
): Promise<Config> {
  const absolute = resolve(path);
  return resolveConfig(
    { ...JSON.parse(await readFile(absolute, 'utf8')), ...overrides },
    dirname(absolute),
  );
}
