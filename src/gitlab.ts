import { Console } from 'node:console';
import { writeFile, mkdir, realpath } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { loadConfig, selectProfile, manualSchema } from './config.js';
import { validate, run } from './runner.js';
import { bundle } from './bundle.js';
import type { Config } from './types.js';

const httpURL = z
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Use an HTTP(S) URL');
const gitlabOptionsSchema = z
  .object({
    project: z.string().min(1).default(process.cwd()),
    config: z.string().min(1).default('hooserguide.config.json'),
    output: z.string().min(1).default('output/hooserguide'),
    browser: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
    profile: z.string().min(1).optional(),
    baseURL: httpURL.optional(),
    tagExpression: z.string().min(1).optional(),
    scenario: z.string().min(1).optional(),
    pdf: z.boolean().default(true),
    bundle: z.boolean().default(true),
    failFast: z.boolean().default(false),
    manual: manualSchema.optional(),
    waitURL: httpURL.optional(),
    waitTimeoutSeconds: z.number().int().min(1).max(300).default(60),
  })
  .strict();
export type GitlabOptions = z.input<typeof gitlabOptionsSchema>;
export interface GitlabSummary {
  status: 'passed' | 'failed';
  browser?: string;
  profile?: string;
  directory?: string;
  artifacts?: Record<string, string>;
  chapters?: { title: string; status: 'passed' | 'failed'; captures: number; error?: string }[];
  error?: string;
}
const contained = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
async function waitForApplication(url: string, timeoutSeconds: number, signal?: AbortSignal) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const requestSignal = AbortSignal.timeout(Math.min(2000, Math.max(1, deadline - Date.now())));
      const response = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, requestSignal]) : requestSignal,
        redirect: 'manual',
      });
      await response.body?.cancel();
      if (response.status >= 200 && response.status < 400) return;
    } catch {
      signal?.throwIfAborted();
    }
    await delay(Math.min(250, Math.max(1, deadline - Date.now())), undefined, { signal });
  }
  throw new Error(`Application readiness timed out after ${timeoutSeconds} seconds`);
}

/** GitLab job adapter: isolated output, verified execution and optional portable bundle. */
export async function generateGitlabGuide(
  input: GitlabOptions,
  controls: { signal?: AbortSignal } = {},
): Promise<GitlabSummary> {
  let output: string | undefined;
  let summary: GitlabSummary = { status: 'failed' };
  try {
    controls.signal?.throwIfAborted();
    const options = gitlabOptionsSchema.parse(input);
    const project = await realpath(resolve(options.project));
    const candidate = resolve(project, options.output);
    if (isAbsolute(options.output) || candidate === project || !contained(project, candidate))
      throw new Error('GitLab output must be a new relative directory inside the project');
    const configPath = await realpath(resolve(project, options.config));
    if (!contained(project, configPath))
      throw new Error('GitLab config must resolve inside the project');
    // Refuse existing output so artifacts cannot silently include stale runs or unrelated files.
    let existingParent = dirname(candidate);
    while (true) {
      try {
        if (!contained(project, await realpath(existingParent)))
          throw new Error('GitLab output parent resolves outside the project');
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        existingParent = dirname(existingParent);
      }
    }
    await mkdir(dirname(candidate), { recursive: true });
    if (!contained(project, await realpath(dirname(candidate))))
      throw new Error('GitLab output parent resolves outside the project');
    await mkdir(candidate).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error(
          'GitLab output already exists; choose a new directory to avoid publishing stale artifacts',
        );
      throw error;
    });
    output = candidate;
    const config = await loadConfig(configPath, {
      output,
      pdf: options.pdf,
      failFast: options.failFast,
      ...(options.profile ? { profile: options.profile } : {}),
      ...(options.tagExpression ? { tagExpression: options.tagExpression } : {}),
      ...(options.scenario ? { scenario: options.scenario } : {}),
    });
    const selected = selectProfile(config);
    const execution: Config = {
      ...config,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      browser: options.browser,
      ...(config.profile
        ? {
            profiles: {
              ...config.profiles,
              [config.profile]: { ...selected, browser: options.browser },
            },
          }
        : {}),
      manual: { ...config.manual, ...options.manual },
    };
    await validate(execution);
    if (options.waitURL)
      await waitForApplication(options.waitURL, options.waitTimeoutSeconds, controls.signal);
    const result = await run(execution, controls);
    const artifacts = Object.fromEntries(
      Object.entries(result.artifacts).map(([kind, path]) => [
        kind,
        relative(project, path).split(sep).join('/'),
      ]),
    );
    summary = {
      status: result.report.status,
      browser: result.report.browser,
      ...(result.report.profile ? { profile: result.report.profile } : {}),
      directory: relative(project, result.directory).split(sep).join('/'),
      artifacts,
      chapters: result.report.chapters.map((chapter) => ({
        title: chapter.title,
        status: chapter.status,
        captures: chapter.captures.length,
        ...(chapter.error !== undefined ? { error: chapter.error } : {}),
      })),
    };
    if (result.report.status === 'failed')
      summary.error =
        result.report.exportError ??
        result.report.chapters.find((chapter) => chapter.error)?.error ??
        'Guide execution failed';
    else if (options.bundle) {
      const archive = await bundle(result.directory, join(output, 'handbook.zip'), controls);
      artifacts.bundle = relative(project, archive.path).split(sep).join('/');
    }
  } catch (error) {
    summary = {
      ...summary,
      status: 'failed',
      error: controls.signal?.aborted
        ? 'GitLab guide generation cancelled'
        : error instanceof Error
          ? error.message
          : String(error),
    };
  }
  if (output)
    await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', {
      flag: 'wx',
    });
  return summary;
}

