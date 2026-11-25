// Run from the checkout: node --import tsx scripts/mark-offsets.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { run } from '../src/runner.ts';

const directory = resolve('output/review/mark-offsets');
await mkdir(directory, { recursive: true });
const feature = join(directory, 'switch.feature');
const offset = { x: 7, y: 4 };
const padding = { left: 8, right: 10 };
const samples = [
  { title: 'The frame crosses the switch', code: ['No adjustment'], mark: {} },
  { title: 'Shift the frame toward the track', code: ['offset: { x: 7, y: 4 }'], mark: { offset } },
  {
    title: 'Leave room on both sides',
    code: ['offset: { x: 7, y: 4 }', 'padding: { left: 8, right: 10 }'],
    mark: { offset, padding },
  },
];
const color = '#b52b52';
await writeFile(
  feature,
  [
    'Feature: Adjust a screenshot mark',
    '  Scenario: Fit an outline around the Email alerts switch',
    '    The colored track extends beyond the element that positions it. Compare the frames with the visible track and thumb.',
    '    Given I open "/"',
    '    Then "role=switch:Email alerts" is checked',
    '    And "role=switch:Sound" is unchecked',
    '    And I explain "Follow the Email alerts switch through all three figures. The finished outline should clear its edges and leave the Sound switch outside."',
    ...samples.flatMap(({ title, code, mark }) => [
      `    And I capture "${title}"`,
      '      """json',
      JSON.stringify({
        description: code.join('; '),
        focus: 'testid=settings',
        padding: 8,
        marks: [{ target: 'role=switch:Email alerts', kind: 'box', color, ...mark }],
      }),
      '      """',
    ]),
    '',
  ].join('\n'),
);
// A custom switch can paint beyond the DOM element used to position it.
const switchImage = async (on) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="25" viewBox="0 0 52 25">
    <rect width="52" height="25" rx="12.5" fill="${on ? '#08756d' : '#8b9ba6'}"/>
    <circle cx="${on ? 39.5 : 12.5}" cy="12.5" r="9" fill="white"/></svg>`;
  const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  return 'data:image/png;base64,' + png.toString('base64');
};
const [offImage, onImage] = await Promise.all([switchImage(false), switchImage(true)]);
const scene = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Notification settings</title>
  <style>
    * { box-sizing: border-box } body { margin: 0; padding: 30px; font: 16px system-ui; background: white; color: #19384c }
    h1 { font-size: 18px; margin: 0 0 20px }
    .settings { width: 190px; display: grid; gap: 8px }
    .row { display: grid; grid-template-columns: 112px 32px; align-items: center; height: 35px; padding: 0 6px }
    .row span { font-size: 15px; font-weight: 600 }
    .toggle { position: relative; width: 32px; height: 23px; padding: 0; border: 0; background: transparent }
    .toggle::after { content: ''; position: absolute; left: -2px; top: 2px; width: 52px; height: 25px;
      background: url('${offImage}') center/contain no-repeat }
    .toggle[aria-checked="true"]::after { background-image: url('${onImage}') }
  </style>
  <h1>Notification settings</h1><div class="settings" data-testid="settings">
  <div class="row"><span id="email-label">Email alerts</span><button class="toggle" role="switch" aria-labelledby="email-label" aria-checked="true"></button></div>
  <div class="row"><span id="sound-label">Sound</span><button class="toggle" role="switch" aria-labelledby="sound-label" aria-checked="false"></button></div></div>
  <script>for (const el of document.querySelectorAll('.toggle')) el.onclick = () => el.setAttribute('aria-checked', String(el.getAttribute('aria-checked') !== 'true'));</script></html>`;
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(scene);
});
await new Promise((done, reject) => {
  server.once('error', reject).listen(0, '127.0.0.1', done);
});
let result;
try {
  result = await run({
    title: 'Mark position and padding',
    features: [feature],
    output: directory,
    baseURL: `http://127.0.0.1:${server.address().port}`,
    viewport: { width: 320, height: 240 },
    deviceScaleFactor: 2,
  });
} finally {
  server.close();
}
assert.equal(
  result.report.status,
  'passed',
  result.report.chapters[0]?.error ?? result.report.exportError,
);
const shots = result.report.chapters[0].captures;
assert.equal(shots.length, 3);
assert.equal(new Set(shots.map((s) => s.rawSha256)).size, 1, 'The underlying settings changed');

// Measure the painted stroke in the real PNG. Its color does not occur in the raw scene.
async function extent(image, rgb = [181, 43, 82]) {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] !== rgb[0] || data[i + 1] !== rgb[1] || data[i + 2] !== rgb[2]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  assert(right >= left, 'Expected color missing from the captured PNG');
  return [left, top, right, bottom];
}
const files = shots.map((s) => join(result.directory, s.image));
const [base, moved, expanded] = await Promise.all(files.map((file) => extent(file)));
const [l, t, r, b] = base;
assert.deepEqual(moved, [l + offset.x, t + offset.y, r + offset.x, b + offset.y]);
assert.deepEqual(expanded, [moved[0] - padding.left, moved[1], moved[2] + padding.right, moved[3]]);
const raw = join(result.directory, shots[0].raw);
const [[x1, y1, x2, y2], neighbor] = await Promise.all([
  extent(raw, [8, 117, 109]),
  extent(raw, [139, 155, 166]),
]);
assert(r < x2 && moved[2] < x2, 'The first two frames should still cross the visible track');
assert(
  expanded[0] <= x1 - 4 && expanded[1] <= y1 - 3 && expanded[2] >= x2 + 4 && expanded[3] >= y2 + 3,
  'The corrected frame must clear all four edges',
);
assert(expanded[3] < neighbor[1] - 6, 'The Sound switch must stay clear');

const width = 590,
  rowHeight = 110,
  imageLeft = 365,
  firstRow = 72,
  height = 410;
const frames = samples.map(({ title, code }, i) => {
  const y = firstRow + i * rowHeight;
  return `<rect x="12" y="${y}" width="565" height="102" rx="9" fill="white" stroke="#d5e2e5"/>
    <text x="26" y="${y + 34}" class="name">${title}</text>
    ${code.map((line, n) => `<text x="26" y="${y + 58 + n * 19}" class="code">${line}</text>`).join('')}`;
});
const labels =
  Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>text { font-family: Arial, sans-serif; fill: #19384c } .name { font-size: 17px; font-weight: bold }
  .code { font-family: DejaVu Sans Mono, monospace; font-size: 13px; fill: #345563 }</style>
  <text x="14" y="29" font-size="23" font-weight="bold">Fit the outline to the visible switch</text>
  <text x="14" y="53" font-size="14">Email alerts stays on. Only its outline changes.</text>${frames.join('')}</svg>`);
const imagePath = resolve('docs/media/mark-offsets.png');
await sharp({ create: { width, height, channels: 3, background: 'white' } })
  .composite([
    { input: labels, left: 0, top: 0 },
    ...files.map((input, i) => ({ input, left: imageLeft, top: firstRow + 2 + rowHeight * i })),
  ])
  .png()
  .toFile(imagePath);
console.log(
  JSON.stringify(
    { imagePath, runDirectory: result.directory, outlinePixelExtents: { base, moved, expanded } },
    null,
    2,
  ),
);
