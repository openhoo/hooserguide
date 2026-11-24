import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { authoringSchema, formatOutline, lint } from '../src/authoring.js';
import { setupEditor } from '../src/authoring-scaffold.js';
import { captureScreenshot } from '../src/capture.js';
import { run, validate } from '../src/runner.js';

test('preflight rejects chapters with no possible capture but allows a plugin to take one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-plan-'));
  try {
    const feature = join(root, 'guide.feature');
    const config = {
      title: 'Plan',
      baseURL: 'http://127.0.0.1:1',
      features: [feature],
      output: join(root, 'runs'),
      pdf: false,
    };
    await writeFile(feature, 'Feature: Steps\n Scenario: Missing figure\n  Given I open "/"\n');
    await assert.rejects(validate(config), /capture/i);
    await assert.rejects(run(config), /capture/i);
    assert.ok(!(await readdir(root)).includes('runs'));

    // The plugin's phrase resembles a built-in, but only its handler knows what it captures.
    const plugin = join(root, 'steps.mjs');
    await writeFile(
      plugin,
      'export function register(r) { r.define(/^I capture 7$/, async (ctx) => { await ctx.capture({title:"Plugin image"}); }, {example:"I capture 7",description:"A custom capture"}); }',
    );
    await writeFile(feature, 'Feature: Steps\n Scenario: Custom figure\n  When I capture 7\n');
    const custom = { ...config, plugins: [plugin] };
    assert.equal((await validate(custom)).scenarios[0]!.captures, 0);
    const configPath = join(root, 'guide.config.json');
    await writeFile(configPath, JSON.stringify(custom));
    await setupEditor(configPath);
    const snippets = JSON.parse(
      await readFile(join(root, '.vscode/hooserguide.code-snippets'), 'utf8'),
    ) as Record<string, { body: string[] }>;
    const pluginSnippet = Object.values(snippets).find(
      (snippet) => snippet.body[0] === 'And I capture 7',
    );
    assert.deepEqual(pluginSnippet?.body, ['And I capture 7']);

    const outline = authoringSchema.parse(await lint(custom));
    assert.equal(outline.valid, true);
    assert.equal(outline.totals.captures, 0);
    assert.match(formatOutline(outline), /plugin may supply screenshots/);
    const result = await run(custom);
    assert.equal(result.report.status, 'passed', result.report.chapters[0]?.error);
    assert.equal(result.report.chapters[0]!.captures[0]!.title, 'Plugin image');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lint and execution preflight catch invalid selector shorthand without interpreting data as selectors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-selectors-'));
  try {
    const feature = join(root, 'guide.feature');
    const config = {
      title: 'Selectors',
      baseURL: 'http://127.0.0.1:1',
      features: [feature],
      output: join(root, 'runs'),
    };
    for (const step of [
      'When I click "role=button"',
      'When I drag "css=#task" to "testid="',
      'When I select "role=option" in "label="',
      'Then " " is visible',
      'When I fill the form:\n   | selector | value |\n   | role=button | name |',
      'And I capture "Extra"\n   """json\n   {"marks":[{"target":"role=button"}]}\n   """',
    ]) {
      await writeFile(
        feature,
        `Feature: Forms\n Scenario: Enter a value\n  Given I open "/"\n  ${step}\n  And I capture "Form"\n`,
      );
      const plan = await lint(config);
      assert.ok(
        plan.diagnostics.some((item) => item.code === 'STEP_ARGUMENT'),
        step,
      );
      await assert.rejects(run(config));
      assert.ok(!(await readdir(root)).includes('runs'));
    }
    await writeFile(
      feature,
      'Feature: Forms\n Scenario: Enter a value\n  When I fill "label=Name" with "role=literal"\n  Then "text=Saved" has text "css="\n  And I capture "Form"\n',
    );
    assert.ok((await validate(config)).valid);
    await assert.rejects(validate({ ...config, masks: ['role=button'] }), /Role selector/);
    await writeFile(
      feature,
      'Feature: Forms\n Scenario: Incorrect columns\n  When I fill the form:\n   | selector\\|value |\n   | one cell |\n  And I capture "Form"\n',
    );
    await assert.rejects(validate(config), /selector and value columns/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a mask which disappears on scroll fails before either image is written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-mask-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
    await page.setContent(
      '<style>body{margin:0;height:2500px}section{position:absolute;top:1600px}</style><section><h1>Result</h1><p class="private">Sample data</p></section>',
    );
    // A layout change retains the data but invalidates the configured mask.
    await page.evaluate(() =>
      addEventListener(
        'scroll',
        () => document.querySelector('.private')?.removeAttribute('class'),
        { once: true },
      ),
    );
    await assert.rejects(
      captureScreenshot(
        page,
        { title: 'Result', marks: [{ target: 'h1' }] },
        root,
        'result',
        ['.private'],
        250,
      ),
      /mask|toHaveCount/i,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a font which never finishes loading respects the capture timeout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-font-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    await page.route('**/pending.woff2', async (route) => {
      await gate;
      await route.abort().catch(() => {});
    });
    const requested = page.waitForRequest('**/pending.woff2');
    await page.setContent(
      '<style>@font-face{font-family:Pending;src:url(https://example.test/pending.woff2)}body{font-family:Pending}</style>Waiting for the font',
      { waitUntil: 'domcontentloaded' },
    );
    await requested;
    const watchdog = setTimeout(release, 3000);
    try {
      await assert.rejects(
        captureScreenshot(page, { title: 'Pending font' }, root, 'font', [], 250),
        /timeout/i,
      );
      assert.deepEqual(await readdir(root), []);
    } finally {
      clearTimeout(watchdog);
      release();
    }
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});
