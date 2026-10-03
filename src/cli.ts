#!/usr/bin/env node
import { parseArgs, format } from 'node:util';
import { Console } from 'node:console';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareRuns } from './compare.js';
import { bundle } from './bundle.js';
import { inspectRun } from './evidence.js';
import { loadConfig, manualSchema } from './config.js';
import { run, validate, loadRegistry } from './runner.js';
import { build } from './build.js';
import { VERSION } from './version.js';
import { init } from './scaffold.js';
import { serveMcp } from './mcp.js';
import { demo } from './demo.js';

const help = `hooserguide — verified user guides from BDD + Playwright + pdfcn

Usage:
  hooserguide init [directory] --base-url http://localhost:3000 [--skills]
  hooserguide validate [--config hooserguide.config.json] [--profile mobile] [--json]
  hooserguide steps [--config hooserguide.config.json] [--json]
  hooserguide run [--config hooserguide.config.json] [--profile mobile] [--output output/guides] [--headed] [--no-pdf] [--json]
  hooserguide build <run-directory> [--output output/rebuilt] [--config hooserguide.config.json] [--no-pdf] [--json]
  hooserguide inspect <run-directory> [--json]
  hooserguide compare <before-run> <after-run> [--json]
  hooserguide bundle <run-directory> [--output handbook.zip] [--json]
  hooserguide demo [--output output/demo] [--json]
  hooserguide mcp [--config hooserguide.config.json]

Responsive: run/validate accept --profiles desktop,tablet,mobile; run/build accept --screen-layout side-by-side|stacked.
Selection: run/validate accept --tags "@manual and not @destructive" and --scenario "Settings".
Run: --fail-fast stops after the first failed scenario.
PDF layout: run/build accept --page-size A4|Letter, --orientation portrait|landscape (or --landscape) and --margin 24..72 (points).

Run exports PDF, HTML, Markdown, screenshots and a JSON execution report.
Failed workflows exit 1 and do not produce a successful handbook.
Install browsers once: npx playwright install chromium
`;

