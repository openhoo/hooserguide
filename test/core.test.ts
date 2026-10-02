import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFeature } from '../src/gherkin.js';
import { builtinSteps, StepRegistry } from '../src/steps.js';
import { captureSchema } from '../src/capture.js';
import { resolveConfig } from '../src/config.js';
import { init } from '../src/scaffold.js';
import { renderManual } from '../src/render.js';
import type { RunReport } from '../src/types.js';

test('Gherkin compiles backgrounds, outlines, examples, tags and docstrings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-'));
  try {
    const path = join(root, 'tasks.feature');
    await writeFile(
      path,
      `@manual\nFeature: Tasks\n Background:\n  Given I open "/"\n Scenario Outline: Create <name>\n  When I fill "label=Title" with "<name>"\n  And I capture "<name>"\n   """json\n   {"marks":[{"target":"text=<name>","label":"A"}]}\n   """\n Examples:\n  | name |\n  | One |\n  | Two |\n`,
    );
    const result = await parseFeature(path);
    assert.equal(result.pickles.length, 2);
    assert.deepEqual(
      result.pickles.map((p) => p.name),
      ['Create One', 'Create Two'],
    );
    assert.equal(result.pickles[0]!.steps[0]!.text, 'I open "/"');
    assert.ok(result.pickles[0]!.steps[2]!.argument!.docString!.content.includes('text=One'));
    assert.equal(result.pickles[1]!.tags[0]!.name, '@manual');
    await writeFile(path, 'This is not a Gherkin feature\n');
    await assert.rejects(parseFeature(path), /tasks.feature:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('undefined and ambiguous steps fail rather than silently passing', () => {
  const r = builtinSteps();
  assert.throws(() => r.resolve('I invent a step'), /Undefined/);
  r.define(/^I open "(.*)"$/, () => {});
  assert.throws(() => r.resolve('I open "/"'), /Ambiguous/);
  assert.throws(() => new StepRegistry().define(/step/g, () => {}), /flags/);
  assert.equal(
    builtinSteps().resolve('I fill "label=Title" with "A \\"quote\\""').matches.length,
    2,
  );
});

test('configuration resolves paths against config directory and rejects typos', () => {
  const config = resolveConfig(
    {
      title: 'Guide',
      baseURL: 'http://localhost:3000',
      features: ['features/*.feature'],
      output: 'out',
    },
    '/tmp/project',
  );
  assert.equal(config.features[0], '/tmp/project/features/*.feature');
  assert.equal(config.output, '/tmp/project/out');
  assert.equal(config.pdf, true);
  assert.throws(() => resolveConfig({ ...config, fullpage: true }));
  assert.throws(() => resolveConfig({ ...config, baseURL: 'file:///etc/passwd' }));
  assert.throws(() =>
    captureSchema.parse({ title: 'Guide', marks: [{ target: 'button', color: 'red' }] }),
  );
  assert.throws(() =>
    captureSchema.parse({ title: 'Guide', marks: [{ target: 'button', label: '<svg>' }] }),
  );
});

test('init produces an editable project and refuses overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-init-'));
  try {
    const result = await init(root, 'https://example.test', true);
    assert.equal(JSON.parse(await readFile(result.config, 'utf8')).baseURL, 'https://example.test');
    assert.match(
      await readFile(join(root, '.agents/skills/hooserguide-author/SKILL.md'), 'utf8'),
      /name: hooserguide-author/,
    );
    await assert.rejects(init(root), /Refusing to overwrite/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('HTML and Markdown escape untrusted prose and failed runs cannot render', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-render-'));
  try {
    const report: RunReport = {
      schemaVersion: 1,
      title: '<script>alert(1)</script>',
      language: 'de',
      generatedAt: new Date().toISOString(),
      status: 'passed',
      browser: 'chromium',
      chapters: [
        {
          title: '<img src=x>',
          feature: 'Test',
          description: '**unsafe**',
          source: 'test.feature',
          tags: [],
          status: 'passed',
          instructions: ['<script>bad()</script>'],
          captures: [],
          steps: [],
        },
      ],
    };
    await renderManual(report, root);
    const html = await readFile(join(root, 'index.html'), 'utf8');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('lang="de"'));
    assert.ok(!(await readFile(join(root, 'handbook.md'), 'utf8')).includes('**unsafe**'));
    await assert.rejects(renderManual({ ...report, status: 'failed' }, root), /failed run/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
