import { chromium, firefox, webkit, type BrowserContext } from '@playwright/test';
import { glob, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFeature } from './gherkin.js';
import { builtinSteps, target, formRows, type StepRegistry } from './steps.js';
import { captureScreenshot, validateCapture } from './capture.js';
import { resolveConfig, selectProfile } from './config.js';
import { publishReport } from './artifacts.js';
import type { Chapter, Config, RunReport, RunResult } from './types.js';

export async function loadRegistry(config?: Config) {
  const registry = builtinSteps();
  for (const path of config?.plugins ?? []) {
    const module = (await import(pathToFileURL(path).href)) as {
      register?: (registry: StepRegistry) => Promise<void> | void;
    };
    if (typeof module.register !== 'function')
      throw new Error(`Plugin must export register(registry): ${path}`);
    await module.register(registry);
  }
  return registry;
}

async function prepare(config: Config) {
  const registry = await loadRegistry(config);
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
      if (step.text === 'I fill the form:') formRows(step);
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

export type { RunResult } from './types.js';
export async function run(input: Config): Promise<RunResult> {
  const config = resolveConfig(input);
  const { registry, scenarios } = await prepare(config);
  const profile = selectProfile(config);
  await mkdir(config.output, { recursive: true });
  const staging = await mkdtemp(join(config.output, '.run-'));
  const report: RunReport = {
    schemaVersion: 1,
    title: config.title,
    language: config.language ?? 'en',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    browser: profile.browser ?? 'chromium',
    viewport: profile.viewport,
    profile: config.profile,
    branding: config.branding,
    chapters: [],
  };
  const browserType = { chromium, firefox, webkit }[profile.browser ?? 'chromium'];
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
      let context: BrowserContext | undefined;
      try {
        context = await browser.newContext({
          baseURL: config.baseURL,
          viewport: profile.viewport,
          deviceScaleFactor: profile.deviceScaleFactor,
          isMobile: profile.isMobile,
          hasTouch: profile.hasTouch,
          colorScheme: profile.colorScheme,
          storageState: config.storageState,
          reducedMotion: 'reduce',
          locale: config.language ?? 'en',
        });
        const page = await context.newPage();
        page.setDefaultTimeout(config.timeoutMs ?? 10000);
        page.setDefaultNavigationTimeout(config.timeoutMs ?? 10000);
        for (const step of s.pickle.steps) {
          const started = performance.now();
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
            chapter.steps.push({
              text: step.text,
              status: 'passed',
              durationMs: Math.round(performance.now() - started),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            chapter.steps.push({
              text: step.text,
              status: 'failed',
              error: message,
              durationMs: Math.round(performance.now() - started),
            });
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
        await context?.close();
      }
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    await browser.close().catch(async (error) => {
      await rm(staging, { recursive: true, force: true });
      throw error;
    });
  }
  return publishReport(report, staging, config.output, config.pdf !== false);
}
