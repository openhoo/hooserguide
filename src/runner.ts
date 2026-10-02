import { chromium, firefox, webkit } from '@playwright/test';
import { glob, mkdir, mkdtemp, rename, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseFeature } from './gherkin.js';
import { builtinSteps, target, type StepRegistry } from './steps.js';
import { captureScreenshot, validateCapture } from './capture.js';
import { resolveConfig } from './config.js';
import { renderManual } from './render.js';
import { renderPdf } from './pdf.js';
import type { Chapter, Config, RunReport } from './types.js';

async function prepare(config: Config) {
  const registry = builtinSteps();
  for (const path of config.plugins ?? []) {
    const module = (await import(pathToFileURL(path).href)) as {
      register?: (registry: StepRegistry) => Promise<void> | void;
    };
    if (typeof module.register !== 'function')
      throw new Error(`Plugin must export register(registry): ${path}`);
    await module.register(registry);
  }
  const files = new Set<string>();
  for (const pattern of config.features) {
    let found = false;
    for await (const path of glob(pattern)) {
      files.add(path);
      found = true;
    }
    if (!found) throw new Error(`No feature files match ${pattern}`);
  }
  const paths = [...files].sort();
  const features = await Promise.all(paths.map(parseFeature));
  const scenarios = features.flatMap((f, i) =>
    f.pickles
      .filter((p) => !config.tag || p.tags.some((t) => t.name === config.tag))
      .map((p) => ({ ...f, pickle: p, source: paths[i]! })),
  );
  if (!scenarios.length) throw new Error('No scenarios selected');
  for (const s of scenarios) {
    if (!s.pickle.steps.length) throw new Error(`Scenario has no steps: ${s.pickle.name}`);
    for (const step of s.pickle.steps) {
      registry.resolve(step.text);
      if (step.text.startsWith('I capture ')) {
        validateCapture({
          ...(step.argument?.docString ? JSON.parse(step.argument.docString.content) : {}),
          title: 'Preflight',
        });
      }
    }
  }
  return { registry, scenarios };
}

export async function validate(input: Config) {
  const config = resolveConfig(input);
  const { scenarios } = await prepare(config);
  return {
    valid: true,
    scenarios: scenarios.map((s) => ({
      name: s.pickle.name,
      source: s.source,
      steps: s.pickle.steps.length,
    })),
  };
}

export interface RunResult {
  report: RunReport;
  directory: string;
  artifacts: { report: string; html?: string; markdown?: string; pdf?: string };
}
export async function run(input: Config): Promise<RunResult> {
  const config = resolveConfig(input);
  const { registry, scenarios } = await prepare(config);
  await mkdir(config.output, { recursive: true });
  const staging = await mkdtemp(join(config.output, '.run-'));
  const report: RunReport = {
    schemaVersion: 1,
    title: config.title,
    language: config.language ?? 'en',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    browser: config.browser ?? 'chromium',
    chapters: [],
  };
  const browserType = { chromium, firefox, webkit }[config.browser ?? 'chromium'];
  // Launch errors have no successful handbook to expose.
  const browser = await browserType.launch({ headless: !config.headed }).catch(async (error) => {
    await rm(staging, { recursive: true, force: true });
    throw error;
  });
  try {
    for (const s of scenarios) {
      const chapter: Chapter = {
        title: s.pickle.name,
        feature: s.feature,
        description: s.description,
        source: s.source,
        tags: s.pickle.tags.map((t) => t.name),
        status: 'passed',
        instructions: [],
        captures: [],
        steps: [],
      };
      report.chapters.push(chapter);
      const context = await browser.newContext({
        baseURL: config.baseURL,
        viewport: config.viewport ?? { width: 1280, height: 800 },
        deviceScaleFactor: config.deviceScaleFactor ?? 1,
        storageState: config.storageState,
        reducedMotion: 'reduce',
        locale: config.language ?? 'en',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(config.timeoutMs ?? 10000);
      page.setDefaultNavigationTimeout(config.timeoutMs ?? 10000);
      try {
        for (const step of s.pickle.steps) {
          try {
            await registry.execute({
              page,
              step,
              chapter,
              config,
              target: (v) => target(page, v),
              instruction: (text) => chapter.instructions.push(text),
              capture: async (spec) => {
                const id = `${String(report.chapters.length).padStart(2, '0')}-${String(chapter.captures.length + 1).padStart(2, '0')}`;
                const capture = await captureScreenshot(
                  page,
                  spec,
                  staging,
                  id,
                  config.masks,
                  config.timeoutMs,
                );
                chapter.captures.push(capture);
                return capture;
              },
            });
            chapter.steps.push({ text: step.text, status: 'passed' });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            chapter.steps.push({ text: step.text, status: 'failed', error: message });
            throw error;
          }
        }
        if (!chapter.captures.length)
          throw new Error('A handbook chapter must capture at least one screenshot');
      } catch (error) {
        chapter.status = 'failed';
        report.status = 'failed';
        chapter.error = error instanceof Error ? error.message : String(error);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (report.status === 'passed') {
    try {
      if (config.pdf !== false) await renderPdf(report, staging);
      await renderManual(report, staging);
    } catch (error) {
      report.status = 'failed';
      report.exportError = error instanceof Error ? error.message : String(error);
      await Promise.all(
        ['index.html', 'handbook.md', 'handbook.pdf'].map((name) =>
          rm(join(staging, name), { force: true }),
        ),
      );
    }
  }
  await writeFile(join(staging, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const directory = join(
    config.output,
    `run-${report.generatedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
  );
  await rename(staging, directory);
  const artifacts: RunResult['artifacts'] = { report: join(directory, 'report.json') };
  if (report.status === 'passed') {
    artifacts.html = join(directory, 'index.html');
    artifacts.markdown = join(directory, 'handbook.md');
    if (config.pdf !== false) artifacts.pdf = join(directory, 'handbook.pdf');
  }
  return { report, directory, artifacts };
}
