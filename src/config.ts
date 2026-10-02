import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import type { Config } from './types.js';

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
    viewport: z
      .object({ width: z.number().int().min(320), height: z.number().int().min(240) })
      .strict()
      .optional(),
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
    language: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)
      .default('en'),
    pdf: z.boolean().default(true),
  })
  .strict();

export function defineConfig(config: Config): Config {
  return config;
}
export function resolveConfig(input: unknown, root = process.cwd()): Config {
  const c = configSchema.parse(input) as Config;
  return {
    ...c,
    features: c.features.map((p) => resolve(root, p)),
    output: resolve(root, c.output),
    storageState: c.storageState ? resolve(root, c.storageState) : undefined,
    plugins: c.plugins?.map((p) => resolve(root, p)),
  };
}
export async function loadConfig(path = 'hooserguide.config.json'): Promise<Config> {
  const absolute = resolve(path);
  return resolveConfig(JSON.parse(await readFile(absolute, 'utf8')), dirname(absolute));
}
