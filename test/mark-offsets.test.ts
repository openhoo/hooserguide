import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import { layoutAnnotations } from '../src/annotations.js';
import { auditRun } from '../src/audit.js';
import { overlay, validateCapture } from '../src/capture.js';
import { inspectRun } from '../src/evidence.js';
import { run } from '../src/runner.js';
import type { CaptureSpec, ResolvedMark } from '../src/types.js';

const bounds = { x: 140, y: 100, width: 80, height: 40 };
const target = '#apply';
const mark = { target, bounds };

test('empty and zero adjustments preserve the original overlay for boxes, arrows and leaders', () => {
  for (const style of [
    { kind: 'box' },
    { kind: 'both', from: { x: 360, y: 125 } },
    { kind: 'both', leader: { side: 'bottom' } },
  ] as const) {
    const original = { ...mark, ...style, label: 'A' };
    const untouched = overlay(500, 360, [original]);
    for (const adjustment of [
      { offset: {}, padding: {} },
      { offset: { x: 0, y: 0 }, padding: 0 },
      { padding: { right: 0, bottom: 0 } },
    ]) {
      validateCapture({ title: 'Control', marks: [{ target, ...style, ...adjustment }] });
      assert.equal(overlay(500, 360, [{ ...original, ...adjustment }]), untouched);
    }
  }
});

test('scalar expansion and inset are symmetric; partial signed coordinates keep fractional CSS pixels', () => {
  const box = (opts: Partial<ResolvedMark>) =>
    layoutAnnotations(500, 360, [{ ...mark, ...opts }])[0]!.box;
  assert.deepEqual(box({ padding: 4 }), { x: 131, y: 91, width: 98, height: 58 });
  assert.deepEqual(box({ padding: -4 }), { x: 139, y: 99, width: 82, height: 42 });
  assert.deepEqual(box({ offset: { x: -2.5 }, padding: { bottom: 3.25 } }), {
    x: 132.5,
    y: 95,
    width: 90,
    height: 53.25,
  });
  assert.deepEqual(box({ offset: { y: 2.5 } }), { x: 135, y: 97.5, width: 90, height: 50 });
});

test('fixed leaders point to the adjusted edge while the badge and legacy arrow keep their absolute origin', () => {
  const from = { x: 350, y: 108 };
  const adjusted = {
    ...mark,
    label: 'A',
    kind: 'both',
    from,
    offset: { x: 16, y: -10 },
    padding: { left: 4, top: 8, right: 14, bottom: 4 },
  } as const;
  for (const opts of [adjusted, { ...adjusted, leader: {} }]) {
    const { box, arrow, badge } = layoutAnnotations(500, 360, [opts])[0]!;
    assert.deepEqual(box, { x: 147, y: 77, width: 108, height: 62 });
    assert.ok(arrow && badge);
    assert.deepEqual(arrow.to, { x: 255, y: 108 });
    if ('leader' in opts) {
      assert.deepEqual({ x: badge.x + badge.width / 2, y: badge.y + badge.height / 2 }, from);
      assert.equal(arrow.from.x, badge.x);
    } else assert.deepEqual(arrow.from, from);
  }
  assert.deepEqual(adjusted.bounds, { x: 140, y: 100, width: 80, height: 40 });
});

test('automatic leader badges prefer open space outside the measured control, while explicit placement remains exact', () => {
  const adjusted = {
    target,
    label: 'A',
    leader: {},
    offset: { x: 120 },
    bounds: { x: 140, y: 100, width: 100, height: 40 },
  };
  const { badge } = layoutAnnotations(500, 360, [adjusted])[0]!;
  assert.ok(badge);
  assert.ok(
    badge.x + badge.width <= 140 ||
      badge.x >= 240 ||
      badge.y + badge.height <= 100 ||
      badge.y >= 140,
    'The measured control has an unobstructed alternative.',
  );
  const from = { x: 167, y: 120 };
  const fixed = layoutAnnotations(500, 360, [{ ...adjusted, from }])[0]!.badge!;
  assert.deepEqual({ x: fixed.x + fixed.width / 2, y: fixed.y + fixed.height / 2 }, from);
  // The adjusted control can live inside a much larger transparent interactive wrapper.
  const wrapped = {
    target,
    label: 'B',
    leader: {},
    bounds: { x: 5, y: 5, width: 490, height: 350 },
    padding: { left: -205, right: -205, top: -149, bottom: -148 },
  };
  assert.ok(layoutAnnotations(500, 360, [wrapped])[0]?.badge);
});