/** Keep trusted plugin diagnostics separate from machine-readable CLI results. */
export async function main(args = process.argv.slice(2)): Promise<void> {
  const original = globalThis.console;
  if (args.includes('--json'))
    globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
  try {
    await execute(args);
  } finally {
    if (args.includes('--json')) globalThis.console = original;
  }
}
const output = (...values: unknown[]) => {
  process.stdout.write(format(...values) + '\n');
};
async function execute(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c' },
      json: { type: 'boolean' },
      headed: { type: 'boolean' },
      'no-pdf': { type: 'boolean' },
      'base-url': { type: 'string' },
      output: { type: 'string' },
      profile: { type: 'string' },
      profiles: { type: 'string' },
      'screen-layout': { type: 'string' },
      skills: { type: 'boolean' },
      tags: { type: 'string' },
      scenario: { type: 'string' },
      'fail-fast': { type: 'boolean' },
      'no-fail-fast': { type: 'boolean' },
      'page-size': { type: 'string' },
      landscape: { type: 'boolean' },
      orientation: { type: 'string' },
      margin: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) {
    output(VERSION);
    return;
  }
  const command = positionals[0];
  if (values.help || !command) {
    output(help);
    return;
  }
  if (
    ![
      'init',
      'run',
      'validate',
      'steps',
      'build',
      'demo',
      'mcp',
      'compare',
      'bundle',
      'inspect',
    ].includes(command)
  )
    throw new Error(`Unknown command ${command}. Use --help.`);
  if (
    positionals.length >
    (command === 'compare' ? 3 : ['init', 'build', 'bundle', 'inspect'].includes(command) ? 2 : 1)
  )
    throw new Error('Unexpected positional argument. Use --help.');
  const allowed: Record<string, string[]> = {
    init: ['base-url', 'skills', 'json'],
    validate: ['config', 'profile', 'profiles', 'tags', 'scenario', 'json'],
    steps: ['config', 'json'],
    run: [
      'config',
      'profile',
      'profiles',
      'screen-layout',
      'output',
      'headed',
      'no-pdf',
      'json',
      'tags',
      'scenario',
      'fail-fast',
      'no-fail-fast',
      'page-size',
      'landscape',
      'orientation',
      'margin',
    ],
    build: [
      'screen-layout',
      'config',
      'output',
      'no-pdf',
      'json',
      'page-size',
      'landscape',
      'orientation',
      'margin',
    ],
    inspect: ['json'],
    compare: ['json'],
    bundle: ['output', 'json'],
    demo: ['output', 'json'],
    mcp: ['config'],
  };
  for (const flag of Object.keys(values))
    if (!allowed[command]!.includes(flag))
      throw new Error(`--${flag} is not supported by ${command}`);
  const configPath = resolve(values.config ?? 'hooserguide.config.json');
  const selection = {
    ...(values.tags !== undefined ? { tagExpression: values.tags } : {}),
    ...(values.scenario !== undefined ? { scenario: values.scenario } : {}),
  };
  if (values['fail-fast'] && values['no-fail-fast'])
    throw new Error('Use --fail-fast or --no-fail-fast, not both');
  if (values.profile && values.profiles) throw new Error('Use --profile or --profiles, not both');
  const responsiveSelection = values.profiles
    ? { responsive: { profiles: values.profiles.split(',').map((p) => p.trim()) } }
    : {};
  if (values.orientation && values.landscape)
    throw new Error('Use --orientation or --landscape, not both');
  const layout = manualSchema.parse({
    ...(values['screen-layout'] !== undefined ? { screenLayout: values['screen-layout'] } : {}),
    ...(values['page-size'] !== undefined ? { pageSize: values['page-size'] } : {}),
    ...(values.orientation !== undefined
      ? { orientation: values.orientation }
      : values.landscape
        ? { orientation: 'landscape' }
        : {}),
    ...(values.margin !== undefined ? { margin: Number(values.margin) } : {}),
  });
  if (['inspect', 'compare', 'bundle'].includes(command)) {
    if (!positionals[1] || (command === 'compare' && !positionals[2]))
      throw new Error(
        `${command} requires ${command === 'compare' ? 'two run directories' : 'a run directory'}`,
      );
    const result =
      command === 'inspect'
        ? await inspectRun(positionals[1])
        : command === 'compare'
          ? await compareRuns(positionals[1], positionals[2]!)
          : await bundle(positionals[1], values.output);
    output(JSON.stringify(result, null, values.json ? undefined : 2));
    return;
  }

  if (command === 'steps') {
    const steps = (
      await loadRegistry(values.config ? await loadConfig(configPath) : undefined)
    ).list();
    output(
      values.json
        ? JSON.stringify({ steps })
        : steps
            .map((s) => `${s.example ?? s.pattern}\n  ${s.description ?? 'Custom step'}`)
            .join('\n'),
    );
    return;
  }
  if (command === 'build' && !positionals[1]) throw new Error('build requires a run directory');
  if (command === 'mcp') {
    await serveMcp(configPath);
    return;
  }
  if (command === 'init') {
    const result = await init(positionals[1] ?? '.', values['base-url'], values.skills);
    output(
      values.json
        ? JSON.stringify(result)
        : `Created ${result.config}\nEdit ${result.feature}\nThen: hooserguide run --config ${result.config}`,
    );
    return;
  }
  if (command === 'validate') {
    const result = await validate(
      await loadConfig(configPath, {
        ...selection,
        ...responsiveSelection,
        ...(values.profile ? { profile: values.profile } : {}),
      }),
    );
    output(
      values.json
        ? JSON.stringify(result)
        : `✓ ${result.scenarios.length} scenarios validated; all steps are defined.`,
    );
    return;
  }
  const buildConfig =
    command === 'build' && values.config ? await loadConfig(configPath) : undefined;
  const runConfig =
    command === 'run'
      ? await loadConfig(configPath, {
          ...selection,
          ...responsiveSelection,
          ...(values.headed ? { headed: true } : {}),
          ...(values['no-pdf'] ? { pdf: false } : {}),
          ...(values.profile ? { profile: values.profile } : {}),
          ...(values.output ? { output: resolve(values.output) } : {}),
          ...(values['fail-fast']
            ? { failFast: true }
            : values['no-fail-fast']
              ? { failFast: false }
              : {}),
        })
      : undefined;
  const result =
    command === 'build'
      ? await build(positionals[1]!, {
          output: values.output,
          pdf: values['no-pdf'] ? false : buildConfig?.pdf,
          branding: buildConfig?.branding,
          document: buildConfig?.document,
          manual: { ...buildConfig?.manual, ...layout },
        })
      : command === 'demo'
        ? await demo(resolve(values.output ?? 'output/demo'))
        : await run({ ...runConfig!, manual: { ...runConfig!.manual, ...layout } });
  const summary = {
    status: result.report.status,
    profile: result.report.profile,
    responsive: result.report.responsive,
    exportError: result.report.exportError,
    selection: result.report.selection,
    skippedScenarios: result.report.skippedScenarios,
    directory: result.directory,
    artifacts: result.artifacts,
    chapters: result.report.chapters.map((c) => ({
      title: c.title,
      variant: c.variant,
      status: c.status,
      captures: c.captures.length,
      error: c.error,
    })),
  };
  if (values.json) output(JSON.stringify(summary));
  else {
    output(
      `\n${result.report.status === 'passed' ? '✓ Guide generated' : '✗ Guide failed'} · ${result.report.chapters.length} chapters`,
    );
    for (const [format, path] of Object.entries(result.artifacts))
      output(`  ${format.padEnd(8)} ${path}`);
    for (const c of result.report.chapters.filter((c) => c.status === 'failed'))
      console.error(
        `  Failed: ${c.title}${c.variant ? ` (${c.variant.label})` : ''}\n  ${c.error}`,
      );
    if (result.report.exportError) console.error(`  Export failed: ${result.report.exportError}`);
  }
  if (result.report.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      process.argv.includes('--json')
        ? JSON.stringify({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          })
        : `hooserguide: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
