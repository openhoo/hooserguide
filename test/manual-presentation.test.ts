import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { run } from '../src/runner.js';
import { badgeTextColor } from '../src/annotations.js';
import type { Config } from '../src/types.js';

async function fixture(root: string): Promise<Config> {
  const feature = join(root, 'controls.feature'),
    plugin = join(root, 'controls.mjs');
  await writeFile(
    feature,
    `Feature: Control panel
 Scenario: Use the menu
  Given I prepare this screen
  Then "role=heading:Menu" is visible
  And I capture "Menu controls"
   """json
   {"focus":"#panel","padding":0}
   """
`,
  );
  await writeFile(
    plugin,
    `export function register(registry) {
    registry.define(/^I prepare this screen$/, async ({page, config, chapter, instruction}) => {
      await page.setContent('<main id="panel" style="width:160px;height:544px;border:1px solid"><h1>Menu</h1><button>Open</button></main>');
      const touch = config.profile === 'phone';
      chapter.description = touch ? 'Touch display.' : 'Pointer display.';
      chapter.prerequisites = ['Open the panel.'];
      chapter.callouts = [{kind:'warning', text:touch ? 'Check before tapping.' : 'Check before clicking.'}];
      instruction(touch ? 'Tap Open.' : 'Click Open.');
    });
  }`,
  );
  return {
    title: 'Controls',
    baseURL: 'http://localhost',
    features: [feature],
    plugins: [plugin],
    output: join(root, 'guides'),
    manual: { screenLayout: 'stacked' },
    profiles: {
      desktop: { viewport: { width: 1200, height: 800 } },
      tablet: { viewport: { width: 780, height: 800 } },
      phone: { viewport: { width: 390, height: 800 } },
    },
  };
}

test('each responsive instruction names all applicable screens, with warnings before actions in every export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-guidance-'));
  const browser = await chromium.launch();
  try {
    const config = await fixture(root);
    const result = await run({
      ...config,
      responsive: { profiles: ['desktop', 'phone', 'tablet'] },
    });
    assert.equal(result.report.status, 'passed', result.report.exportError);
    const page = await browser.newPage();
    await page.goto(pathToFileURL(result.artifacts.html!).href);
    assert.match(await page.locator('.hero-stats').innerText(), /^1 chapter ·/);
    await page.locator('#guide-search').fill('menu');
    assert.equal(await page.locator('#search-results').innerText(), '1 matching chapter');
    await page.locator('#guide-search').fill('');
    assert.equal(await page.locator('#search-results').textContent(), '');
    const screenshot = page.locator('figure img').first();
    assert.ok(
      await screenshot.evaluate((el) => el.clientWidth <= (el as HTMLImageElement).naturalWidth),
      'The reader upscales a focused control beyond its captured size',
    );
    const groups = page.locator('.variant-guidance');
    assert.equal(await groups.count(), 2);
    assert.match(await groups.first().locator('h3').innerText(), /desktop.*tablet/i);
    assert.match(await groups.last().locator('h3').innerText(), /phone/i);
    const checkOrder = (prose: string) => {
      for (const [mode, action] of [
        ['clicking', 'Click'],
        ['tapping', 'Tap'],
      ] as const) {
        const warning = prose.indexOf('Check before ' + mode + '.'),
          step = prose.indexOf(action + ' Open.');
        assert.ok(warning >= 0 && step > warning, 'Missing or misplaced ' + mode + ' warning');
      }
    };
    checkOrder(await page.locator('section').innerText());
    const md = await readFile(result.artifacts.markdown!, 'utf8');
    assert.match(md, /### desktop[^\n]*tablet/i);
    checkOrder(md);
    const loading = getDocument({
      data: new Uint8Array(await readFile(result.artifacts.pdf!)),
      useSystemFonts: true,
    });
    try {
      const pdf = await loading.promise,
        pages = [];
      for (let i = 1; i <= pdf.numPages; i++)
        pages.push(
          (await (await pdf.getPage(i)).getTextContent()).items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' '),
        );
      const prose = pages.join(' ').replace(/\s+/g, ' ');
      assert.match(prose, /desktop.{0,45}tablet.{0,45}Pointer display/i);
      checkOrder(prose);
    } finally {
      await loading.destroy();
    }
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a narrow focused screenshot that fits at its natural size takes one PDF detail page', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-focus-size-'));
  try {
    const result = await run(await fixture(root));
    assert.equal(result.report.status, 'passed', result.report.exportError);
    const layout = JSON.parse(await readFile(join(result.directory, 'pdf-layout.json'), 'utf8'));
    assert.equal(layout.figures[0].slices.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reference numbers on midtone badges retain sufficient text contrast', () => {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/../g)!
      .map((pair) => {
        const v = parseInt(pair, 16) / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  for (const background of ['#747474', '#777777', '#808080', '#888888', '#ca6234']) {
    const a = luminance(background),
      b = luminance(badgeTextColor(background));
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, background);
  }
});
