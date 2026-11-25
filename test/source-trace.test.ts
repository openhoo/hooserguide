import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from '../src/build.js';
import { inspectRun } from '../src/evidence.js';
import { assertReportIntegrity } from '../src/report.js';
import { run } from '../src/runner.js';

test('figures trace to executed source bytes, Outline rows, Backgrounds and plugin steps after a rebuild', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-trace-'));
  try {
    const feature = join(root, 'tasks.feature');
    const source = [
      'Feature: Source trace',
      '  Background:',
      '    Given I explain "Read this first."',
      '  Scenario Outline: Check <value>',
      '    Given I open "about:blank"',
      '    Then the page title is ""',
      '    When I take two figures',
      '    And I capture "<value>"',
      '    Examples:',
      '      | value  |',
      '      | First  |',
      '      | Second |',
      '',
    ].join('\r\n');
    await writeFile(feature, source);
    const plugin = join(root, 'plugin.mjs');
    await writeFile(
      plugin,
      `
      export function register(registry) {
        registry.define(/^I take two figures$/, async c => {
          await c.capture({title: 'Before'});
          await c.capture({title: 'After'});
        });
      }
    `,
    );
    const generated = await run({
      title: 'Trace',
      features: [feature],
      plugins: [plugin],
      baseURL: 'http://127.0.0.1:1',
      output: join(root, 'runs'),
      pdf: false,
    });
    assert.equal(
      generated.report.status,
      'passed',
      generated.report.exportError ?? generated.report.chapters[0]?.error,
    );
    // The input can change between generation and review. The rebuild must not
    // re-read the file or attribute old images to the changed source.
    await writeFile(feature, 'Feature: An unrelated replacement\n');
    const rebuilt = await build(generated.directory, { output: join(root, 'rebuilt'), pdf: false });
    const { report } = await inspectRun(rebuilt.directory);
    const digest = createHash('sha256').update(source).digest('hex');
    for (const [index, chapter] of report.chapters.entries()) {
      assert.equal(chapter.sourceSha256, digest);
      assert.deepEqual(chapter.location, { line: 11 + index, column: 7 });
      assert.deepEqual(
        chapter.steps.map((s) => [s.kind, s.location]),
        [
          ['guidance', { line: 3, column: 5 }],
          ['action', { line: 5, column: 5 }],
          ['assertion', { line: 6, column: 5 }],
          ['custom', { line: 7, column: 5 }],
          ['capture', { line: 8, column: 5 }],
        ],
      );
      assert.deepEqual(
        chapter.captures.map((c) => c.step),
        [4, 4, 5],
      );
    }
    const invalid = structuredClone(report);
    const ch = invalid.chapters[0]!;
    ch.captures[2]!.step = 6;
    assert.throws(() => assertReportIntegrity(invalid), /reference executed steps/);
    ch.captures[2]!.step = 4;
    assert.throws(() => assertReportIntegrity(invalid), /named figure/);
    ch.captures[2]!.step = 5;
    ch.captures[0]!.step = 3;
    assert.throws(() => assertReportIntegrity(invalid), /non-capture/);
    ch.captures[0]!.step = 4;
    delete ch.steps[0]!.location;
    assert.throws(() => assertReportIntegrity(invalid), /Incomplete source trace/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a plugin figure preceding a failure keeps the failed step as its source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-failed-trace-'));
  try {
    const feature = join(root, 'failure.feature');
    await writeFile(feature, 'Feature: Failure\n  Scenario: Diagnose\n    When a check fails\n');
    const plugin = join(root, 'plugin.mjs');
    await writeFile(
      plugin,
      `
      export function register(registry) {
        registry.define(/^a check fails$/, async c => {
          await c.capture({title: 'Partial result'});
          throw new Error('Validation failed');
        });
      }
    `,
    );
    const runResult = await run({
      title: 'Failure',
      baseURL: 'http://127.0.0.1:1',
      features: [feature],
      plugins: [plugin],
      output: join(root, 'runs'),
      pdf: false,
    });
    const result = await inspectRun(runResult.directory);
    assert.equal(result.status, 'failed');
    const chapter = result.report.chapters[0]!;
    const step = chapter.steps[chapter.captures[0]!.step! - 1]!;
    assert.equal(step.status, 'failed');
    assert.equal(step.kind, 'custom');
    assert.deepEqual(step.location, { line: 3, column: 5 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
