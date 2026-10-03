import { glob, realpath, appendFile } from 'node:fs/promises';
import { resolve, isAbsolute, dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Console } from 'node:console';
import { loadRunDirectory, readRunArtifact } from './evidence.js';
import { preparePages, contained } from './pages.js';
import { generateGitlabGuide, gitlabOptionsFromEnvironment } from './gitlab.js';

/** Resolve a single generation job's artifact summary, never "the latest" arbitrary run. */
export async function pagesSourceFromArtifacts(project: string, input: string) {
  const root = await realpath(resolve(project));
  const artifactRoot = await realpath(resolve(root, input));
  if (!contained(root, artifactRoot) || artifactRoot === root)
    throw new Error('Pages source artifacts must be inside the checkout');
  const candidates: string[] = [];
  for await (const file of glob('job-*/summary.json', { cwd: artifactRoot })) candidates.push(file);
  if (candidates.length !== 1)
    throw new Error(
      'Pages needs exactly one generation-job summary; use a distinct artifact root per guide',
    );
  const summaryPath = candidates[0]!;
  const summary = JSON.parse((await readRunArtifact(artifactRoot, summaryPath)).toString('utf8'));
  if (summary.status !== 'passed' || typeof summary.directory !== 'string' || !summary.directory)
    throw new Error('Pages refuses failed or incomplete generation summaries');
  if (isAbsolute(summary.directory))
    throw new Error('Generation summary requires a relative run directory');
  const source = await realpath(resolve(root, summary.directory));
  if (
    !contained(resolve(artifactRoot, dirname(summaryPath)), source) ||
    source === resolve(artifactRoot, dirname(summaryPath))
  )
    throw new Error('Generation summary points outside its artifact root');
  const run = await loadRunDirectory(source);
  if (run.report.status !== 'passed') throw new Error('Pages refuses unsuccessful evidence');
  return source;
}
export async function pagesCiMain(env: NodeJS.ProcessEnv = process.env) {
  const project = env.HOOSERGUIDE_ACTION_MODE
    ? (env.GITHUB_WORKSPACE ?? process.cwd())
    : (env.CI_PROJECT_DIR ?? process.cwd());
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const original = globalThis.console;
  globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
  try {
    if (env.HOOSERGUIDE_ACTION_MODE === 'generate') {
      const summary = await generateGitlabGuide(
        gitlabOptionsFromEnvironment({ ...env, CI_PROJECT_DIR: project, CI_JOB_ID: undefined }),
        { signal: controller.signal },
      );
      process.stdout.write(JSON.stringify(summary) + '\n');
      if (summary.status !== 'passed') {
        process.exitCode = 1;
        return;
      }
      if (env.GITHUB_OUTPUT) {
        const directory = resolve(project, summary.directory!);
        const summaryPath = resolve(
          project,
          env.HOOSERGUIDE_CI_OUTPUT ?? 'output/hooserguide',
          'summary.json',
        );
        const lines = `directory=${directory}\nsummary=${summaryPath}\n`;
        if (/[\r\n]/.test(directory + summaryPath)) throw new Error('Invalid output path');
        await appendFile(env.GITHUB_OUTPUT, lines);
      }
      return;
    }
    const source = env.HOOSERGUIDE_PAGES_RUN
      ? await realpath(resolve(project, env.HOOSERGUIDE_PAGES_RUN))
      : await pagesSourceFromArtifacts(
          project,
          env.HOOSERGUIDE_PAGES_SOURCE ?? 'output/hooserguide',
        );
    if (!contained(await realpath(project), source))
      throw new Error('Pages run must be inside the workspace');
    const result = await preparePages(
      source,
      { root: project, output: env.HOOSERGUIDE_PAGES_OUTPUT ?? 'public' },
      { signal: controller.signal },
    );
    process.stdout.write(JSON.stringify(result) + '\n');
    if (env.GITHUB_OUTPUT) {
      if (/[\r\n]/.test(result.directory)) throw new Error('Invalid output path');
      await appendFile(env.GITHUB_OUTPUT, `directory=${result.directory}\n`);
    }
  } finally {
    globalThis.console = original;
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  await pagesCiMain().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
