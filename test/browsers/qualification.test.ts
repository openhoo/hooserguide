import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { captureScreenshot } from '../../src/capture.js';
import { run } from '../../src/runner.js';
import { inspectRun } from '../../src/evidence.js';
import type { Config } from '../../src/types.js';

const engines = { chromium, firefox, webkit };
const requested = process.env.HOOSERGUIDE_TEST_BROWSER;
if (requested && !Object.hasOwn(engines, requested))
  throw new Error(`Unknown test browser: ${requested}`);
const selected = Object.keys(engines).filter(
  (name) => !requested || requested === name,
) as (keyof typeof engines)[];

for (const engine of selected) {
  test(`${engine}: high-DPI scrolling, focus crops and both masked image variants align`, async () => {
    const root = await mkdtemp(join(tmpdir(), `hooserguide-${engine}-pixels-`));
    const browser = await engines[engine].launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 800, height: 600 },
        deviceScaleFactor: 2,
      });
      await page.setContent(
        '<style>body{margin:0;height:1900px}#panel{position:absolute;top:1400px;left:100px;width:300px;height:200px;background:white}#secret{position:absolute;top:20px;left:20px;width:100px;height:30px}#target{position:absolute;top:100px;left:40px;width:100px;height:30px;background:#00ff00}</style><section id=panel><span id=secret>PRIVATE</span><div id=target>Save</div></section>',
      );
      await page.locator('#panel').scrollIntoViewIfNeeded();
      const shot = await captureScreenshot(
        page,
        {
          title: 'Focused settings',
          focus: '#panel',
          padding: 24,
          autoLabels: 'letters',
          marks: [{ target: '#target', kind: 'both', caption: 'Save' }],
        },
        root,
        'focus',
        ['#secret'],
      );
      assert.deepEqual(shot.crop, { x: 76, y: 1376, width: 348, height: 248 });
      assert.deepEqual(shot.marks[0]!.bounds, { x: 64, y: 124, width: 100, height: 30 });
      for (const path of [shot.raw, shot.image]) {
        const { data, info } = await sharp(join(root, path))
          .raw()
          .toBuffer({ resolveWithObject: true });
        const at = (50 * info.width + 50) * info.channels;
        assert.deepEqual(
          [...data.subarray(at, at + 3)],
          [17, 24, 39],
          'Privacy mask differs between variants',
        );
        assert.equal(info.width, 348);
        assert.equal(info.height, 248);
      }
      const raw = await sharp(join(root, shot.raw)).raw().toBuffer({ resolveWithObject: true });
      const targetAt = (149 * raw.info.width + 154) * raw.info.channels;
      assert.deepEqual([...raw.data.subarray(targetAt, targetAt + 3)], [0, 255, 0]);
      const viewport = await captureScreenshot(
        page,
        { title: 'Scrolled viewport', marks: [{ target: '#target', label: '1' }] },
        root,
        'viewport',
        ['#secret'],
      );
      const bounds = await page.locator('#target').boundingBox();
      assert.deepEqual(viewport.marks[0]!.bounds, bounds);
      assert.equal(viewport.width, 800);
      const full = await captureScreenshot(
        page,
        { title: 'Full page', fullPage: true, marks: [{ target: '#target', label: 'A' }] },
        root,
        'full',
        ['#secret'],
      );
      assert.equal(full.marks[0]!.bounds.y, 1500);
      assert.equal(full.height, 1900);
      await assert.rejects(
        captureScreenshot(page, { title: 'Missing mask' }, root, 'missing', ['#absent-mask'], 100),
        /toHaveCount/,
      );
      if (process.env.HOOSERGUIDE_BROWSER_ARTIFACTS) {
        const destination = resolve(process.env.HOOSERGUIDE_BROWSER_ARTIFACTS, engine, 'pixels');
        await mkdir(destination, { recursive: true });
        await cp(root, destination, { recursive: true });
      }
    } finally {
      await browser.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test(`${engine}: saved-state BDD, PDF, failure evidence, mobile viewport and cancellation qualify`, async () => {
    const root = await mkdtemp(join(tmpdir(), `hooserguide-${engine}-workflow-`));
    const server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<meta name="viewport" content="width=device-width"><style>body{font:16px sans-serif}input,button{margin:12px}</style><h1>Settings</h1><p id=secret>private@example.test</p><label>Name<input id=name></label><button onclick="localStorage.setItem(\'name\',document.getElementById(\'name\').value)">Save</button><script>document.getElementById("name").value=localStorage.getItem("name")||""</script>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const feature = join(root, 'settings.feature');
      await writeFile(
        feature,
        'Feature: Settings\n Scenario: Save the name\n  Given I open "/"\n  When I fill "label=Name" with "Browser Demo"\n  And I click "role=button:Save"\n  And I reload the page\n  Then "label=Name" has value "Browser Demo"\n  And I explain "Save your display name and verify it survives reloading."\n  And I capture "Saved name"\n   """json\n   {"marks":[{"target":"label=Name","kind":"both","label":"A","caption":"Saved display name"}]}\n   """\n',
      );
      const config: Config = {
        title: `${engine} verified guide`,
        baseURL: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        features: [feature],
        output: join(root, 'out'),
        browser: engine,
        timeoutMs: 2000,
        masks: ['#secret'],
        profile: 'responsive',
        profiles: {
          responsive: {
            browser: engine,
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            ...(engine !== 'firefox' ? { isMobile: true, hasTouch: true } : {}),
          },
        },
      };
      const passed = await run(config);
      assert.equal(
        passed.report.status,
        'passed',
        passed.report.exportError ?? passed.report.chapters[0]?.error,
      );
      assert.equal(passed.report.browser, engine);
      assert.equal(passed.report.chapters[0]!.captures[0]!.width, 390);
      assert.equal((await inspectRun(passed.directory)).verifiedImages, 2);
      const matrix = await run({
        ...config,
        profile: undefined,
        pdf: false,
        profiles: {
          desktop: { browser: engine, viewport: { width: 1280, height: 800 } },
          mobile: config.profiles!.responsive!,
        },
        responsive: { profiles: ['desktop', 'mobile'], layout: 'side-by-side' },
      });
      assert.equal(matrix.report.status, 'passed', matrix.report.exportError);
      assert.deepEqual(
        matrix.report.chapters.map((c) => c.variant?.browser),
        [engine, engine],
      );
      assert.deepEqual(
        matrix.report.chapters.map((c) => c.captures[0]!.width),
        [1280, 390],
      );
      assert.equal((await inspectRun(matrix.directory)).verifiedImages, 4);

      const loading = getDocument({
        data: new Uint8Array(await readFile(passed.artifacts.pdf!)),
        useSystemFonts: true,
      });
      try {
        const pdf = await loading.promise;
        let content = '';
        for (let i = 1; i <= pdf.numPages; i++)
          content += (await (await pdf.getPage(i)).getTextContent()).items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ');
        assert.match(content, /Saved display name/);
        assert.match(content, /Page 1 of/);
      } finally {
        await loading.destroy();
      }
      const viewer = await engines[engine].launch();
      try {
        const page = await viewer.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto(`file://${passed.artifacts.html!}`);
        await page.locator('.toolbar').waitFor({ state: 'visible' });
        await page.locator('#guide-search').fill('no-match');
        assert.equal(await page.locator('#no-results').isVisible(), true);
        await page.locator('#guide-search').fill('');
        await page.locator('#annotations').click();
        assert.match((await page.locator('figure img').getAttribute('src')) ?? '', /\.raw\.png$/);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
      } finally {
        await viewer.close();
      }
      const failed = await run({ ...config, pdf: false, masks: ['#missing-mask'], timeoutMs: 100 });
      assert.equal(failed.report.status, 'failed');
      assert.equal(failed.artifacts.html, undefined);
      assert.equal(failed.artifacts.pdf, undefined);
      const abort = new AbortController();
      const cancelled = await run(
        { ...config, pdf: false },
        {
          signal: abort.signal,
          onProgress: (p) => {
            if (p.phase === 'executing' && p.completed === 1) abort.abort();
          },
        },
      );
      assert.equal(cancelled.report.status, 'failed');
      assert.match(cancelled.report.chapters[0]!.error ?? '', /cancelled/);
      assert.equal(cancelled.artifacts.html, undefined);
      if (process.env.HOOSERGUIDE_BROWSER_ARTIFACTS) {
        const destination = resolve(process.env.HOOSERGUIDE_BROWSER_ARTIFACTS, engine, 'workflow');
        await mkdir(destination, { recursive: true });
        await cp(join(root, 'out'), destination, { recursive: true });
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
}