/** Inputs are passed as literal environment values, never interpolated into executable source. */
export function gitlabOptionsFromEnvironment(env: NodeJS.ProcessEnv = process.env): GitlabOptions {
  const text = (name: string) => env[`HOOSERGUIDE_CI_${name}`] || undefined;
  const boolean = (name: string) => {
    const value = text(name)?.replace(/^boolean:/, '');
    if (value === undefined) return undefined;
    if (!['true', 'false'].includes(value))
      throw new Error(`HOOSERGUIDE_CI_${name} must be true or false`);
    return value === 'true';
  };
  const number = (name: string) => text(name)?.replace(/^number:/, '');
  const margin = Number(number('MARGIN') ?? 0);
  const jobId = env.CI_JOB_ID;
  if (jobId !== undefined && !/^\d+$/.test(jobId)) throw new Error('CI_JOB_ID must be numeric');
  const output = text('OUTPUT') ?? 'output/hooserguide';
  return {
    project: env.CI_PROJECT_DIR ?? process.cwd(),
    config: text('CONFIG'),
    output: jobId ? `${output}/job-${jobId}` : output,
    browser: text('BROWSER') as Config['browser'],
    profile: text('PROFILE'),
    baseURL: text('BASE_URL'),
    tagExpression: text('TAGS'),
    scenario: text('SCENARIO'),
    pdf: boolean('PDF'),
    bundle: boolean('BUNDLE'),
    failFast: boolean('FAIL_FAST'),
    waitURL: text('WAIT_URL'),
    waitTimeoutSeconds: number('WAIT_TIMEOUT') ? Number(number('WAIT_TIMEOUT')) : undefined,
    manual: {
      ...(text('PAGE_SIZE') && text('PAGE_SIZE') !== 'config'
        ? { pageSize: text('PAGE_SIZE') as 'A4' | 'Letter' }
        : {}),
      ...(text('ORIENTATION') && text('ORIENTATION') !== 'config'
        ? { orientation: text('ORIENTATION') as 'portrait' | 'landscape' }
        : {}),
      ...(margin !== 0 ? { margin } : {}),
    },
  };
}

export async function gitlabMain() {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const original = globalThis.console;
  globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
  try {
    const summary = await generateGitlabGuide(gitlabOptionsFromEnvironment(), {
      signal: controller.signal,
    });
    process.stdout.write(JSON.stringify(summary) + '\n');
    if (summary.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }) + '\n',
    );
    process.exitCode = 1;
  } finally {
    globalThis.console = original;
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  await gitlabMain();
