import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { run, validate } from '../src/runner.js';
import { resolveConfig } from '../src/config.js';
import { build } from '../src/build.js';
import { compareRuns } from '../src/compare.js';
import { bundle } from '../src/bundle.js';
import { inspectRun } from '../src/evidence.js';
import { applyCaptureDefaults, manualLabels } from '../src/manual.js';
import type { Config, RunReport } from '../src/types.js';

const feature = `@manual
Feature: Account
 @settings
 Scenario: Saved settings
  Given I open "/"
  Then "role=heading:Settings" is visible
  And I add a prerequisite "Sign in as an editor."
  And I add a note "Only your display name changes."
  And I add a tip "Choose a name your team recognizes."
  And I add a warning "Review changes before saving."
  And I explain "Select Save and check the confirmation."
  And I capture "Settings panel"
   """json
   {"marks":[{"target":"role=heading:Settings","kind":"both","caption":"Settings heading"}]}
   """
 @destructive
 Scenario: Production deletion
  Given I invent a destructive step
`;

test('selection, callouts, capture defaults, locale, PDF layouts, comparison and portable bundles integrate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-expand-'));
  const http = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<meta name="viewport" content="width=device-width"><h1>Settings</h1><p id="email">private@example.test</p><button>Save</button>',
    );
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  try {
    const file = join(root, 'account.feature');
    await writeFile(file, feature);
    const config: Config = {
      title: 'Konto-Handbuch',
      language: 'de-DE',
      baseURL: `http://127.0.0.1:${(http.address() as { port: number }).port}`,
      features: [file],
      output: join(root, 'out'),
      pdf: false,
      tagExpression: '@manual and (@settings or @other) and not @destructive',
      scenario: 'SAVED',
      masks: ['#email'],
      viewport: { width: 640, height: 480 },
      document: {
        version: '3.0',
        productVersion: '2026.10',
        audience: 'Redaktion',
        summary: 'Konto sicher verwalten.',
      },
      captureDefaults: { autoLabels: 'letters', color: '#2563eb', fullPage: true },
      manual: { contents: false, showGeneratedAt: false },
    };
    const plan = await validate(config);
    assert.equal(plan.scenarios.length, 1);
    assert.equal(plan.scenarios[0]!.captures, 1);
    assert.ok(plan.scenarios[0]!.tags.includes('@settings'));
    assert.throws(
      () => resolveConfig({ ...config, tagExpression: '@manual and (' }),
      /Invalid Cucumber/,
    );
    await assert.rejects(validate({ ...config, scenario: 'absent' }), /No scenarios/);
    const generated = await run(config, {
      onProgress: () => {
        throw new Error('observer failed');
      },
    });
    assert.equal(generated.report.status, 'passed');
    const chapter = generated.report.chapters[0]!,
      shot = chapter.captures[0]!;
    assert.equal(chapter.callouts?.length, 3);
    assert.deepEqual(chapter.prerequisites, ['Sign in as an editor.']);
    assert.equal(shot.marks[0]!.label, 'A');
    assert.equal(shot.marks[0]!.color, '#2563eb');
    assert.equal((await inspectRun(generated.directory)).verifiedImages, 2);
    assert.equal(generated.report.selection?.scenario, 'SAVED');
    const md = await readFile(generated.artifacts.markdown!, 'utf8');
    assert.match(md, /Voraussetzungen/);
    assert.match(md, /\*\*Warnung:\*\*/);
    assert.ok(!md.includes('## Inhalt'));
    assert.ok(!md.includes(generated.report.generatedAt));
    const html = await readFile(generated.artifacts.html!, 'utf8');
    assert.match(html, /Handbuch durchsuchen/);
    assert.match(html, /Handbuchversion: 3.0/);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      // Inline script runs without a network or module dependency, including from local files.
      await page.goto(`file://${generated.artifacts.html!}`);
      await page.locator('.toolbar').waitFor({ state: 'visible' });
      await page.locator('#guide-search').fill('recognizes');
      assert.equal(await page.locator('main > section:visible').count(), 1);
      await page.locator('#guide-search').fill('no-such-chapter');
      assert.equal(await page.locator('main > section:visible').count(), 0);
      assert.equal(await page.locator('#no-results').isVisible(), true);
      await page.locator('#guide-search').fill('');
      await page.locator('#annotations').click();
      assert.match((await page.locator('figure img').getAttribute('src')) ?? '', /\.raw\.png$/);
      assert.equal(await page.locator('.legend').isVisible(), false);
      await page.locator('#annotations').click();
      assert.equal(await page.locator('.legend').isVisible(), true);
      await page.evaluate(() => {
        window.print = () => {
          document.body.dataset.printReady = String(
            [...document.querySelectorAll<HTMLImageElement>('figure img')].every(
              (image) => image.loading === 'eager' && image.complete && image.naturalWidth > 0,
            ),
          );
        };
      });
      await page.locator('#print-guide').click();
      await page.waitForFunction(() => document.body.dataset.printReady === 'true');
      await page.locator('#guide-search').fill('missing');
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('main > section:visible').count(), 1);
      assert.equal(await page.locator('.callout:visible').count(), 3);
      await page.emulateMedia({ media: 'screen' });
      await page.locator('#guide-search').fill('');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    } finally {
      await browser.close();
    }
    for (const pageSize of ['A4', 'Letter'] as const)
      for (const orientation of ['portrait', 'landscape'] as const) {
        const rebuilt = await build(generated.directory, {
          output: join(root, 'rebuilt'),
          manual: { pageSize, orientation, margin: 36 },
          document: { version: '3.1' },
        });
        assert.equal(rebuilt.report.status, 'passed', rebuilt.report.exportError);
        const loading = getDocument({
          data: new Uint8Array(await readFile(rebuilt.artifacts.pdf!)),
          useSystemFonts: true,
        });
        const pdf = await loading.promise;
        try {
          const first = await pdf.getPage(1),
            viewport = first.getViewport({ scale: 1 });
          assert.equal(viewport.width > viewport.height, orientation === 'landscape');
          assert.ok(
            Math.abs(
              Math.min(viewport.width, viewport.height) - (pageSize === 'Letter' ? 612 : 595.28),
            ) < 0.1,
          );
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++)
            text += (await (await pdf.getPage(i)).getTextContent()).items
              .map((item) => ('str' in item ? item.str : ''))
              .join(' ');
          assert.match(text, /Benutzerhandbuch/i);
          assert.match(text, /Voraussetzungen/);
          assert.match(text, /Warnung/);
          assert.match(text, /Review changes before saving/);
          assert.ok(!text.includes('Contents'));
          assert.ok(!text.includes(generated.report.generatedAt.slice(0, 10)));
        } finally {
          await loading.destroy();
        }
        const compared = await compareRuns(generated.directory, rebuilt.directory);
        assert.equal(compared.metadataChanged, true);
        assert.equal(compared.totals.unchanged, 1);
      }
    await writeFile(
      file,
      feature.replace('Select Save and check the confirmation.', 'Check all fields before saving.'),
    );
    const next = await run({
      ...config,
      captureDefaults: { ...config.captureDefaults, color: '#e11d48' },
    });
    const changed = await compareRuns(generated.directory, next.directory);
    assert.equal(changed.totals.changed, 1);
    assert.equal(changed.chapters[0]!.captures[0]!.pixelsChanged, false);
    assert.equal(changed.chapters[0]!.captures[0]!.annotationsChanged, true);
    const archive = await bundle(generated.directory, join(root, 'share.zip'));
    const zipped = unzipSync(await readFile(archive.path));
    assert.ok(
      zipped['index.html'] && zipped['handbook.md'] && zipped[shot.image] && zipped[shot.raw],
    );
    assert.ok(!Object.keys(zipped).some((path) => /config|storage|plugin/.test(path)));
    assert.ok(!Buffer.from(zipped['report.json']!).toString().includes(root));
    const manifest = JSON.parse(Buffer.from(zipped['bundle-manifest.json']!).toString()) as {
      files: { path: string; bytes: number; sha256: string }[];
    };
    for (const entry of manifest.files) {
      assert.equal(zipped[entry.path]!.length, entry.bytes);
      assert.equal(createHash('sha256').update(zipped[entry.path]!).digest('hex'), entry.sha256);
    }
    await assert.rejects(bundle(generated.directory, archive.path), /EEXIST/);
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      bundle(generated.directory, join(root, 'cancelled.zip'), { signal: cancelled.signal }),
      /cancelled/,
    );
    const recompressed = join(root, 'recompressed');
    await cp(generated.directory, recompressed, { recursive: true });
    const identicalPixels = await sharp(join(recompressed, shot.raw))
      .png({ compressionLevel: 0 })
      .toBuffer();
    const recompressedReport = structuredClone(generated.report);
    recompressedReport.chapters[0]!.captures[0]!.rawSha256 = createHash('sha256')
      .update(identicalPixels)
      .digest('hex');
    await writeFile(join(recompressed, shot.raw), identicalPixels);
    await writeFile(join(recompressed, 'report.json'), JSON.stringify(recompressedReport));
    const encodingOnly = await compareRuns(generated.directory, recompressed);
    assert.equal(encodingOnly.chapters[0]!.captures[0]!.pixelsChanged, false);
    assert.equal(encodingOnly.totals.unchanged, 1);
    const copy = join(root, 'duplicate');
    await cp(generated.directory, copy, { recursive: true });
    const report = structuredClone(generated.report);
    report.chapters.push(report.chapters[0]!);
    await writeFile(join(copy, 'report.json'), JSON.stringify(report));
    await assert.rejects(compareRuns(generated.directory, copy), /duplicate screenshot/);
    await writeFile(join(copy, 'report.json'), JSON.stringify(generated.report));
    await rm(join(copy, shot.image));
    await symlink(join(generated.directory, shot.image), join(copy, shot.image));
    await assert.rejects(bundle(copy, join(root, 'unsafe.zip')), /outside/);
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('fail-fast records skipped scenarios and prevents subsequent app actions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-fast-'));
  const http = createServer((_req, res) => res.end('<h1>Ready</h1>'));
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  try {
    const path = join(root, 'fast.feature');
    await writeFile(
      path,
      'Feature: Stop\n Scenario: Fail\n  Given I open "/"\n  Then "#missing" is visible\n  And I capture "Failure"\n Scenario: Must be skipped\n  Given I open "/"\n  And I capture "Later"\n',
    );
    const result = await run({
      title: 'Stop',
      baseURL: `http://127.0.0.1:${(http.address() as { port: number }).port}`,
      features: [path],
      output: join(root, 'out'),
      pdf: false,
      timeoutMs: 100,
      failFast: true,
    });
    assert.equal(result.report.status, 'failed');
    assert.equal(result.report.chapters.length, 1);
    assert.equal(result.report.skippedScenarios?.[0]?.reason, 'fail-fast');
    assert.equal(result.report.skippedScenarios?.[0]?.title, 'Must be skipped');
    assert.equal(result.artifacts.html, undefined);
    await assert.rejects(bundle(result.directory), /unsuccessful/);
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('capture defaults respect focused crops and explicit per-capture overrides', () => {
  assert.equal(manualLabels('de-CH').guide, 'Benutzerhandbuch');
  assert.equal(manualLabels('den').guide, 'User guide');
  const spec = applyCaptureDefaults(
    {
      title: 'Panel',
      focus: '#panel',
      autoLabels: 'numbers',
      marks: [{ target: '#button', color: '#abcdef' }],
    },
    { fullPage: true, padding: 40, color: '#123456', autoLabels: 'letters' },
  );
  assert.equal(spec.fullPage, undefined);
  assert.equal(spec.padding, 40);
  assert.equal(spec.autoLabels, 'numbers');
  assert.equal(spec.marks?.[0]?.color, '#abcdef');
});

test('long callouts paginate in landscape without losing content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-callouts-'));
  try {
    const source = join(root, 'source');
    await cp('docs/demo', source, { recursive: true });
    const report = JSON.parse(await readFile(join(source, 'report.json'), 'utf8')) as RunReport;
    report.chapters[0]!.callouts = [
      {
        kind: 'warning',
        text: 'Review each setting before saving. '.repeat(160) + 'END OF WARNING',
      },
    ];
    await writeFile(join(source, 'report.json'), JSON.stringify(report));
    const result = await build(source, {
      output: join(root, 'out'),
      manual: { pageSize: 'Letter', orientation: 'landscape', margin: 36, theme: 'midnight' },
    });
    assert.equal(result.report.status, 'passed', result.report.exportError);
    const loading = getDocument({
      data: new Uint8Array(await readFile(result.artifacts.pdf!)),
      useSystemFonts: true,
    });
    try {
      const pdf = await loading.promise;
      let content = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = pdf.canvasFactory.create(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await page.render({ canvasContext: canvas.context, canvas: canvas.canvas, viewport })
          .promise;
        assert.deepEqual(
          [...canvas.context.getImageData(2, 2, 1, 1).data].slice(0, 3),
          [21, 34, 56],
          `Missing dark background on overflow page ${i}`,
        );
        pdf.canvasFactory.destroy(canvas);
        const pageText = (await page.getTextContent()).items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        assert.ok(
          pageText.includes(`Page ${i} of ${pdf.numPages}`),
          `Missing footer on overflow page ${i}`,
        );
        content += pageText;
      }
      assert.match(content, /END OF WARNING/);
      assert.equal(
        content.replace(/\s+/g, ' ').match(/Review each setting before saving\./g)?.length,
        160,
      );
    } finally {
      await loading.destroy();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
