import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { renderManual } from '../src/render.js';
import type { RunReport } from '../src/types.js';

test('long contents remain scrollable inside the desktop viewport and expand on mobile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-long-contents-'));
  const browser = await chromium.launch();
  try {
    const report = JSON.parse(await readFile('docs/demo/report.json', 'utf8')) as RunReport;
    const chapter = report.chapters[0]!;
    await mkdir(join(root, 'screenshots'));
    const capture = chapter.captures[0]!;
    report.chapters = [];
    for (let index = 0; index < 40; index++) {
      const image = `screenshots/chapter-${index}.png`;
      const raw = `screenshots/chapter-${index}.raw.png`;
      await copyFile(join('docs/demo', capture.image), join(root, image));
      await copyFile(join('docs/demo', capture.raw), join(root, raw));
      report.chapters.push({
        ...chapter,
        title: `Chapter ${index + 1}: Manage your workspace`,
        captures: [{ ...capture, id: `chapter-${index}`, image, raw }],
      });
    }
    await renderManual(report, root);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(pathToFileURL(join(root, 'index.html')).href);
    const sidebar = page.locator('.layout > aside');
    const box = (await sidebar.boundingBox())!;
    assert.ok(box.y + box.height <= 720, 'Contents extends below the viewport');
    assert.ok(await sidebar.evaluate((el) => el.scrollHeight > el.clientHeight));
    await page.locator('nav a').last().focus();
    const last = (await page.locator('nav a').last().boundingBox())!;
    assert.ok(last.y >= box.y && last.y + last.height <= box.y + box.height);
    await page.keyboard.press('Enter');
    assert.match(page.url(), /#chapter-40$/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await sidebar.evaluate((el) => getComputedStyle(el).maxHeight), 'none');
    assert.equal(await sidebar.evaluate((el) => getComputedStyle(el).overflowY), 'visible');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('native printing primes every lazy screenshot even when search hides its chapter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-native-print-'));
  const browser = await chromium.launch();
  try {
    await cp('docs/demo', root, { recursive: true });
    const report = JSON.parse(await readFile(join(root, 'report.json'), 'utf8')) as RunReport;
    await renderManual(report, root);
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(root, 'index.html')).href);
    await page.locator('.toolbar').waitFor({ state: 'visible' });
    await page.locator('#guide-search').fill('no-matching-chapter');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const ready = await page.locator('figure img').evaluateAll(async (images) => {
      await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
      return images.every((image) => {
        const img = image as HTMLImageElement;
        return img.loading === 'eager' && img.complete && img.naturalWidth > 0;
      });
    });
    assert.equal(ready, true, 'Native printing leaves hidden/offscreen screenshots lazy');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('main > section:visible').count(), report.chapters.length);
    assert.equal(
      await page.locator('figure img:visible').count(),
      report.chapters.flatMap((c) => c.captures).length,
    );
    await page.emulateMedia({ media: 'screen' });
    assert.equal(
      await page.locator('main > section:visible').count(),
      0,
      'Printing must preserve the search query',
    );
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});
