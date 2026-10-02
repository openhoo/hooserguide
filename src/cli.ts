#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { run, validate, loadRegistry } from './runner.js';
import { build } from './build.js';
import { VERSION } from './version.js';
import { init } from './scaffold.js';
import { serveMcp } from './mcp.js';
import { demo } from './demo.js';

const help = `hooserguide — verified user guides from BDD + Playwright + pdfcn

Usage:
  hooserguide init [directory] --base-url http://localhost:3000 [--skills]
  hooserguide validate [--config hooserguide.config.json] [--json]
  hooserguide steps [--config hooserguide.config.json] [--json]
  hooserguide run [--config hooserguide.config.json] [--profile mobile] [--headed] [--no-pdf] [--json]
  hooserguide build <run-directory> [--output output/rebuilt] [--config hooserguide.config.json] [--no-pdf] [--json]
  hooserguide demo [--output output/demo] [--json]
  hooserguide mcp [--config hooserguide.config.json]

Run exports PDF, HTML, Markdown, screenshots and a JSON execution report.
Failed workflows exit 1 and do not produce a successful handbook.
Install browsers once: npx playwright install chromium
`;

export async function main(args = process.argv.slice(2)): Promise<void> {
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
      skills: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) {
    console.log(VERSION);
    return;
  }
  const command = positionals[0];
  if (values.help || !command) {
    console.log(help);
    return;
  }
  if (!['init', 'run', 'validate', 'steps', 'build', 'demo', 'mcp'].includes(command))
    throw new Error(`Unknown command ${command}. Use --help.`);
  if (positionals.length > (['init', 'build'].includes(command) ? 2 : 1))
    throw new Error('Unexpected positional argument. Use --help.');
  const configPath = resolve(values.config ?? 'hooserguide.config.json');
  if (command === 'steps') {
    const steps = (
      await loadRegistry(values.config ? await loadConfig(configPath) : undefined)
    ).list();
    console.log(
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
    console.log(
      values.json
        ? JSON.stringify(result)
        : `Created ${result.config}\nEdit ${result.feature}\nThen: hooserguide run --config ${result.config}`,
    );
    return;
  }
  if (command === 'validate') {
    const result = await validate({
      ...(await loadConfig(configPath)),
      ...(values.profile ? { profile: values.profile } : {}),
    });
    console.log(
      values.json
        ? JSON.stringify(result)
        : `✓ ${result.scenarios.length} scenarios validated; all steps are defined.`,
    );
    return;
  }
  const result =
    command === 'build'
      ? await build(positionals[1]!, {
          output: values.output,
          pdf: !values['no-pdf'],
          branding: values.config ? (await loadConfig(configPath)).branding : undefined,
        })
      : command === 'demo'
        ? await demo(resolve(values.output ?? 'output/demo'))
        : await run({
            ...(await loadConfig(configPath)),
            ...(values.headed ? { headed: true } : {}),
            ...(values['no-pdf'] ? { pdf: false } : {}),
            ...(values.profile ? { profile: values.profile } : {}),
            ...(values.output ? { output: resolve(values.output) } : {}),
          });
  const summary = {
    status: result.report.status,
    profile: result.report.profile,
    exportError: result.report.exportError,
    directory: result.directory,
    artifacts: result.artifacts,
    chapters: result.report.chapters.map((c) => ({
      title: c.title,
      status: c.status,
      captures: c.captures.length,
      error: c.error,
    })),
  };
  if (values.json) console.log(JSON.stringify(summary));
  else {
    console.log(
      `\n${result.report.status === 'passed' ? '✓ Guide generated' : '✗ Guide failed'} · ${result.report.chapters.length} chapters`,
    );
    for (const [format, path] of Object.entries(result.artifacts))
      console.log(`  ${format.padEnd(8)} ${path}`);
    for (const c of result.report.chapters.filter((c) => c.status === 'failed'))
      console.error(`  Failed: ${c.title}\n  ${c.error}`);
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