test('invalid adjustments fail before drawing and disjoint marks cannot be moved over each other', () => {
  for (const adjustment of [
    { padding: { left: -80 } },
    { padding: -21 },
    { offset: { x: -141 } },
    { offset: { y: 222 } },
    { padding: { right: 281 } },
  ]) {
    assert.throws(
      () => overlay(500, 360, [{ ...mark, ...adjustment }]),
      /adjust|collaps|outside|positive|bounds|padding|offset/i,
    );
  }
  const neighbor = { target: '#revert', bounds: { x: 235, y: 100, width: 45, height: 40 } };
  for (const adjustment of [{ padding: { right: 20 } }, { offset: { x: 135 } }]) {
    const changed = { ...mark, ...adjustment };
    for (const pair of [
      [changed, neighbor],
      [neighbor, changed],
    ]) {
      assert.throws(
        () => layoutAnnotations(500, 360, pair),
        /overlap|encroach|neighbor|another|cover|colli/i,
      );
    }
  }
  // Their adjusted rectangles meet in the gap, clear of either measured element.
  const far = { target: '#far', bounds: { x: 400, y: 100, width: 40, height: 40 } };
  assert.throws(
    () =>
      layoutAnnotations(500, 360, [
        { ...mark, offset: { x: 110 } },
        { ...far, offset: { x: -100 } },
      ]),
    /overlap|encroach|neighbor|another|cover|colli/i,
  );
  for (const invalid of [
    { offset: { z: 3 } },
    { padding: { start: 2 } },
    { padding: Infinity },
    { offset: { y: -2001 } },
  ]) {
    assert.throws(() =>
      validateCapture({ title: 'Controls', marks: [{ target, ...invalid }] } as CaptureSpec),
    );
  }
});

const pageHtml = `<style>
  * {box-sizing:border-box} body {margin:0;height:1800px}
  #panel {position:absolute;left:54px;top:810px;width:410px;height:900px;background:#fff}
  #settings {position:relative;width:410px;height:275px}
  #apply {position:absolute;left:140px;top:122px;width:84px;height:32px;background:#009966}
  #secret {position:absolute;left:25px;top:20px;width:60px;height:25px}
  #area {position:absolute;left:92px;top:330px;width:140px;height:424px}
  #area span {position:absolute;bottom:0;height:49px;width:100%;background:#eee}
  </style><main id="panel"><section id="settings"><span id="secret">Private</span><div id="apply">Apply</div></section>
  <div id="area"><span>Delivery status</span></div></main>`;

