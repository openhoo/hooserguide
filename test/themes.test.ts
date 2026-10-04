import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
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

test('theme presets validate and semantic colors meet text and control contrast requirements', () => {
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
      assert.ok(contrast(c.accentForeground, background) >= 4.5, `${name}: links`);
    }
    for (const background of [c.tipBackground, c.warningBackground]) {
      assert.ok(contrast(c.accentForeground, background) >= 4.5, `${name}: accent labels`);
      assert.ok(contrast(c.mutedForeground, background) >= 4.5, `${name}: callout secondary text`);
    }
    for (const background of [c.background, c.surface, c.muted]) {
      assert.ok(contrast(c.controlBorder, background) >= 3, `${name}: control boundaries`);
      assert.ok(contrast(c.focus, background) >= 3, `${name}: keyboard focus`);
    }
    assert.ok(contrast(c.heroMuted, c.hero) >= 3, `${name}: pressed control boundary`);
    assert.ok(contrast(c.warning, c.warningBackground) >= 4.5, `${name}: warning label`);
    assert.ok(contrast(c.heroForeground, c.hero) >= 4.5);
    assert.ok(contrast(c.heroMuted, c.hero) >= 4.5);
    assert.equal(resolveManualTheme(name, { accentColor: '#123456' }).colors.primary, '#123456');
    assert.equal(manualThemes[name].colors.primary, c.primary);
  }
  assert.throws(() => manualSchema.parse({ theme: 'unknown' }));
  assert.throws(() => manualSchema.parse({ theme: 'toString' }));
});

test('custom accents preserve branding while keeping text readable across every theme', () => {
  for (const name of manualThemeNames) {
    for (const accentColor of ['#ffffff', '#000000', '#ffff00', '#808080', '#123456']) {
      const c = resolveManualTheme(name, { accentColor }).colors;
      assert.equal(c.primary, accentColor);
      for (const bg of [c.background, c.surface, c.muted, c.tipBackground, c.warningBackground]) {
        assert.ok(contrast(c.accentForeground, bg) >= 4.5, `${name} ${accentColor}: accent text`);
      }
      assert.equal(c.focus, manualThemes[name].colors.focus);
    }
    const accentColor = manualThemes[name].colors.primary;
    assert.equal(resolveManualTheme(name, { accentColor }).colors.accentForeground, accentColor);
  }
  assert.throws(() => resolveManualTheme('professional', { accentColor: 'red' }));
});

const rgbHex = (color: string) =>
  '#' +
  color
    .match(/\d+/g)!
    .slice(0, 3)
    .map((value) => Number(value).toString(16).padStart(2, '0'))
    .join('');

async function assertRenderedContrast(page: import('@playwright/test').Page, name: string) {
  const pairs = await page.evaluate(() => {
    return [...document.querySelectorAll('body *')]
      .filter(
        (el) =>
          el.getClientRects().length &&
          !el.closest('[aria-hidden="true"]') &&
          !['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName) &&
          [...el.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          ),
      )
      .map((el) => {
        let ancestor: Element | null = el;
        let bg = 'rgba(0, 0, 0, 0)';
        while (ancestor && bg === 'rgba(0, 0, 0, 0)') {
          bg = getComputedStyle(ancestor).backgroundColor;
          ancestor = ancestor.parentElement;
        }
        return { label: el.tagName + '.' + el.className, text: getComputedStyle(el).color, bg };
      });
  });
  for (const pair of pairs) {
    assert.ok(
      contrast(rgbHex(pair.text), rgbHex(pair.bg)) >= 4.5,
      `${name}: rendered ${pair.label} ${pair.text} on ${pair.bg}`,
    );
  }
  for (const selector of [
    '#guide-search',
    '#annotations',
    '#print-guide',
    '#guide-theme',
    '.pdf-download',
  ]) {
    const colors = await page.locator(selector).evaluate((el) => {
      const c = getComputedStyle(el);
      return { border: c.borderTopColor, bg: c.backgroundColor };
    });
    assert.ok(
      contrast(rgbHex(colors.border), rgbHex(colors.bg)) >= 3,
      `${name}: ${selector} border`,
    );
  }
  const placeholder = await page.locator('#guide-search').evaluate((el) => {
    const c = getComputedStyle(el, '::placeholder');
    return { color: c.color, bg: getComputedStyle(el).backgroundColor, opacity: c.opacity };
  });
  assert.equal(placeholder.opacity, '1');
  assert.ok(contrast(rgbHex(placeholder.color), rgbHex(placeholder.bg)) >= 4.5);
  await page.keyboard.press('Tab');
  await page.locator('#guide-theme').focus();
  const focus = await page.locator('#guide-theme').evaluate((el) => ({
    color: getComputedStyle(el).outlineColor,
    style: getComputedStyle(el).outlineStyle,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  assert.equal(focus.style, 'solid');
  assert.ok(contrast(rgbHex(focus.color), rgbHex(focus.bg)) >= 3, `${name}: rendered focus`);
}

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
      await assertRenderedContrast(page, name);
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

test('custom accents render readable HTML and PDF text in every theme', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-brand-contrast-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const name of manualThemeNames) {
      const accentColor = manualThemes[name].colorScheme === 'light' ? '#ffffff' : '#000000';
      const result = await build('docs/demo', {
        output: join(root, name),
        manual: { theme: name },
        branding: { accentColor },
      });
      assert.equal(result.report.status, 'passed', result.report.exportError);
      await page.goto(pathToFileURL(result.artifacts.html!).href);
      await assertRenderedContrast(page, `${name} branded`);
      const variables = await page.evaluate(() => {
        const c = getComputedStyle(document.documentElement);
        return {
          brand: c.getPropertyValue('--accent').trim(),
          text: c.getPropertyValue('--accent-ink').trim(),
        };
      });
      assert.equal(variables.brand, accentColor);
      const expected = resolveManualTheme(name, { accentColor }).colors.accentForeground;
      assert.equal(variables.text, expected);
      // The cover's first text is the small accent label. Inspect the emitted PDF
      // drawing operators so the HTML fallback cannot hide a PDF regression.
      const loading = getDocument({
        data: new Uint8Array(await readFile(result.artifacts.pdf!)),
        useSystemFonts: true,
      });
      const pdf = await loading.promise;
      try {
        const operators = await (await pdf.getPage(1)).getOperatorList();
        let fill: unknown;
        let found = false;
        for (let i = 0; i < operators.fnArray.length; i++) {
          if (operators.fnArray[i] === OPS.setFillRGBColor) fill = operators.argsArray[i][0];
          if (operators.fnArray[i] === OPS.showText) {
            assert.equal(fill, expected, `${name}: emitted PDF accent text`);
            found = true;
            break;
          }
        }
        assert.ok(found, `${name}: PDF cover has text`);
      } finally {
        await loading.destroy();
      }
      // Reader theme changes must re-evaluate custom contrast, including a
      // switch between light and dark backgrounds in the same generated HTML.
      await page.locator('#guide-theme').selectOption(name === 'midnight' ? 'sand' : 'midnight');
      await assertRenderedContrast(page, `${name} branded after switching`);
    }
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});
