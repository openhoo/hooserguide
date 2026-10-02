import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { captureScreenshot, assignLabels, overlay } from '../src/capture.js';
import { layoutAnnotations, badgeTextColor } from '../src/annotations.js';
import { planImageSlices } from '../src/pdf-slices.js';
import { build } from '../src/build.js';
import { run } from '../src/runner.js';
import { reportSchema } from '../src/report.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { init } from '../src/scaffold.js';
import { loadConfig } from '../src/config.js';
import { main } from '../src/cli.js';
import { renderManual } from '../src/render.js';
import type { RunReport, Capture } from '../src/types.js';

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('dense references avoid each other and controls; edge boxes preserve actual bounds', () => {
  const marks = [0, 1, 2].map((i) => ({
    target: '#t',
    label: String(i + 1),
    bounds: { x: 80, y: 80 + i * 24, width: 160, height: 20 },
  }));
  const layouts = layoutAnnotations(400, 300, marks);
  for (const [i, l] of layouts.entries()) {
    assert.ok(l.badge);
    for (const m of marks)
      assert.equal(overlaps(l.badge!, m.bounds), false, 'Badge obscures a control');
    for (const previous of layouts.slice(0, i))
      assert.equal(overlaps(l.badge!, previous.badge!), false, 'Badges overlap');
    for (const previous of layouts.slice(0, i))
      assert.equal(overlaps(l.box, previous.box), false, 'Neighboring outlines overlap');
  }
  const edge = layoutAnnotations(400, 300, [
    { target: 'button', label: 'WWWW', bounds: { x: 0, y: 0, width: 100, height: 20 } },
  ])[0]!;
  assert.equal(edge.box.x + edge.box.width, 105);
  assert.ok(edge.badge!.width >= 58);
  const arrow = layoutAnnotations(400, 300, [
    {
      target: 'button',
      kind: 'arrow',
      from: { x: 3, y: 8 },
      label: 'A',
      bounds: { x: 100, y: 100, width: 50, height: 30 },
    },
  ])[0]!;
  assert.deepEqual(arrow.arrow!.from, { x: 3, y: 8 }, 'Explicit origins must not silently move');
  assert.equal(badgeTextColor('#ffffbb'), '#142636');
  assert.equal(badgeTextColor('#2563eb'), '#ffffff');
});

test('PDF slices cover every pixel and keep annotation groups together when space permits', () => {
  const capture = {
    width: 600,
    height: 1300,
    marks: [
      { target: 'a', kind: 'both', label: 'A', bounds: { x: 200, y: 360, width: 150, height: 50 } },
      { target: 'b', kind: 'box', label: 'B', bounds: { x: 200, y: 730, width: 100, height: 60 } },
    ],
  } as Capture;
  const slices = planImageSlices(capture, 450);
  assert.equal(slices[0]!.top, 0);
  assert.equal(slices.at(-1)!.top + slices.at(-1)!.height, 1300);
  for (const [i, s] of slices.entries()) {
    assert.ok(s.height > 0 && s.height <= 450);
    if (i) assert.equal(s.top, slices[i - 1]!.top + slices[i - 1]!.height);
  }
  for (const layout of layoutAnnotations(capture.width, capture.height, capture.marks)) {
    const top = Math.min(layout.box.y, layout.badge!.y, layout.arrow?.from.y ?? Infinity) - 5;
    const bottom =
      Math.max(
        layout.box.y + layout.box.height,
        layout.badge!.y + layout.badge!.height,
        layout.arrow?.from.y ?? 0,
      ) + 5;
    assert.ok(
      slices.some((s) => s.top <= top && s.top + s.height >= bottom),
      'Annotation split between pages',
    );
  }
  const tail = planImageSlices({ ...capture, height: 901, marks: [] }, 450);
  assert.ok(
    tail.every((s) => s.height >= 300),
    'Tiny continuation page',
  );
});

