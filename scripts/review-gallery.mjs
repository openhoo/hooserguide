import { chromium } from '@playwright/test';
import { captureScreenshot } from '../src/capture.ts';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('output/review/gallery', { recursive: true });
// Pinned 0.2.0 implementation makes the before/after comparison reproducible.
const source = execFileSync(
  'git',
  ['show', '55cfca92c1a8dd19c19a74ec996e12e5634c2565:src/capture.ts'],
  { encoding: 'utf8' },
)
  .replaceAll("from './config.js'", "from '../../src/config.ts'")
  .replaceAll("from './steps.js'", "from '../../src/steps.ts'")
  .replaceAll("from './types.js'", "from '../../src/types.ts'");
await writeFile('output/review/capture-before.ts', source);
const { captureScreenshot: before } = await import(
  pathToFileURL(resolve('output/review/capture-before.ts')).href
);
const browser = await chromium.launch();
const cases = [
  {
    name: 'Dense references',
    viewport: { width: 600, height: 260 },
    setup: async (p) =>
      p.setContent(
        '<style>body{margin:0;background:#f5f8fa;font:16px system-ui}.control{position:absolute;left:100px;width:320px;height:24px;background:white;border:1px solid #cad6df;box-sizing:border-box;padding-left:16px;color:#142636}</style>' +
          [0, 1, 2]
            .map(
              (i) =>
                `<div id=t${i} class=control style="top:${70 + i * 28}px">${['Task title', 'Priority', 'Due date'][i]}</div>`,
            )
            .join(''),
      ),
    spec: {
      title: 'Dense controls',
      marks: [0, 1, 2].map((i) => ({
        target: '#t' + i,
        label: String(i + 1),
        caption: 'Control ' + (i + 1),
      })),
    },
  },
  {
    name: 'Paused Web Animation',
    viewport: { width: 600, height: 260 },
    setup: async (p) => {
      await p.setContent(
        '<style>body{margin:0;background:#f5f8fa;font:16px system-ui}#t{position:absolute;left:70px;top:90px;width:170px;height:50px;display:grid;place-items:center;background:#075e59;color:white;border-radius:8px}</style><div id=t>Animated control</div>',
      );
      await p.evaluate(() => {
        const a = document
          .querySelector('#t')
          .animate([{ transform: 'translateX(0)' }, { transform: 'translateX(260px)' }], {
            duration: 1000,
            fill: 'forwards',
          });
        a.pause();
        a.currentTime = 250;
      });
    },
    spec: { title: 'Animated control', marks: [{ target: '#t', label: 'A', kind: 'box' }] },
  },
  {
    name: 'Mobile viewport without meta',
    viewport: { width: 390, height: 260 },
    mobile: true,
    setup: async (p) =>
      p.setContent(
        '<style>body{margin:0;background:#f5f8fa;font:24px system-ui}#t{position:absolute;left:100px;top:100px;width:230px;height:90px;display:grid;place-items:center;background:#075e59;color:white;border-radius:12px}</style><div id=t>Save settings</div>',
      ),
    spec: { title: 'Mobile control', marks: [{ target: '#t', label: 'A', kind: 'box' }] },
  },
];
const composites = [];
for (const [i, c] of cases.entries()) {
  for (const [j, capture] of [before, captureScreenshot].entries()) {
    const page = await browser.newPage({
      viewport: c.viewport,
      isMobile: c.mobile ?? false,
      deviceScaleFactor: 2,
    });
    await c.setup(page);
    const shot = await capture(page, c.spec, 'output/review/gallery', `${i}-${j}`);
    const png = await sharp('output/review/gallery/' + shot.image)
      .resize({ width: 600, height: 260, fit: 'contain', background: '#f5f8fa' })
      .toBuffer();
    composites.push({ input: png, left: j * 620 + 20, top: i * 320 + 110 });
    await page.close();
  }
}
const labels = Buffer.from(
  `<svg width="1260" height="1080"><style>text{font-family:Arial,sans-serif;fill:#142636}</style><text x="20" y="38" font-size="25" font-weight="bold">Screenshot alignment — real browser regression examples</text><text x="20" y="72" font-size="16">Before (0.2.0)</text><text x="640" y="72" font-size="16">After (0.2.1)</text>${cases.map((c, i) => `<text x="20" y="${i * 320 + 98}" font-size="14" font-weight="bold">${c.name}</text>`).join('')}</svg>`,
);
await sharp({ create: { width: 1260, height: 1080, channels: 3, background: '#ffffff' } })
  .composite([...composites, { input: labels, left: 0, top: 0 }])
  .png()
  .toFile('docs/media/alignment-review.png');
await browser.close();
