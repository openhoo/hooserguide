import { chromium, firefox, webkit, type BrowserContext } from '@playwright/test';
import { glob, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import parseTagExpression from '@cucumber/tag-expressions';
import { applyCaptureDefaults } from './manual.js';
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
  const tags = parseTagExpression(config.tagExpression ?? config.tag ?? '');
  const scenarios = features.flatMap((f, i) =>
    f.pickles
      .filter(
        (p) =>
          tags.evaluate(p.tags.map((t) => t.name)) &&
          (!config.scenario || p.name.toLowerCase().includes(config.scenario.toLowerCase())),
      )
      .map((p) => ({ ...f, pickle: p, source: paths[i]! })),
  );
  if (!scenarios.length) throw new Error('No scenarios selected');
  for (const s of scenarios) {
    if (!s.pickle.steps.length) throw new Error(`Scenario has no steps: ${s.pickle.name}`);
    for (const step of s.pickle.steps) {
      registry.resolve(step.text);
      if (step.text === 'I fill the form:') formRows(step);
      if (step.text.startsWith('I capture ')) {
        validateCapture(
          applyCaptureDefaults(
            {
              ...(step.argument?.docString ? JSON.parse(step.argument.docString.content) : {}),
              title: 'Preflight',
            },
            config.captureDefaults,
          ),
        );
      }
    }
  }
  return { registry, scenarios };
}

export async function validate(input: Config) {
  const config = resolveConfig(input);
  const { scenarios } = await prepare(config);
  return {
    responsive: config.responsive,
    valid: true,
    scenarios: scenarios.map((s) => ({
      name: s.pickle.name,
      feature: s.feature,
      tags: s.pickle.tags.map((t) => t.name),
      captures: s.pickle.steps.filter((step) => step.text.startsWith('I capture ')).length,
      source: s.source,
      steps: s.pickle.steps.length,
    })),
  };
}

export type { RunResult } from './types.js';
export interface RunOptions {
  signal?: AbortSignal;
  /** Best-effort observer; callback errors do not fail or invalidate a run. */
  onProgress?: (progress: {
    completed: number;
    total: number;
    phase: 'executing' | 'exporting' | 'complete';
  }) => Promise<void> | void;
}
export async function run(input: Config, options: RunOptions = {}): Promise<RunResult> {
  if (options.signal?.aborted) throw new Error('Run cancelled');
  const config = resolveConfig(input);
  const { registry, scenarios: selectedScenarios } = await prepare(config);
  const screens = (config.responsive?.profiles ?? [config.profile]).map((name) => ({
    name,
    settings: selectProfile({ ...config, profile: name }),
  }));
  const scenarios = selectedScenarios.flatMap((s, scenario) =>
    screens.map((screen) => ({ ...s, screen, scenario })),
  );
  if (options.signal?.aborted) throw new Error('Run cancelled');
  const total = scenarios.reduce((n, s) => n + s.pickle.steps.length, 0) + 1;
  let completed = 0;
  const progress = async (phase: 'executing' | 'exporting' | 'complete', count = completed) => {
    try {
      await options.onProgress?.({ completed: count, total, phase });
    } catch {
      /* Observers cannot invalidate execution evidence. */
    }
  };
  await progress('executing');
  if (options.signal?.aborted) throw new Error('Run cancelled');
  const profile = screens[0]!.settings;
  await mkdir(config.output, { recursive: true });
  const staging = await mkdtemp(join(config.output, '.run-'));
  const report: RunReport = {
    schemaVersion: 1,
    responsive: config.responsive,
    title: config.title,
    language: config.language ?? 'en',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    browser: profile.browser ?? 'chromium',
    viewport: profile.viewport,
    profile: config.profile,
    branding: config.branding,
    document: config.document,
    manual: config.manual,
    selection: { tagExpression: config.tagExpression ?? config.tag, scenario: config.scenario },
    skippedScenarios: [],
    chapters: [],
  };
  const browsers = new Map<string, Awaited<ReturnType<typeof chromium.launch>>>();
  try {
    for (const screen of screens) {
      const engine = screen.settings.browser ?? 'chromium';
      if (!browsers.has(engine))
        browsers.set(
          engine,
          await { chromium, firefox, webkit }[engine].launch({ headless: !config.headed }),
        );
      if (options.signal?.aborted) throw new Error('Run cancelled');
    }
  } catch (error) {
    await Promise.all([...browsers.values()].map((b) => b.close().catch(() => {})));
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  const cancel = () => {
    for (const browser of browsers.values()) void browser.close().catch(() => {});
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  try {
    for (const [scenarioIndex, s] of scenarios.entries()) {
      const profile = s.screen.settings;
      const browser = browsers.get(profile.browser ?? 'chromium')!;
      const chapter: Chapter = {
        ...(config.responsive
          ? {
              variant: {
                scenario: s.scenario,
                profile: s.screen.name!,
                label:
                  config.responsive.labels &&
                  Object.hasOwn(config.responsive.labels, s.screen.name!)
                    ? config.responsive.labels[s.screen.name!]!
                    : s.screen.name!,
                browser: profile.browser ?? 'chromium',
                viewport: profile.viewport!,
                deviceScaleFactor: profile.deviceScaleFactor ?? 1,
              },
            }
          : {}),
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
        if (options.signal?.aborted) throw new Error('Run cancelled');
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
            if (options.signal?.aborted) throw new Error('Run cancelled');
            await registry.execute({
              page,
              step,
              chapter,
              config: { ...config, profile: s.screen.name, responsive: undefined },
              target: (v) => target(page, v),
              instruction: (text) => chapter.instructions.push(text),
              capture: async (spec) => {
                const id = `${String(report.chapters.length).padStart(2, '0')}-${String(chapter.captures.length + 1).padStart(2, '0')}`;
                const capture = await captureScreenshot(
                  page,
                  applyCaptureDefaults(spec, config.captureDefaults),
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
            const message = options.signal?.aborted
              ? 'Run cancelled'
              : error instanceof Error
                ? error.message
                : String(error);
            chapter.steps.push({
              text: step.text,
              status: 'failed',
              error: message,
              durationMs: Math.round(performance.now() - started),
            });
            throw error;
          } finally {
            completed++;
            await progress('executing');
          }
        }
        if (!chapter.captures.length)
          throw new Error('A handbook chapter must capture at least one screenshot');
      } catch (error) {
        chapter.status = 'failed';
        report.status = 'failed';
        chapter.error = options.signal?.aborted
          ? 'Run cancelled'
          : error instanceof Error
            ? error.message
            : String(error);
      } finally {
        await context?.close().catch((error) => {
          if (!options.signal?.aborted) throw error;
        });
      }
      if (options.signal?.aborted || (config.failFast && chapter.status === 'failed')) {
        report.skippedScenarios = scenarios.slice(scenarioIndex + 1).map((s) => ({
          ...(config.responsive ? { profile: s.screen.name } : {}),
          title: s.pickle.name,
          feature: s.feature,
          source: s.source,
          reason: options.signal?.aborted ? 'cancelled' : 'fail-fast',
        }));
        break;
      }
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    await Promise.all([...browsers.values()].map((b) => b.close())).catch(async (error) => {
      await rm(staging, { recursive: true, force: true });
      throw error;
    });
  }
  await progress('exporting');
  try {
    const result = await publishReport(
      report,
      staging,
      config.output,
      config.pdf !== false,
      options.signal,
    );
    await progress('complete', completed + 1);
    return result;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
