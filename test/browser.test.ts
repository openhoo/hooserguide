import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { captureScreenshot } from '../src/capture.js';
import { run, validate } from '../src/runner.js';
import { demo } from '../src/demo.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

test('real browser: CSS pixels, image annotations, fullpage scroll, masks and offscreen rejection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-browser-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 2,
    });
    await page.setContent(
      `<style>body{margin:0}#secret{position:absolute;left:10px;top:10px;width:100px;height:30px;background:#fff}#target{position:absolute;left:100px;top:120px;width:200px;height:80px;background:#ccc}#bottom{position:absolute;top:1400px;left:100px;width:200px;height:80px;background:#ccc}body{height:1600px}</style><div id=secret>PRIVATE DATA</div><div id=target>Target</div><div id=bottom>Bottom</div>`,
    );
    const screenshot = await captureScreenshot(
      page,
      {
        title: 'Annotated',
        marks: [{ target: '#target', kind: 'both', label: 'A', caption: 'Target' }],
      },
      root,
      'first',
      ['#secret'],
    );
    assert.equal(screenshot.width, 800);
    assert.equal(screenshot.height, 600);
    assert.deepEqual(screenshot.marks[0]!.bounds, { x: 100, y: 120, width: 200, height: 80 });
    const png = await readFile(join(root, screenshot.image));
    assert.equal(screenshot.sha256, createHash('sha256').update(png).digest('hex'));
    const raw = await sharp(join(root, screenshot.raw)).raw().toBuffer({ resolveWithObject: true });
    const index = (20 * raw.info.width + 20) * raw.info.channels;
    assert.deepEqual([...raw.data.subarray(index, index + 3)], [17, 24, 39]);
    const annotated = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const red = (115 * annotated.info.width + 150) * annotated.info.channels;
    assert.deepEqual([...annotated.data.subarray(red, red + 3)], [225, 29, 72]);
    assert.equal(await page.locator('svg').count(), 0);
    await page.locator('#bottom').scrollIntoViewIfNeeded();
    const full = await captureScreenshot(
      page,
      { title: 'Full', fullPage: true, marks: [{ target: '#bottom', kind: 'arrow', label: '1' }] },
      root,
      'full',
    );
    assert.equal(full.height, 1600);
    assert.equal(full.marks[0]!.bounds.y, 1400);
    await assert.rejects(
      captureScreenshot(
        page,
        { title: 'Wrong', marks: [{ target: '#target' }, { target: '#bottom' }] },
        root,
        'offscreen',
      ),
      /outside screenshot/,
    );
    await assert.rejects(
      captureScreenshot(page, { title: 'Privacy' }, root, 'missing-mask', ['#typo'], 100),
      /toHaveCount/,
    );
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('end to end demo produces pdfcn PDF, HTML, Markdown, hashes and readable long screenshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-demo-'));
  try {
    const result = await demo(root);
    assert.equal(result.report.status, 'passed', result.report.exportError);
    assert.equal(result.report.chapters.length, 2);
    assert.equal(result.report.chapters[0]!.captures.length, 2);
    assert.ok(result.artifacts.pdf);
    const bytes = await readFile(result.artifacts.pdf);
    assert.ok(bytes.subarray(0, 5).toString().startsWith('%PDF-'));
    const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const document = await loading.promise;
    assert.ok(document.numPages >= 6);
    let text = '';
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
    }
    assert.match(text, /Create your first task/);
    assert.match(text, /Save your preferences/);
    const metadata = await document.getMetadata();
    assert.match((metadata.info as { Creator: string }).Creator, /Forme/);
    await loading.destroy();
    const audit = JSON.parse(await readFile(join(result.directory, 'pdf-layout.json'), 'utf8'));
    assert.deepEqual(audit.warnings, []);
    for (const c of result.report.chapters)
      for (const image of c.captures) {
        const bytes = await readFile(join(result.directory, image.image));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256);
      }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failed saved-state assertions do not publish a handbook and subsequent runs are isolated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-failure-'));
  const server = createServer((_req, res) =>
    res.end('<h1>Welcome</h1><div id=result>Not saved</div>'),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const feature = join(root, 'fail.feature');
    await writeFile(
      feature,
      'Feature: Save\n Scenario: Saved state\n  Given I open "/"\n  And I capture "Before save"\n  Then "#result" has text "Saved"\n',
    );
    const config = {
      title: 'Failing guide',
      baseURL: `http://127.0.0.1:${address.port}`,
      features: [feature],
      output: join(root, 'out'),
      timeoutMs: 100,
    };
    const failed = await run(config);
    assert.equal(failed.report.status, 'failed');
    assert.equal(failed.report.chapters[0]!.steps.at(-1)!.status, 'failed');
    assert.equal(failed.artifacts.html, undefined);
    await assert.rejects(access(join(failed.directory, 'index.html')));
    await assert.rejects(access(join(failed.directory, 'handbook.pdf')));
    await writeFile(
      feature,
      'Feature: Save\n Scenario: Saved state\n  Given I open "/"\n  Then "role=heading:Welcome" is visible\n  And I capture "Welcome"\n',
    );
    const passed = await run({ ...config, pdf: false });
    assert.equal(passed.report.status, 'passed');
    assert.notEqual(passed.directory, failed.directory);
    await writeFile(feature, 'Feature: Save\n Scenario: Undefined\n  Given I make up actions\n');
    await assert.rejects(validate(config), /Undefined/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
