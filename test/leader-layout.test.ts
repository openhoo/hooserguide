import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { layoutAnnotations, type Rectangle } from '../src/annotations.js';
import { overlay } from '../src/capture.js';
import type { ResolvedMark } from '../src/types.js';

test('a new leader leaves a neighboring legacy box, arrow, and badge in place', () => {
  const legacy: ResolvedMark = {
    target: '#existing',
    label: '1',
    kind: 'both',
    from: { x: 450, y: 235 },
    bounds: { x: 342, y: 170, width: 48, height: 36 },
  };
  const leader: ResolvedMark = {
    target: '#new',
    label: 'A',
    leader: { side: 'bottom' },
    bounds: { x: 110, y: 62, width: 80, height: 34 },
  };
  const [legacyOnly] = layoutAnnotations(520, 320, [legacy]);
  const [newLayout, existingLayout] = layoutAnnotations(520, 320, [leader, legacy]);
  assert.deepEqual(existingLayout, legacyOnly);
  assert.ok(newLayout?.arrow && 'head' in newLayout.arrow);
  assert.ok(newLayout.arrow.to.y > leader.bounds.y + leader.bounds.height);
});

test('a constrained side can move along the target edge when its midpoint is blocked', () => {
  const mark: ResolvedMark = {
    target: '#target',
    label: 'A',
    leader: { side: 'right', length: 72 },
    bounds: { x: 104, y: 75, width: 46, height: 120 },
  };
  const neighbor: ResolvedMark = {
    target: '#neighbor',
    bounds: { x: 180, y: 115, width: 38, height: 40 },
  };
  const [clear] = layoutAnnotations(400, 300, [mark]);
  const [avoiding] = layoutAnnotations(400, 300, [mark, neighbor]);
  assert.ok(clear?.arrow && avoiding?.arrow);
  assert.equal(clear.arrow.to.y, 135);
  const { from, to } = avoiding.arrow;
  assert.equal(to.x, clear.arrow.to.x, 'The arrow should stay on the right');
  assert.equal(from.x - to.x, 72, 'Avoidance should preserve the requested length');
  assert.equal(from.y, to.y, 'The leader should remain straight along the chosen side');
  assert.ok(to.y >= 75 && to.y <= 195, 'The tip should still point to the target edge');
  assert.ok(to.y < 115 || to.y > 155, 'The shaft should pass by the neighboring control');
});

test('a fractional from stays the badge center and points to the nearest target corner', () => {
  const from = { x: 75.125, y: 67.375 };
  const topLeft = { x: 222.25, y: 119.75 };
  const [layout] = layoutAnnotations(400, 300, [
    {
      target: '#target',
      label: 'BC',
      leader: {},
      from,
      bounds: { ...topLeft, width: 55.5, height: 36.25 },
    },
  ]);
  assert.ok(layout?.badge && layout.arrow);
  const { badge, arrow } = layout;
  assert.equal(badge.x + badge.width / 2, from.x);
  assert.equal(badge.y + badge.height / 2, from.y);
  const dx = topLeft.x - from.x;
  const dy = topLeft.y - from.y;
  assert.ok(Math.abs((arrow.to.x - from.x) * dy - (arrow.to.y - from.y) * dx) < 1e-8);
  assert.ok(Math.abs(Math.hypot(topLeft.x - arrow.to.x, topLeft.y - arrow.to.y) - 5) < 1e-8);
  assert.ok(arrow.to.x < topLeft.x && arrow.to.y < topLeft.y);
});

test('fixed badge positions and sides get space before earlier automatic leaders', () => {
  const automatic: ResolvedMark = {
    target: '#automatic',
    label: 'A',
    leader: {},
    bounds: { x: 200, y: 160, width: 50, height: 40 },
  };
  const fixed: ResolvedMark = {
    target: '#fixed',
    label: 'B',
    leader: {},
    bounds: { x: 430, y: 160, width: 65, height: 40 },
  };
  for (const placement of [
    { ...fixed, from: { x: 344, y: 180 } },
    { ...fixed, leader: { side: 'left' } as const },
  ]) {
    const [alone] = layoutAnnotations(600, 400, [placement]);
    const [autoLayout, fixedLayout] = layoutAnnotations(600, 400, [automatic, placement]);
    assert.deepEqual(fixedLayout, alone);
    assert.ok(autoLayout?.arrow && autoLayout.arrow.to.x < fixed.bounds.x);
    assert.ok(autoLayout.arrow.to.x !== 255 || autoLayout.arrow.to.y !== 180);
  }
});

test('the frame of a letter leader fits outside the target or fails with a usable alternative', async () => {
  const width = 520;
  const height = 300;
  const edge: ResolvedMark = {
    target: '#target',
    label: 'A',
    leader: { side: 'right', width: 6 },
    bounds: { x: 0, y: 120, width: 23, height: 32 },
  };
  assert.throws(
    () => overlay(width, height, [{ ...edge, kind: 'both' }]),
    /Leader A cannot fit an outline.*kind "arrow".*padding/,
  );

  const blank = await sharp({
    create: { width, height, channels: 4, background: '#f1f5f9' },
  })
    .png()
    .toBuffer();
  const raw = await sharp(blank).raw().toBuffer();
  const render = (mark: ResolvedMark) =>
    sharp(blank)
      .composite([{ input: Buffer.from(overlay(width, height, [mark])) }])
      .raw()
      .toBuffer();
  const pixel = (x: number, y: number) => (y * width + x) * 4;
  const pixels = (image: Buffer, bounds: Rectangle) => {
    const rows: Buffer[] = [];
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      const start = pixel(bounds.x, y);
      rows.push(image.subarray(start, start + bounds.width * 4));
    }
    return Buffer.concat(rows);
  };
  const framed: ResolvedMark = { ...edge, bounds: { ...edge.bounds, x: 9 }, kind: 'both' };
  const [atEdge, withFrame] = await Promise.all([render(edge), render(framed)]);
  assert.ok(pixels(atEdge, edge.bounds).equals(pixels(raw, edge.bounds)));
  assert.ok(pixels(withFrame, framed.bounds).equals(pixels(raw, framed.bounds)));
  assert.notEqual(withFrame[pixel(4, 136) + 1], raw[pixel(4, 136) + 1], 'The frame is visible');
});
