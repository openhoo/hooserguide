import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, cp, symlink, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { main } from '../src/cli.js';
import { init } from '../src/scaffold.js';
import { build } from '../src/build.js';
import { bundle } from '../src/bundle.js';
import { inspectRun } from '../src/evidence.js';
import { compareRuns } from '../src/compare.js';
import { renderManual } from '../src/render.js';
import { renderPdf } from '../src/pdf.js';
import type { RunReport } from '../src/types.js';

const fixture = async (root: string) => {
  const directory = join(root, 'source');
  await cp('docs/demo', directory, { recursive: true });
  return {
    directory,
    report: JSON.parse(await readFile(join(directory, 'report.json'), 'utf8')) as RunReport,
  };
};

test('every evidence consumer rejects contradictory success and duplicate references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-integrity-'));
  try {
    const { directory, report } = await fixture(root);
    const mutations: ((report: RunReport) => void)[] = [
      (r) => {
        r.chapters[0]!.steps[0]!.status = 'failed';
      },
      (r) => {
        r.chapters[0]!.steps[0]!.error = '';
      },
      (r) => {
        r.exportError = '';
      },
      (r) => {
        r.chapters[0]!.captures = [];
      },
      (r) => {
        r.chapters[0]!.captures.push(r.chapters[0]!.captures[0]!);
      },
      (r) => {
        r.chapters[0]!.captures[0]!.marks[0]!.bounds.x = 100000;
      },
      (r) => {
        const c = r.chapters[0]!.captures[0]!;
        c.marks[1]!.label = c.marks[0]!.label;
      },
    ];
    for (const mutate of mutations) {
      const invalid = structuredClone(report);
      mutate(invalid);
      await writeFile(join(directory, 'report.json'), JSON.stringify(invalid));
      const consumers = [
        () => inspectRun(directory),
        () => build(directory, { output: join(root, 'out'), pdf: false }),
        () => bundle(directory, join(root, 'guide.zip')),
        () => renderManual(invalid, root),
        () => renderPdf(invalid, root),
      ];
      for (const consume of consumers) await assert.rejects(consume);
    }
    // Failed reports still retain inspectable evidence and explicit failure state.
    const failed = structuredClone(report);
    failed.status = 'failed';
    failed.chapters[0]!.status = 'failed';
    failed.chapters[0]!.steps[0]!.status = 'failed';
    await writeFile(join(directory, 'report.json'), JSON.stringify(failed));
    assert.equal((await inspectRun(directory)).status, 'failed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rebuild bounds report and image reads and rejects escaping report symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-bounded-'));
  try {
    const { directory, report } = await fixture(root);
    const reportPath = join(directory, 'report.json');
    await truncate(reportPath, 2 * 1024 * 1024 + 1);
    await assert.rejects(build(directory), /size limit/);
    const external = join(root, 'external.json');
    await writeFile(external, JSON.stringify(report));
    await rm(reportPath);
    await symlink(external, reportPath);
    await assert.rejects(build(directory), /outside/);
    await rm(reportPath);
    await writeFile(reportPath, JSON.stringify(report));
    await truncate(join(directory, report.chapters[0]!.captures[0]!.image), 64 * 1024 * 1024 + 1);
    await assert.rejects(build(directory), /size limit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('comparison catches execution and browser changes but ignores PNG encoding and timings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-comparison-'));
  try {
    const { directory, report } = await fixture(root);
    const after = join(root, 'after');
    await cp(directory, after, { recursive: true });
    const shot = report.chapters[0]!.captures[0]!;
    const bytes = await sharp(join(after, shot.image)).png({ compressionLevel: 0 }).toBuffer();
    shot.sha256 = createHash('sha256').update(bytes).digest('hex');
    report.chapters[0]!.steps[0]!.durationMs = 999999;
    await writeFile(join(after, shot.image), bytes);
    await writeFile(join(after, 'report.json'), JSON.stringify(report));
    assert.equal((await compareRuns(directory, after)).totals.changed, 0);
    report.browser = 'firefox';
    report.chapters[0]!.steps[0]!.text = 'I open "/different"';
    await writeFile(join(after, 'report.json'), JSON.stringify(report));
    const compared = await compareRuns(directory, after);
    assert.equal(compared.metadataChanged, true);
    assert.equal(compared.chapters[0]!.change, 'changed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI JSON stdout stays parseable when plugins log during import and registration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-json-'));
  try {
    await writeFile(
      join(root, 'plugin.mjs'),
      'console.log("import diagnostic"); export function register() { console.info("registration diagnostic"); }',
    );
    const config = join(root, 'config.json');
    await writeFile(
      config,
      JSON.stringify({
        title: 'Guide',
        baseURL: 'https://example.test',
        features: ['*.feature'],
        plugins: ['./plugin.mjs'],
      }),
    );
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      '--import',
      'tsx',
      resolve('src/cli.ts'),
      'steps',
      '--config',
      config,
      '--json',
    ]);
    assert.ok(JSON.parse(stdout).steps.length > 0);
    assert.match(stderr, /import diagnostic/);
    assert.match(stderr, /registration diagnostic/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('direct renderers reject tampered screenshots before writing manuals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-render-evidence-'));
  try {
    const { directory, report } = await fixture(root);
    await writeFile(join(directory, report.chapters[0]!.captures[0]!.raw), 'tampered');
    for (const render of [renderManual, renderPdf])
      await assert.rejects(render(report, directory), { code: 'HASH_MISMATCH' });
    const unsafe = structuredClone(report);
    unsafe.chapters[0]!.captures[0]!.image = 'https://example.test/tracker.png';
    await assert.rejects(renderManual(unsafe, directory));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI restores console after rejecting unsupported JSON MCP flags', async () => {
  const original = globalThis.console;
  await assert.rejects(main(['mcp', '--json']), /not supported/);
  assert.equal(globalThis.console, original);
});

test('concurrent initialization cannot overwrite the winning project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-init-race-'));
  try {
    const urls = ['https://first.example.test', 'https://second.example.test'];
    const results = await Promise.allSettled(urls.map((url) => init(root, url)));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const winner = results.findIndex((r) => r.status === 'fulfilled');
    const config = JSON.parse(await readFile(join(root, 'hooserguide.config.json'), 'utf8'));
    assert.equal(config.baseURL, urls[winner]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