test('focused high-DPI captures retain observed bounds and matched raw hashes; PDF legends follow the visible outline', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'guide-mark-offsets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plugin = join(root, 'panel.mjs'),
    feature = join(root, 'settings.feature');
  await writeFile(
    plugin,
    `export function register(r) { r.define(/^I view settings$/, async ({page}) => {
    await page.setContent(${JSON.stringify(pageHtml)});
    await page.locator('#settings').scrollIntoViewIfNeeded();
  }); }`,
  );
  const color = '#c800cc',
    offset = { x: 14, y: -9 },
    padding = { left: -4, top: 6, right: 10, bottom: -2 };
  const makeCapture = (
    title: string,
    focus: string,
    m: NonNullable<CaptureSpec['marks']>[number],
  ) =>
    `  And I capture "${title}"\n   """json\n   ${JSON.stringify({ focus, padding: 10, marks: [m] })}\n   """\n`;
  const badge = { target, color, label: 'A', caption: 'Apply the settings.' };
  const caption = 'Read the delivery status.';
  await writeFile(
    feature,
    'Feature: Settings\n Scenario: Check the panel\n  Given I view settings\n' +
      makeCapture('Original', '#settings', badge) +
      makeCapture('Adjusted', '#settings', { ...badge, offset, padding }) +
      makeCapture('Tall panel', '#panel', {
        target: '#area',
        label: 'B',
        color,
        caption,
        padding: { top: -375 },
      }),
  );
  const result = await run({
    title: 'Settings',
    baseURL: 'http://localhost',
    features: [feature],
    plugins: [plugin],
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 2,
    masks: ['#secret'],
    output: join(root, 'runs'),
  });
  assert.equal(
    result.report.status,
    'passed',
    result.report.chapters[0]?.error ?? result.report.exportError,
  );
  const inspected = await inspectRun(result.directory);
  assert.equal(inspected.verifiedImages, 6);
  const [original, adjusted, tall] = inspected.report.chapters[0]!.captures;
  assert.ok(original && adjusted && tall);
  assert.deepEqual(adjusted.crop, { x: 44, y: 800, width: 430, height: 295 });
  assert.deepEqual(original.crop, adjusted.crop);
  assert.deepEqual(adjusted.marks[0]!.bounds, { x: 150, y: 132, width: 84, height: 32 });
  assert.deepEqual(adjusted.marks[0]!.offset, offset);
  assert.deepEqual(adjusted.marks[0]!.padding, padding);
  assert.equal(original.rawSha256, adjusted.rawSha256);
  assert.notEqual(original.sha256, adjusted.sha256);
  const [baseline, painted, raw] = await Promise.all(
    [original.image, adjusted.image, adjusted.raw].map((name) =>
      sharp(join(result.directory, name)).removeAlpha().raw().toBuffer(),
    ),
  );
  const rgb = (pixels: Buffer, x: number, y: number) => {
    const start = 3 * (y * adjusted.width + x);
    return [...pixels.subarray(start, start + 3)];
  };
  // Four new edges, two old edges, and the same privacy mask in both variants.
  for (const [x, y] of [
    [163, 142],
    [263, 142],
    [205, 112],
    [205, 158],
  ] as const) {
    assert.deepEqual(rgb(painted!, x, y), [200, 0, 204], `Missing adjusted edge at ${x},${y}`);
    assert.notDeepEqual(rgb(raw!, x, y), [200, 0, 204]);
  }
  for (const y of [127, 169]) {
    assert.deepEqual(rgb(baseline!, 205, y), [200, 0, 204]);
    assert.deepEqual(rgb(painted!, 205, y), rgb(raw!, 205, y));
  }
  // The adjusted frame cuts into the right part of the button by design. The
  // automatic badge still has room to avoid the first letter of its label.
  for (let y = 132; y < 146; y++)
    for (let x = 150; x < 159; x++)
      assert.deepEqual(rgb(painted!, x, y), rgb(raw!, x, y), 'The badge obscures the Apply label.');
  for (const pixels of [baseline!, painted!, raw!])
    assert.deepEqual(rgb(pixels, 50, 40), [17, 24, 39]);
  const loading = getDocument({
    data: new Uint8Array(await readFile(result.artifacts.pdf!)),
    useSystemFonts: true,
  });
  try {
    const pdf = await loading.promise;
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) =>
        (await (await pdf.getPage(i + 1)).getTextContent()).items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' '),
      ),
    );
    const parts = pages.filter((page) => page.includes('Tall panel') && page.includes('PART '));
    assert.equal(parts.length, 2);
    assert.ok(
      !parts[0]!.includes(caption),
      'The transparent part of the DOM target has no visible reference.',
    );
    assert.ok(
      parts[1]!.includes(caption),
      'The legend belongs on the page with the visible reference.',
    );
  } finally {
    await loading.destroy();
  }
  const audit = await auditRun(result.directory);
  assert.deepEqual(
    audit.findings
      .filter((issue) => issue.code === 'PDF_UNMARKED_SLICE' || issue.code === 'PDF_SPLIT_TARGET')
      .map((issue) => issue.code),
    ['PDF_UNMARKED_SLICE'],
    'The audit uses the visible area when assessing empty parts and seams.',
  );
  if (process.env.HOOSERGUIDE_BROWSER_ARTIFACTS) {
    const destination = resolve(process.env.HOOSERGUIDE_BROWSER_ARTIFACTS, 'mark-offsets');
    await mkdir(destination, { recursive: true });
    await cp(result.directory, destination, { recursive: true });
  }
  adjusted.marks[0]!.offset = { x: -400 };
  await writeFile(result.artifacts.report, JSON.stringify(inspected.report));
  await assert.rejects(inspectRun(result.directory), /adjust|outside|bounds|offset/i);
});
