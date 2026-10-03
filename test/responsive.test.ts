import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import { run, validate } from '../src/runner.js';
import { resolveConfig, loadConfig } from '../src/config.js';
import { assertReportIntegrity } from '../src/report.js';
import { build } from '../src/build.js';
import { inspectRun } from '../src/evidence.js';
import { compareRuns } from '../src/compare.js';
import { bundle } from '../src/bundle.js';
import { unzipSync } from 'fflate';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Config } from '../src/types.js';

const profiles: Config['profiles'] = {
  desktop: { viewport: { width: 1280, height: 800 } },
  tablet: { viewport: { width: 768, height: 900 }, hasTouch: true },
  mobile: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
};
const feature = `Feature: Responsive settings
 Scenario: Settings overview
  Given I open "/"
  Then "role=heading:Settings" is visible
  And I explain "Review settings for this device."
  And I capture "Settings panel"
   """json
   {"marks":[{"target":"#save","kind":"both","label":"A","caption":"Save settings"}],"masks":["#secret"]}
   """
 Scenario: Details
  Given I open "/"
  And I capture "Detail panel"
`;
const app = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:18px system-ui;background:#f5f8fa;color:#142636}main{padding:36px;display:grid;grid-template-columns:2fr 1fr;gap:24px}.card{background:white;padding:24px;border:1px solid #dce5e9;border-radius:12px}button{background:#075e59;color:white;padding:16px;border:0;border-radius:6px}#secret{margin-bottom:30px}@media(max-width:600px){main{display:block;padding:20px}.card{margin-bottom:20px}}</style><main><section class=card><h1>Settings</h1><p>Configure your workspace.</p><div id=secret>PRIVATE</div><button id=save>Save</button></section><aside class=card>Device preferences</aside></main>`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-responsive-'));
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(app);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const file = join(root, 'settings.feature');
  await writeFile(file, feature);
  const config: Config = {
    title: 'Responsive guide',
    baseURL: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    features: [file],
    output: join(root, 'out'),
    profiles,
    responsive: {
      profiles: ['desktop', 'tablet', 'mobile'],
      labels: { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' },
    },
    pdf: false,
    timeoutMs: 500,
  };
  return {
    root,
    config,
    async close() {
      await new Promise<void>((done) => server.close(() => done()));
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('responsive configuration rejects missing, duplicate, incompatible and conflicting profiles before launch', async () => {
  const f = await fixture();
  try {
    for (const names of [
      ['mobile'],
      ['mobile', 'mobile'],
      ['desktop', 'unknown'],
      ['desktop', 'tablet', 'mobile', 'desktop', 'other'],
    ])
      assert.throws(() => resolveConfig({ ...f.config, responsive: { profiles: names } }));
    assert.throws(
      () => resolveConfig({ ...f.config, profile: 'desktop' }),
      /profile or responsive/,
    );
    assert.throws(
      () =>
        resolveConfig({
          ...f.config,
          responsive: { profiles: ['desktop', 'mobile'], labels: { tablet: 'Unused' } },
        }),
      /unselected/,
    );
    assert.throws(
      () =>
        resolveConfig({
          ...f.config,
          profiles: { ...profiles, mobile: { ...profiles.mobile, browser: 'firefox' } },
        }),
      /Firefox/,
    );
    const file = join(f.root, 'config.json');
    await writeFile(file, JSON.stringify(f.config));
    assert.equal((await loadConfig(file, { profile: 'mobile' })).responsive, undefined);
    assert.deepEqual((await validate(f.config)).responsive?.profiles, [
      'desktop',
      'tablet',
      'mobile',
    ]);
  } finally {
    await f.close();
  }
});

test('real responsive executions retain each screen, align annotations, group HTML/Markdown/PDF and rebuild/bundle/compare', async () => {
  const f = await fixture();
  const browser = await chromium.launch();
  try {
    const r = await run(f.config);
    assert.equal(r.report.status, 'passed', r.report.exportError);
    assert.equal(r.report.chapters.length, 6);
    assert.deepEqual(
      r.report.chapters.map((c) => c.variant?.profile),
      ['desktop', 'tablet', 'mobile', 'desktop', 'tablet', 'mobile'],
    );
    const captures = r.report.chapters.map((c) => c.captures[0]!);
    assert.deepEqual(
      captures.slice(0, 3).map((c) => c.width),
      [1280, 768, 390],
    );
    assert.equal(new Set(captures.map((c) => c.id)).size, 6);
    for (const capture of captures.slice(0, 3)) {
      const mark = capture.marks[0]!;
      assert.ok(mark.bounds.x + mark.bounds.width <= capture.width);
      const { data, info } = await sharp(await readFile(join(r.directory, capture.raw)))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const x = Math.floor(mark.bounds.x + 10),
        y = Math.floor(mark.bounds.y + 10),
        n = (y * info.width + x) * info.channels;
      assert.deepEqual([...data.subarray(n, n + 3)], [7, 94, 89]);
      // Both image variants contain the opaque privacy mask.
      for (const image of [capture.raw, capture.image]) {
        const png = await sharp(await readFile(join(r.directory, image)))
          .raw()
          .toBuffer({ resolveWithObject: true });
        let masked = 0;
        for (let n = 0; n < png.data.length; n += png.info.channels)
          if (png.data[n] === 17 && png.data[n + 1] === 24 && png.data[n + 2] === 39) masked++;
        assert.ok(masked > 100, 'Privacy mask must remain in every screen and variant');
      }
    }
    assert.equal((await inspectRun(r.directory)).verifiedImages, 12);
    const broken = structuredClone(r.report);
    broken.chapters.splice(2, 1);
    assert.throws(() => assertReportIntegrity(broken), /Incomplete responsive/);
    const dup = structuredClone(r.report);
    dup.chapters[1]!.variant = structuredClone(dup.chapters[0]!.variant!);
    assert.throws(() => assertReportIntegrity(dup), /Duplicate responsive/);
    const mismatch = structuredClone(r.report);
    mismatch.chapters[1]!.captures[0]!.title = 'Unrelated';
    assert.throws(() => assertReportIntegrity(mismatch), /capture sequence/);
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await page.goto(pathToFileURL(join(r.directory, 'index.html')).href);
    assert.equal(await page.locator('main > section').count(), 2);
    assert.equal(await page.locator('.screen-group').count(), 2);
    const cells = page.locator('.screen-group').first().locator('figure');
    const a = await cells.nth(0).boundingBox(),
      b = await cells.nth(1).boundingBox();
    assert.ok(a && b && Math.abs(a.y - b.y) < 1 && b.x > a.x);
    await page.getByRole('button', { name: 'Show annotations' }).click();
    assert.ok(
      await page
        .locator('figure img')
        .first()
        .getAttribute('src')
        .then((src) => src?.endsWith('.raw.png')),
    );
    assert.ok(
      await page
        .locator('.screen-image')
        .first()
        .getAttribute('href')
        .then((src) => src?.endsWith('.raw.png')),
    );
    assert.equal(await page.locator('.legend:visible').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    const narrowA = await cells.nth(0).boundingBox(),
      narrowB = await cells.nth(1).boundingBox();
    assert.ok(narrowA && narrowB && narrowB.y > narrowA.y);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const md = await readFile(r.artifacts.markdown!, 'utf8');
    assert.match(md, /\| Desktop · 1280 × 800 CSS px \| Tablet/);
    const pdf = await build(r.directory, {
      output: join(f.root, 'pdf'),
      pdf: true,
      manual: { orientation: 'landscape' },
    });
    assert.equal(pdf.report.status, 'passed', pdf.report.exportError);
    const loading = getDocument({
      data: new Uint8Array(await readFile(pdf.artifacts.pdf!)),
      useSystemFonts: true,
    });
    const doc = await loading.promise;
    const text = [];
    for (let n = 1; n <= doc.numPages; n++)
      text.push(
        (await (await doc.getPage(n)).getTextContent()).items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' '),
      );
    assert.ok(
      text.some((t) => t.includes('Screen sizes') && t.includes('Desktop') && t.includes('Mobile')),
    );
    assert.ok(text.some((t) => t.includes('390') && t.includes('Save settings')));
    await loading.destroy();
    const stacked = await build(r.directory, {
      output: join(f.root, 'stacked'),
      pdf: false,
      manual: { screenLayout: 'stacked' },
    });
    await page.goto(pathToFileURL(stacked.artifacts.html!).href);
    await page.setViewportSize({ width: 1600, height: 1200 });
    const stackCells = page.locator('.screen-group').first().locator('figure');
    assert.ok(
      (await stackCells.nth(1).boundingBox())!.y > (await stackCells.nth(0).boundingBox())!.y,
    );
    assert.equal((await compareRuns(r.directory, stacked.directory)).totals.unchanged, 6);
    const zip = unzipSync(await readFile((await bundle(pdf.directory)).path));
    assert.ok(zip['handbook.pdf']);
    assert.ok(zip[captures[2]!.image]);
    const filtered = await run({ ...f.config, scenario: 'Details' });
    const coverage = await compareRuns(r.directory, filtered.directory);
    assert.equal(coverage.totals.unchanged, 3);
    assert.equal(coverage.totals.removed, 3);

    if (process.env.HOOSERGUIDE_RESPONSIVE_ARTIFACTS) {
      const output = resolve(process.env.HOOSERGUIDE_RESPONSIVE_ARTIFACTS);
      await mkdir(output, { recursive: true });
      await cp(pdf.directory, join(output, 'guide'), { recursive: true });
      await page.goto(pathToFileURL(pdf.artifacts.html!).href);
      await page.setViewportSize({ width: 1600, height: 1200 });
      await page
        .locator('.screen-group')
        .first()
        .screenshot({ path: join(output, 'side-by-side.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .locator('.screen-group')
        .first()
        .screenshot({ path: join(output, 'mobile-reader.png') });
    }
  } finally {
    await browser.close();
    await f.close();
  }
});

test('responsive failures and cancellation never expose successful manuals and identify skipped profiles', async () => {
  const f = await fixture();
  try {
    const plugin = join(f.root, 'plugin.mjs');
    await writeFile(
      plugin,
      `export function register(registry){registry.define(/^I require a wide screen$/,async({page})=>{if(page.viewportSize().width<600)throw new Error('Mobile assertion failed');});}`,
    );
    await writeFile(
      f.config.features[0]!,
      feature.replace('Then "role=heading:Settings" is visible', 'Then I require a wide screen'),
    );
    const r = await run({ ...f.config, plugins: [plugin], failFast: true });
    assert.equal(r.report.status, 'failed');
    assert.equal(r.artifacts.html, undefined);
    assert.equal(r.report.chapters[2]!.variant!.profile, 'mobile');
    assert.deepEqual(
      r.report.skippedScenarios?.map((s) => s.profile),
      ['desktop', 'tablet', 'mobile'],
    );
    assert.ok((await inspectRun(r.directory)).report.chapters.length === 3);
    await assert.rejects(build(r.directory), /unsuccessful/);
    const controller = new AbortController();
    const cancelled = await run(
      { ...f.config, plugins: [plugin] },
      {
        signal: controller.signal,
        onProgress: (p) => {
          if (p.completed === 2) controller.abort();
        },
      },
    );
    assert.equal(cancelled.report.status, 'failed');
    assert.equal(cancelled.artifacts.pdf, undefined);
    assert.ok(cancelled.report.skippedScenarios?.some((s) => s.profile === 'mobile'));
  } finally {
    await f.close();
  }
});

test('MCP validates, generates and inspects responsive profile groups with strict output schemas', async () => {
  const f = await fixture();
  const client = new Client({ name: 'responsive-test', version: '1' });
  try {
    const path = join(f.root, 'config.json');
    await writeFile(path, JSON.stringify({ ...f.config, responsive: undefined }));
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', resolve('src/cli.ts'), 'mcp', '--config', path],
        stderr: 'pipe',
      }),
    );
    const responsive = { profiles: ['desktop', 'mobile'], layout: 'side-by-side' };
    const plan = await client.callTool({ name: 'hooserguide_validate', arguments: { responsive } });
    assert.equal(plan.isError, false);
    assert.deepEqual((plan.structuredContent as any).responsive.profiles, responsive.profiles);
    const generated = await client.callTool({
      name: 'hooserguide_generate',
      arguments: { responsive },
    });
    assert.equal(generated.isError, false, JSON.stringify(generated.structuredContent));
    const summary = generated.structuredContent as any;
    assert.equal(summary.chapters.length, 4);
    assert.equal(summary.chapters[1].variant.profile, 'mobile');
    const status = await client.callTool({ name: 'hooserguide_status', arguments: {} });
    assert.equal(status.isError, false);
    const shot = await client.callTool({
      name: 'hooserguide_inspect_capture',
      arguments: { runId: summary.runId, chapter: 2, capture: 1 },
    });
    assert.equal(shot.isError, false);
    const conflict = await client.callTool({
      name: 'hooserguide_generate',
      arguments: { profile: 'desktop', responsive },
    });
    assert.equal(conflict.isError, true);
  } finally {
    await client.close();
    await f.close();
  }
});

test('CLI and GitLab preserve responsive labels, per-screen guidance and engine overrides', async () => {
  const f = await fixture();
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { generateGitlabGuide, gitlabOptionsFromEnvironment } = await import('../src/gitlab.js');
    const plugin = join(f.root, 'guidance.mjs');
    await writeFile(
      plugin,
      `export function register(registry) { registry.define(/^I describe this screen$/, ({config,chapter,instruction}) => { instruction('Use the '+config.profile+' controls.'); chapter.prerequisites=['Prepare '+config.profile+' data.']; chapter.callouts=[{kind:'tip',text:'Tip for '+config.profile}]; }); }`,
    );
    await writeFile(
      f.config.features[0]!,
      feature.replace(
        'And I explain "Review settings for this device."',
        'And I describe this screen',
      ),
    );
    const path = join(f.root, 'config.json');
    await writeFile(
      path,
      JSON.stringify({
        ...f.config,
        plugins: [plugin],
        profiles: { ...profiles, mobile: { ...profiles.mobile, browser: 'webkit' } },
      }),
    );
    // Restore Chromium for the CLI; GitLab must override the WebKit profile below.
    const cliPath = join(f.root, 'cli.json');
    await writeFile(cliPath, JSON.stringify({ ...f.config, plugins: [plugin] }));
    const command = promisify(execFile);
    const args = ['--import', 'tsx', resolve('src/cli.ts')];
    const plan = JSON.parse(
      (
        await command(process.execPath, [
          ...args,
          'validate',
          '--config',
          cliPath,
          '--profiles',
          'desktop,mobile',
          '--json',
        ])
      ).stdout,
    );
    assert.equal(plan.responsive.labels.mobile, 'Mobile');
    assert.equal(plan.responsive.labels.tablet, undefined);
    const generated = JSON.parse(
      (
        await command(process.execPath, [
          ...args,
          'run',
          '--config',
          cliPath,
          '--profiles',
          'desktop,mobile',
          '--screen-layout',
          'stacked',
          '--json',
        ])
      ).stdout,
    );
    assert.equal(generated.status, 'passed');
    const html = await readFile(generated.artifacts.html, 'utf8');
    assert.match(html, /screen-group stacked/);
    for (const name of ['desktop', 'mobile']) {
      assert.ok(html.includes(`Use the ${name} controls.`));
      assert.ok(html.includes(`Prepare ${name} data.`));
      assert.ok(html.includes(`Tip for ${name}`));
    }
    const layout = await build(generated.directory, {
      output: join(f.root, 'guidance-pdf'),
      pdf: true,
    });
    assert.equal(layout.report.status, 'passed', layout.report.exportError);
    const config = gitlabOptionsFromEnvironment({
      CI_PROJECT_DIR: f.root,
      HOOSERGUIDE_CI_CONFIG: 'config.json',
      HOOSERGUIDE_CI_OUTPUT: 'ci',
      HOOSERGUIDE_CI_PROFILES: 'desktop,mobile',
      HOOSERGUIDE_CI_SCREEN_LAYOUT: 'side-by-side',
      HOOSERGUIDE_CI_PDF: 'false',
      HOOSERGUIDE_CI_BUNDLE: 'false',
    });
    const summary = await generateGitlabGuide(config);
    assert.equal(summary.status, 'passed', summary.error);
    assert.deepEqual(
      summary.chapters?.map((c) => c.variant?.browser),
      ['chromium', 'chromium', 'chromium', 'chromium'],
    );
    assert.equal(summary.responsive?.labels?.mobile, 'Mobile');
    const conflicting = await generateGitlabGuide({
      ...config,
      output: 'conflict',
      profile: 'desktop',
    });
    assert.equal(conflicting.status, 'failed');
    assert.match(conflicting.error!, /profile or responsive/);
  } finally {
    await f.close();
  }
});