test('PDF long captions and instructions paginate without lost text or off-page rendering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-pdf-review-'));
  try {
    await cp('docs/demo', join(root, 'source'), { recursive: true });
    const report = JSON.parse(
      await readFile(join(root, 'source/report.json'), 'utf8'),
    ) as RunReport;
    report.title =
      'Advanced workspace administration and collaboration — a comprehensive handbook for new team members';
    report.chapters[0]!.instructions = Array.from(
      { length: 32 },
      (_, i) =>
        `Instruction ${i + 1}. ` +
        'Carefully configure the workspace and verify the result before continuing. '.repeat(5),
    );
    report.chapters[0]!.captures[0]!.description =
      'Use these highlighted controls to configure your task. '.repeat(10);
    report.chapters[0]!.captures[0]!.marks.forEach((m, i) => {
      m.caption =
        `Reference ${i + 1}. ` + 'Check this control and the displayed result. '.repeat(12);
    });
    await writeFile(join(root, 'source/report.json'), JSON.stringify(report));
    const result = await build(join(root, 'source'), { output: join(root, 'built') });
    assert.equal(result.report.status, 'passed', result.report.exportError);
    const audit = JSON.parse(await readFile(join(result.directory, 'pdf-layout.json'), 'utf8'));
    assert.deepEqual(audit.warnings, []);
    const loading = getDocument({
      data: new Uint8Array(await readFile(result.artifacts.pdf!)),
      useSystemFonts: true,
    });
    const pdf = await loading.promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      text += content.items.map((v) => ('str' in v ? v.str : '')).join(' ') + ' ';
    }
    assert.match(text, /Instruction 32/);
    assert.match(text, /Reference 3/);
    await loading.destroy();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('browser context setup failures publish failed evidence and clean staging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-context-review-'));
  try {
    const feature = join(root, 'test.feature');
    await writeFile(
      feature,
      'Feature: Setup\n Scenario: Broken session\n  Given I open "/"\n  And I capture "Home"\n',
    );
    const result = await run({
      title: 'Setup failure',
      baseURL: 'https://example.test',
      features: [feature],
      output: join(root, 'out'),
      storageState: join(root, 'missing.json'),
      pdf: false,
    });
    assert.equal(result.report.status, 'failed');
    assert.equal(result.report.chapters[0]!.status, 'failed');
    assert.equal(result.artifacts.html, undefined);
    assert.ok(reportSchema.safeParse(result.report).success);
    assert.equal(
      (await readdir(join(root, 'out'))).some((p) => p.startsWith('.run-')),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('caption references are painted and skip explicit numeric labels', () => {
  const marks = assignLabels({
    title: 'Refs',
    marks: [
      { target: 'a', label: '1' },
      { target: 'b', caption: 'Second' },
      { target: 'c', caption: 'Third' },
    ],
  });
  assert.deepEqual(
    marks.map((m) => m.label),
    ['1', '2', '3'],
  );
});

test('four wide characters retain padding inside the painted reference badge', async () => {
  const marks = [
    {
      target: 'a',
      label: 'WWWW',
      color: '#ffffbb',
      bounds: { x: 100, y: 80, width: 100, height: 30 },
    },
  ];
  const badge = layoutAnnotations(400, 200, marks)[0]!.badge!;
  const { data, info } = await sharp({
    create: { width: 400, height: 200, channels: 3, background: '#ffffff' },
  })
    .composite([{ input: Buffer.from(overlay(400, 200, marks)) }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  let pixels = 0;
  for (let y = Math.floor(badge.y); y < badge.y + badge.height; y++)
    for (let x = 0; x < info.width; x++) {
      const at = (y * info.width + x) * info.channels;
      if (data[at]! < 100 && data[at + 1]! < 100 && data[at + 2]! < 100) {
        pixels++;
        assert.ok(
          x >= badge.x + 4 && x < badge.x + badge.width - 4,
          'Reference text touches badge border',
        );
      }
    }
  assert.ok(pixels > 0, 'Reference text is missing');
});

test('mobile zoom and paused Web Animations align annotations with real raster pixels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-alignment-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      deviceScaleFactor: 2,
    });
    await page.setContent(
      '<style>body{margin:0}#t{position:absolute;left:100px;top:100px;width:100px;height:50px;background:#00ff00}</style><div id=t></div>',
    );
    for (const fullPage of [false, true]) {
      const shot = await captureScreenshot(
        page,
        { title: 'Scaled', fullPage, marks: [{ target: '#t', label: 'A' }] },
        root,
        `scale-${fullPage}`,
      );
      const pixels = await sharp(join(root, shot.raw)).raw().toBuffer({ resolveWithObject: true });
      const m = shot.marks[0]!.bounds;
      const at =
        (Math.round(m.y + 10) * pixels.info.width + Math.round(m.x + 10)) * pixels.info.channels;
      assert.deepEqual(
        [...pixels.data.subarray(at, at + 3)],
        [0, 255, 0],
        'Mark does not point at the green target',
      );
      if (!fullPage) assert.ok(m.x < 50);
    }
    const animated = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await animated.setContent(
      '<div id=t style="position:absolute;left:100px;top:100px;width:100px;height:50px;background:#00ff00"></div>',
    );
    await animated.evaluate(() => {
      const a = document
        .querySelector('#t')!
        .animate([{ transform: 'translateX(0)' }, { transform: 'translateX(400px)' }], {
          duration: 1000,
          fill: 'forwards',
        });
      a.pause();
      a.currentTime = 250;
    });
    const shot = await captureScreenshot(
      animated,
      { title: 'Animation', marks: [{ target: '#t', label: 'A' }] },
      root,
      'animation',
    );
    const { data, info } = await sharp(join(root, shot.raw))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (110 * info.width + Math.round(shot.marks[0]!.bounds.x + 10)) * info.channels;
    assert.deepEqual([...data.subarray(at, at + 3)], [0, 255, 0]);
    assert.equal(await animated.evaluate(() => document.getAnimations()[0]!.playState), 'paused');
    await animated.setContent(
      '<style>@keyframes move{from{transform:translateX(0)}to{transform:translateX(400px)}}#t{position:absolute;left:100px;top:100px;width:100px;height:50px;background:#00ff00;animation:move 1s linear forwards}</style><div id=t></div>',
    );
    await animated.evaluate(() => {
      const a = document.getAnimations()[0]!;
      a.pause();
      a.currentTime = 250;
    });
    const cssShot = await captureScreenshot(
      animated,
      { title: 'Paused CSS', marks: [{ target: '#t', label: 'A' }] },
      root,
      'css-animation',
    );
    assert.equal(Math.round(cssShot.marks[0]!.bounds.x), 200, 'CSS pose changed while capturing');
    assert.equal(await animated.evaluate(() => document.getAnimations()[0]!.playState), 'paused');
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('init preflights skill conflicts and invalid URLs without writing partial projects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-init-review-'));
  try {
    await mkdir(join(root, '.agents/skills/hooserguide-review'), { recursive: true });
    await assert.rejects(init(root, 'https://example.test', true), /Skill already exists/);
    assert.deepEqual(await readdir(root), ['.agents']);
    await assert.rejects(init(join(root, 'invalid'), 'file:///etc/passwd'), /HTTP/);
    await assert.rejects(readFile(join(root, 'invalid/hooserguide.config.json')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI rejects irrelevant flags and profile overrides supersede broken defaults', async () => {
  await assert.rejects(main(['steps', '--profile', 'mobile']), /not supported/);
  await assert.rejects(main(['demo', '--no-pdf']), /not supported/);
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-profile-review-'));
  try {
    const file = join(root, 'config.json');
    await writeFile(
      file,
      JSON.stringify({
        title: 'Guide',
        baseURL: 'https://example.test',
        features: ['*.feature'],
        profile: 'removed',
        profiles: { mobile: { viewport: { width: 390, height: 844 } } },
      }),
    );
    const config = await loadConfig(file, { profile: 'mobile' });
    assert.equal(config.profile, 'mobile');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('HTML remains usable for long content at narrow widths; old unlabeled captions invent no references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-html-review-'));
  const browser = await chromium.launch();
  try {
    const long = 'ExtremelyLongIdentifier'.repeat(12);
    const report: RunReport = {
      schemaVersion: 1,
      title: long,
      language: 'en',
      generatedAt: new Date().toISOString(),
      status: 'passed',
      browser: 'chromium',
      branding: { name: long },
      chapters: [
        {
          title: long,
          description: long,
          feature: 'Test',
          source: 'test.feature',
          tags: [],
          status: 'passed',
          instructions: [long],
          steps: [{ text: 'I capture "Figure"', status: 'passed' }],
          captures: [
            {
              id: '01',
              title: long,
              image: 'screenshots/01.png',
              raw: 'screenshots/01.raw.png',
              width: 400,
              height: 200,
              sha256: 'a'.repeat(64),
              marks: [
                {
                  target: 'button',
                  caption: 'Unlabeled legacy caption',
                  bounds: { x: 50, y: 50, width: 20, height: 20 },
                },
              ],
            },
          ],
        },
      ],
    };
    await mkdir(join(root, 'screenshots'), { recursive: true });
    const fixtureImage = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const fixtureCapture = report.chapters[0]!.captures[0]!;
    fixtureCapture.sha256 = fixtureCapture.rawSha256 = createHash('sha256')
      .update(fixtureImage)
      .digest('hex');
    await writeFile(join(root, fixtureCapture.image), fixtureImage);
    await writeFile(join(root, fixtureCapture.raw), fixtureImage);
    await renderManual(report, root);
    const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await page.goto('file://' + join(root, 'index.html'));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.equal(
      await page.locator('.ref').count(),
      0,
      'Legacy caption has no painted numeric badge',
    );
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});
