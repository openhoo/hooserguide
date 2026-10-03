import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { build } from '../src/build.js';
import { manualSchema } from '../src/config.js';
import { manualThemes, manualThemeNames, resolveManualTheme } from '../src/themes.js';

const luminance = (hex: string) => {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)!
    .map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  return r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
};
const contrast = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('theme presets validate and text colors meet 4.5:1 contrast on their surfaces', () => {
  assert.equal(resolveManualTheme().name, 'professional');
  for (const name of manualThemeNames) {
    assert.equal(manualSchema.parse({ theme: name }).theme, name);
    const c = manualThemes[name].colors;
    for (const background of [
      c.background,
      c.surface,
      c.muted,
      c.tipBackground,
      c.warningBackground,
    ]) {
      assert.ok(contrast(c.foreground, background) >= 4.5, `${name}: body on ${background}`);
    }
    for (const background of [c.background, c.surface, c.muted]) {
      assert.ok(contrast(c.mutedForeground, background) >= 4.5, `${name}: secondary text`);
      assert.ok(contrast(c.primary, background) >= 4.5, `${name}: links`);
    }
    assert.ok(contrast(c.heroMuted, c.hero) >= 4.5);
    assert.equal(resolveManualTheme(name, { accentColor: '#123456' }).colors.primary, '#123456');
    assert.equal(manualThemes[name].colors.primary, c.primary);
  }
  assert.throws(() => manualSchema.parse({ theme: 'unknown' }));
  assert.throws(() => manualSchema.parse({ theme: 'toString' }));
});

test('all themes rebuild verified evidence into readable HTML and PDF; viewer persists selection and prints light', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-themes-'));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const htmlPaths = new Map<string, string>();
    for (const name of manualThemeNames) {
      const result = await build('docs/demo', {
        output: join(root, name),
        manual: { theme: name },
      });
      assert.equal(result.report.status, 'passed', result.report.exportError);
      htmlPaths.set(name, result.artifacts.html!);
      assert.equal(result.report.manual?.theme, name);
      await page.goto(pathToFileURL(result.artifacts.html!).href);
      await page.locator('.toolbar').waitFor({ state: 'visible' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), name);
      assert.equal(await page.locator('#guide-theme').inputValue(), name);
      assert.equal(await page.locator('.reader-actions #guide-theme').isVisible(), true);
      assert.equal(await page.locator('.reader-actions .pdf-download').isVisible(), true);
      assert.equal(await page.locator('.pdf-download').getAttribute('download'), 'handbook.pdf');
      assert.ok(
        (await page.locator('.reader-actions').boundingBox())!.y <
          (await page.locator('.hero').boundingBox())!.y,
      );
      assert.equal(await page.locator('#guide-theme option').count(), manualThemeNames.length);
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
        manualThemes[name].colorScheme,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      // PDF pages must actually paint a background, including the page margins.
      const loading = getDocument({
        data: new Uint8Array(await readFile(result.artifacts.pdf!)),
        useSystemFonts: true,
      });
      const pdf = await loading.promise;
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          const pdfPage = await pdf.getPage(i);
          assert.ok((await pdfPage.getTextContent()).items.length > 0);
          const viewport = pdfPage.getViewport({ scale: 0.2 });
          const canvas = pdf.canvasFactory.create(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
          await pdfPage.render({ canvasContext: canvas.context, canvas: canvas.canvas, viewport })
            .promise;
          const pixel = canvas.context.getImageData(2, 2, 1, 1).data;
          const expected = manualThemes[name].colors.surface
            .slice(1)
            .match(/../g)!
            .map((v) => parseInt(v, 16));
          assert.deepEqual([...pixel].slice(0, 3), expected, `${name} PDF page ${i} background`);
          pdf.canvasFactory.destroy(canvas);
        }
      } finally {
        await loading.destroy();
      }
    }
    await page.locator('#guide-theme').selectOption('midnight');
    await page.reload();
    assert.equal(await page.locator('#guide-theme').inputValue(), 'midnight');
    await page.locator('#guide-search').fill('ZZZnonexistent');
    assert.equal(await page.locator('main > section:visible').count(), 0);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('main > section:visible').count(), 2);
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      'light',
    );
    assert.equal(await page.locator('.toolbar').isVisible(), false);
    assert.equal(await page.locator('.reader-actions').isVisible(), false);
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#guide-search').fill('');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    // Static HTML and clients with unavailable storage still work.
    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await staticContext.newPage();
    await staticPage.goto(pathToFileURL(htmlPaths.get('midnight')!).href);
    assert.equal(await staticPage.locator('html').getAttribute('data-theme'), 'midnight');
    assert.equal(await staticPage.locator('main > section:visible').count(), 2);
    assert.equal(await staticPage.locator('.pdf-download').isVisible(), true);
    assert.equal(await staticPage.locator('.theme-picker').isVisible(), false);
    await staticContext.close();
    const blocked = await browser.newContext();
    await blocked.addInitScript(() =>
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('Storage disabled');
        },
      }),
    );
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(pathToFileURL(htmlPaths.get('professional')!).href);
    await blockedPage.locator('#guide-theme').selectOption('graphite');
    assert.equal(await blockedPage.locator('html').getAttribute('data-theme'), 'graphite');
    await blocked.close();
    await context.close();
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});
