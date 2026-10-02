import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { bundle } from '../dist/bundle.js';
import { demo } from '../dist/demo.js';

const result = await demo(resolve('output/docs-demo'));
if (result.report.status !== 'passed') throw new Error(result.report.exportError ?? 'Demo failed');
await cp(result.directory, 'docs/demo', { recursive: true });
const report = JSON.parse(await readFile('docs/demo/report.json', 'utf8'));
for (const chapter of report.chapters) chapter.source = 'examples/tasks.feature';
await writeFile('docs/demo/report.json', JSON.stringify(report, null, 2) + '\n');
await bundle('docs/demo', result.directory + '.zip').then((archive) =>
  cp(archive.path, 'docs/demo/handbook.zip'),
);
const layoutDemo = await demo(resolve('output/docs-layout-demo'), {
  title: 'HooTasks — Benutzerhandbuch',
  language: 'de-DE',
  manual: { pageSize: 'Letter', orientation: 'landscape', margin: 36 },
  document: {
    version: '1.0',
    audience: 'Teammitglieder',
    summary: 'Aufgaben anlegen, organisieren und Ergebnisse prüfen.',
  },
});
if (layoutDemo.report.status !== 'passed')
  throw new Error(layoutDemo.report.exportError ?? 'Layout demo failed');
await cp(layoutDemo.directory, 'docs/layout-demo', { recursive: true });
const layoutReport = JSON.parse(await readFile('docs/layout-demo/report.json', 'utf8'));
for (const chapter of layoutReport.chapters) chapter.source = 'examples/tasks.de.feature';
await writeFile('docs/layout-demo/report.json', JSON.stringify(layoutReport, null, 2) + '\n');
await mkdir('docs/media', { recursive: true });
const base = resolve('docs/demo');
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(base, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(base + '/')) {
      res.writeHead(403);
      res.end();
      return;
    }
    const type = file.endsWith('.png')
      ? 'image/png'
      : file.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : 'application/json';
    res.writeHead(200, { 'Content-Type': type });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1850 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'docs/media/html-guide.png', scale: 'css' });
  await page.locator('.toolbar').screenshot({ path: 'docs/media/html-reader-controls.png' });
  const prerequisite = await page.locator('.prerequisites').first().boundingBox();
  const tip = await page.locator('.callout.tip').first().boundingBox();
  await page.screenshot({
    path: 'docs/media/html-guidance.png',
    clip: {
      x: prerequisite.x,
      y: prerequisite.y,
      width: prerequisite.width,
      height: tip.y + tip.height - prerequisite.y,
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/media/html-mobile.png', scale: 'css' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) throw new Error('Generated HTML overflows at mobile width');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  `Demo docs generated from ${result.directory}. Render the PDF previews with pdftoppm and visually review before committing.`,
);
