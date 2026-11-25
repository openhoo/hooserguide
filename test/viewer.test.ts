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
        steps: chapter.steps.slice(0, capture.step),
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

test('an offline reader can inspect and pan the selected screenshot, then return to the same figure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-inspector-'));
  const browser = await chromium.launch();
  try {
    await cp('docs/demo', root, { recursive: true });
    const report = JSON.parse(await readFile(join(root, 'report.json'), 'utf8')) as RunReport;
    report.language = 'de';
    const shot = report.chapters[0]!.captures[0]!;
    await renderManual(report, root);
    const url = pathToFileURL(join(root, 'index.html')).href;
    const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
    await page.goto(url);
    await page.getByRole('searchbox').fill('Bild öffnen');
    assert.equal(
      await page.locator('main > section:visible').count(),
      0,
      'Reader controls should not count as chapter content',
    );
    await page.getByRole('searchbox').fill('');
    const link = page.getByRole('link', { name: 'Bild öffnen: ' + shot.title, exact: true });
    await link.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: shot.title });
    await dialog.waitFor();
    const close = dialog.getByRole('button', { name: 'Schließen' });
    assert.equal(await close.evaluate((el) => el === document.activeElement), true);
    const image = dialog.getByRole('img', { name: shot.title });
    await image.evaluate((el) => (el as HTMLImageElement).decode());
    assert.equal(await image.getAttribute('src'), new URL(shot.image, url).href);
    assert.equal(await dialog.getByText(shot.description!, { exact: true }).isVisible(), true);
    assert.equal(
      await dialog.getByText(shot.marks[0]!.caption!, { exact: false }).isVisible(),
      true,
    );
    const area = dialog.getByRole('region', { name: 'Bildschirmaufnahme' });
    assert.equal(
      await area.evaluate(
        (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
      ),
      true,
    );
    await dialog.getByRole('button', { name: 'Originalgröße anzeigen' }).click();
    assert.equal((await image.boundingBox())!.width, shot.width);
    assert.equal((await image.boundingBox())!.height, shot.height);
    await area.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.inspector-canvas')!.scrollLeft > 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await dialog.getByRole('button', { name: 'Bild einpassen' }).click();
    assert.equal(await area.evaluate((el) => el.scrollLeft), 0);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await link.evaluate((el) => el === document.activeElement), true);
    assert.equal(page.url(), url);

    await page.getByRole('button', { name: 'Annotationen anzeigen' }).click();
    await link.click();
    await dialog.waitFor();
    assert.equal(await image.getAttribute('src'), new URL(shot.raw, url).href);
    assert.equal(await dialog.locator('.legend').count(), 0);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#figure-inspector').isVisible(), false);
    assert.equal(await page.locator('main > section:visible').count(), report.chapters.length);
    await page.emulateMedia({ media: 'screen' });
    await close.click();
    assert.equal(await link.evaluate((el) => el === document.activeElement), true);

    const withoutScript = await browser.newPage({ javaScriptEnabled: false });
    await withoutScript.goto(url);
    await withoutScript
      .getByRole('link', { name: 'Bild öffnen: ' + shot.title, exact: true })
      .click();
    await withoutScript.waitForURL(new URL(shot.image, url).href);
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});
