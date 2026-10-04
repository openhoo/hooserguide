import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { lint, formatOutline, authoringSchema } from '../src/authoring.js';
import { chapterTemplate, newChapter, setupEditor } from '../src/authoring-scaffold.js';
import { init } from '../src/scaffold.js';
import { parseFeature } from '../src/gherkin.js';
import { run, validate } from '../src/runner.js';
import type { Config } from '../src/types.js';
import { chromium } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const exec = promisify(execFile);
const config = (root: string): Config => ({
  title: 'Guide',
  baseURL: 'http://127.0.0.1:1',
  features: [join(root, '*.feature')],
  output: join(root, 'out'),
});
const cli = (args: string[]) =>
  exec(process.execPath, ['--import', 'tsx', resolve('src/cli.ts'), ...args]);

test('authoring collects errors across files with exact source locations and safe step suggestions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-authoring-'));
  try {
    await writeFile(
      join(root, 'a.feature'),
      `Feature: Errors\n Scenario: Broken step\n  When I clicks "role=button:Save"\n  And I fill the form:\n   | wrong | value |\n   | Name | Demo |\n  And I capture "Result"\n   """json\n   {"marks":[{"target":"button","label":"!"}]}\n   """\n Scenario: Missing screenshot\n  Given I open "/"\n`,
    );
    await writeFile(join(root, 'b.feature'), 'Not valid Gherkin\n');
    const reviewed = authoringSchema.parse(await lint(config(root)));
    assert.equal(reviewed.valid, false);
    assert.equal(reviewed.executed, false);
    assert.equal(reviewed.totals.files, 2);
    assert.equal(reviewed.totals.errors, 5);
    const undefinedStep = reviewed.diagnostics.find((item) => item.code === 'UNDEFINED_STEP')!;
    assert.equal(undefinedStep.line, 3);
    assert.equal(undefinedStep.column, 3);
    assert.equal(undefinedStep.suggestions?.[0], 'I click "role=button:Save"');
    assert.deepEqual(
      reviewed.diagnostics.filter((item) => item.code === 'STEP_ARGUMENT').map((item) => item.line),
      [4, 7],
    );
    assert.ok(
      reviewed.diagnostics.some(
        (item) => item.code === 'GHERKIN_SYNTAX' && item.source.endsWith('b.feature'),
      ),
    );
    assert.ok(
      reviewed.diagnostics.some((item) => item.code === 'MISSING_CAPTURE' && item.line === 11),
    );
    assert.ok(!(await readdir(root)).includes('out'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('outline handles backgrounds, rule scenarios, examples rows, exclusions and responsive counts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-outline-'));
  try {
    await writeFile(
      join(root, 'tasks.feature'),
      `@manual\nFeature: Tasks\n Shared introduction.\n Background:\n  Given I open "/"\n Rule: Editors\n  Scenario Outline: Read <name>\n   Specific chapter introduction.\n   When I explain "Look at <name>."\n   Then "text=<name>" is visible\n   And I capture "<name>"\n    """json\n    {"description":"The selected task."}\n    """\n   Examples:\n    | name |\n    | One |\n    | Two |\n  @draft\n  Scenario: Draft\n   And I explain "This chapter is excluded."\n   And I capture "Draft"\n`,
    );
    const c = {
      ...config(root),
      tagExpression: '@manual and not @draft',
      profiles: { desktop: {}, mobile: { viewport: { width: 390, height: 844 } } },
      responsive: { profiles: ['desktop', 'mobile'] },
    };
    const result = await lint(c);
    assert.equal(result.valid, true);
    assert.equal(result.totals.chapters, 3);
    assert.equal(result.totals.selected, 2);
    assert.equal(result.totals.executions, 4);
    assert.equal(result.totals.captures, 4);
    assert.deepEqual(
      result.chapters.slice(0, 2).map((chapter) => chapter.line),
      [17, 18],
    );
    assert.equal(result.chapters[0]!.description, 'Specific chapter introduction.');
    assert.equal(result.chapters[0]!.captures[0]!.line, 11);
    assert.equal(result.chapters[0]!.assertions, 1);
    assert.deepEqual(result.chapters[2]!.instructions, ['This chapter is excluded.']);
    assert.match(formatOutline(result), /Draft \(excluded\)/);
    const empty = await lint({ ...c, scenario: 'Absent' });
    assert.ok(empty.diagnostics.some((item) => item.code === 'NO_SELECTION'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI distinguishes errors, editorial warnings, strict review and a plan from execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-cli-'));
  try {
    const project = await init(root);
    await writeFile(
      project.feature,
      (await readFile(project.feature, 'utf8')).replace(
        '    And I explain "Review the welcome page before getting started."\n',
        '',
      ),
    );
    const normal = JSON.parse((await cli(['lint', '--config', project.config, '--json'])).stdout);
    assert.equal(normal.valid, true);
    assert.equal(normal.executed, false);
    assert.ok(normal.totals.warnings > 0);
    await assert.rejects(
      cli(['lint', '--config', project.config, '--strict', '--json']),
      (error: any) => {
        assert.equal(error.code, 1);
        assert.equal(JSON.parse(error.stdout).valid, true);
        return true;
      },
    );
    assert.match(
      (await cli(['outline', '--config', project.config])).stdout,
      /no application workflows have been executed/,
    );
    const searched = JSON.parse((await cli(['steps', '--search', 'multiline', '--json'])).stdout);
    assert.deepEqual(
      searched.steps.map((step: any) => step.example),
      ['I explain:'],
    );
    await writeFile(
      project.feature,
      '@manual\nFeature: Broken\n Scenario: Unknown\n  When I invent a step\n',
    );
    await assert.rejects(cli(['lint', '--config', project.config, '--json']), (error: any) => {
      assert.equal(error.code, 1);
      assert.ok(
        JSON.parse(error.stdout).diagnostics.some((item: any) => item.code === 'UNDEFINED_STEP'),
      );
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('editor setup and chapter templates work in a consumer project and preserve existing editor files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-editor-'));
  try {
    await mkdir(join(root, '.vscode'));
    await writeFile(join(root, '.vscode/settings.json'), '{"editor.fontSize":17}');
    const project = await init(root, undefined, true, true);
    assert.ok(project.editor!.snippets > 30);
    assert.equal(
      await readFile(join(root, '.vscode/settings.json'), 'utf8'),
      '{"editor.fontSize":17}',
    );
    const workspace = JSON.parse(await readFile(project.editor!.workspace, 'utf8'));
    assert.equal(workspace.tasks.tasks[0].args[2], 'lint');
    const snippets = JSON.parse(
      await readFile(join(root, '.vscode/hooserguide.code-snippets'), 'utf8'),
    );
    assert.equal(
      Object.values(snippets).filter((item: any) => item.prefix.startsWith('hg-chapter')).length,
      3,
    );
    const capture: any = Object.values(snippets).find((item: any) =>
      item.body[0].includes('I capture '),
    );
    const expanded = capture.body.join('\n').replace(/\$\{\d+:([^}]*)\}/g, '$1');
    const snippetFile = join(root, 'features/snippet.feature');
    await writeFile(
      snippetFile,
      'Feature: Snippet\n Scenario: Capture\n  ' + expanded.split('\n').join('\n  ') + '\n',
    );
    await validate({ ...config(root), features: [snippetFile] });
    for (const template of ['task', 'form', 'read-only'] as const) {
      const created = await newChapter(project.config, `${template} chapter`, { template });
      assert.equal((await parseFeature(created.feature)).pickles.length, 1);
      await validate({ ...config(root), features: [created.feature] });
      assert.ok(
        (await lint({ ...config(root), features: [created.feature] })).diagnostics.some(
          (item) => item.code === 'PLACEHOLDER',
        ),
      );
      await assert.rejects(newChapter(project.config, `${template} chapter`, { template }), {
        code: 'EEXIST',
      });
    }
    await assert.rejects(setupEditor(project.config), /Refusing to overwrite/);
    assert.throws(() => chapterTemplate('Injected\nScenario: Surprise'), /single line/);
    assert.throws(() => chapterTemplate('Test', 'unknown' as any), /Unknown chapter template/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('multiline prose and scenario introductions survive real execution and malformed arguments fail preflight', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-prose-'));
  let requests = 0;
  const http = createServer((_req, res) => {
    requests++;
    res.end('<h1>Welcome</h1>');
  });
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
  try {
    const source = join(root, 'welcome.feature');
    await writeFile(
      source,
      `Feature: Welcome\n Feature summary.\n Scenario: Read the page\n  Chapter introduction.\n  Given I open "/"\n  Then "role=heading:Welcome" is visible\n  And I explain:\n   """text\n   Read the welcome heading.\n\n   Then continue with your task.\n   """\n  And I capture "Welcome"\n`,
    );
    const c = {
      ...config(root),
      baseURL: `http://127.0.0.1:${(http.address() as any).port}`,
      pdf: true,
    };
    const reviewed = await lint(c);
    assert.equal(reviewed.chapters[0]!.assertions, 1);
    assert.equal(requests, 0);
    const result = await run(c);
    assert.equal(result.report.status, 'passed');
    assert.equal(result.report.chapters[0]!.description, 'Chapter introduction.');
    assert.deepEqual(result.report.chapters[0]!.instructions, [
      'Read the welcome heading.\n\nThen continue with your task.',
    ]);
    assert.match(await readFile(result.artifacts.html!, 'utf8'), /Chapter introduction/);
    assert.match(
      await readFile(result.artifacts.markdown!, 'utf8'),
      /1\. Read the welcome heading\.\n *\n   Then continue/,
    );
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(new URL('file://' + result.artifacts.html!).href);
      assert.equal(
        await page
          .locator('.instructions li')
          .evaluate((element) => getComputedStyle(element).whiteSpace),
        'pre-line',
      );
      assert.match((await page.locator('.instructions li').textContent()) ?? '', /\n\n/);
    } finally {
      await browser.close();
    }
    const loading = getDocument({
      data: new Uint8Array(await readFile(result.artifacts.pdf!)),
      useSystemFonts: true,
      verbosity: 0,
    });
    try {
      const pdf = await loading.promise;
      let text = '';
      for (let page = 1; page <= pdf.numPages; page++)
        text += (await (await pdf.getPage(page)).getTextContent()).items
          .map((item: any) => item.str ?? '')
          .join(' ');
      assert.match(text, /Chapter introduction/);
      assert.match(text, /Then continue with your task/);
    } finally {
      await loading.destroy();
    }
    const before = requests;
    await writeFile(
      source,
      'Feature: Bad prose\n Scenario: Empty\n  Given I open "/"\n  And I explain:\n',
    );
    await assert.rejects(run(c), /non-empty text docstring/);
    assert.equal(requests, before);
    await writeFile(
      source,
      'Feature: Bad capture\n Scenario: Empty\n  Given I open "/"\n  And I capture "Bad"\n   """json\n   null\n   """\n',
    );
    await assert.rejects(run(c), /JSON object/);
    assert.equal(requests, before);
  } finally {
    await new Promise<void>((done) => http.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
