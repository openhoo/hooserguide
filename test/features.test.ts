import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { assignLabels, captureScreenshot, validateCapture } from '../src/capture.js';
import { resolveConfig, selectProfile } from '../src/config.js';
import { builtinSteps } from '../src/steps.js';
import { run, validate, loadRegistry } from '../src/runner.js';
import { build } from '../src/build.js';
import type { Config } from '../src/types.js';

test('automatic labels skip explicit references and crop conflicts fail preflight', () => {
  assert.deepEqual(
    assignLabels({
      title: 'Numbers',
      autoLabels: 'numbers',
      marks: [{ target: 'a', label: '2' }, { target: 'b' }, { target: 'c' }],
    }).map((m) => m.label),
    ['2', '1', '3'],
  );
  assert.deepEqual(
    assignLabels({
      title: 'Letters',
      autoLabels: 'letters',
      marks: [{ target: 'a', label: 'A' }, { target: 'b' }, { target: 'c' }],
    }).map((m) => m.label),
    ['A', 'B', 'C'],
  );
  const many = assignLabels({
    title: 'Many',
    autoLabels: 'letters',
    marks: Array.from({ length: 27 }, () => ({ target: 'button' })),
  });
  assert.equal(many[26]!.label, 'AA');
  assert.throws(
    () =>
      validateCapture({
        title: 'Duplicate',
        marks: [
          { target: 'a', label: 'A' },
          { target: 'b', label: 'A' },
        ],
      }),
    /unique/,
  );
  assert.throws(() => validateCapture({ title: 'Conflict', focus: 'a', fullPage: true }), /cannot/);
  assert.throws(() => validateCapture({ title: 'Padding', padding: 20 }), /requires/);
});

test('profiles inherit defaults and unknown/incompatible profiles fail', () => {
  const base = {
    title: 'Profiles',
    baseURL: 'https://example.test',
    features: ['*.feature'],
    output: 'out',
    viewport: { width: 1200, height: 800 },
    profiles: { mobile: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  };
  assert.deepEqual(selectProfile(resolveConfig({ ...base, profile: 'mobile' })).viewport, {
    width: 390,
    height: 844,
  });
  assert.equal(selectProfile(resolveConfig({ ...base, profile: 'mobile' })).deviceScaleFactor, 1);
  assert.throws(() => resolveConfig({ ...base, profile: 'missing' }), /Unknown/);
  assert.throws(() => resolveConfig({ ...base, profile: 'toString' }), /Unknown/);
  assert.throws(
    () =>
      resolveConfig({
        ...base,
        browser: 'firefox',
        profile: 'mobile',
        profiles: { mobile: { isMobile: true } },
      }),
    /Firefox/,
  );
});

test('focused captures preserve masking, CSS coordinates and hashes after scroll at high DPI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-focus-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 2,
    });
    await page.setContent(
      '<style>body{margin:0;height:1900px}#panel{position:absolute;top:1400px;left:100px;width:300px;height:200px;background:white}#secret{position:absolute;top:20px;left:20px;width:100px;height:30px}#button{position:absolute;top:100px;left:40px;width:100px;height:30px}</style><section id=panel><span id=secret>PRIVATE</span><button id=button>Save</button></section>',
    );
    await page.locator('#panel').scrollIntoViewIfNeeded();
    const shot = await captureScreenshot(
      page,
      {
        title: 'Focus',
        focus: '#panel',
        padding: 24,
        autoLabels: 'letters',
        masks: ['#secret'],
        marks: [{ target: '#button', kind: 'both', caption: 'Save' }],
      },
      root,
      'focus',
    );
    assert.deepEqual(shot.crop, { x: 76, y: 1376, width: 348, height: 248 });
    assert.equal(shot.width, 348);
    assert.equal(shot.height, 248);
    assert.deepEqual(shot.marks[0]!.bounds, { x: 64, y: 124, width: 100, height: 30 });
    assert.equal(shot.marks[0]!.label, 'A');
    const raw = await readFile(join(root, shot.raw));
    assert.equal(shot.rawSha256, createHash('sha256').update(raw).digest('hex'));
    const pixels = await sharp(raw).raw().toBuffer({ resolveWithObject: true });
    const offset = (50 * pixels.info.width + 50) * pixels.info.channels;
    assert.deepEqual([...pixels.data.subarray(offset, offset + 3)], [17, 24, 39]);
    await assert.rejects(
      captureScreenshot(
        page,
        { title: 'Outside', focus: '#button', padding: 0, marks: [{ target: '#secret' }] },
        root,
        'outside',
      ),
      /outside screenshot/,
    );
    await assert.rejects(
      captureScreenshot(page, { title: 'Path' }, root, '../escape'),
      /Screenshot ID/,
    );
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('step catalogue includes usable examples and custom plugin documentation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-catalogue-'));
  try {
    const registry = builtinSteps();
    assert.ok(registry.list().length >= 30);
    for (const step of registry.list()) {
      assert.ok(step.example);
      assert.ok(step.description);
      registry.resolve(step.example!);
    }
    const plugin = join(root, 'steps.mjs');
    await writeFile(
      plugin,
      'export function register(r) { r.define(/^the account is persisted$/, () => {}, { example: "the account is persisted", description: "Check persistence" }); }',
    );
    const custom = await loadRegistry({ plugins: [plugin] } as Config);
    assert.ok(custom.list().some((s) => s.description === 'Check persistence'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const app = `<!doctype html><title>Profile editor</title><style>body{font:16px system-ui;margin:24px}input,button{margin:8px}#panel{padding:20px;background:#f0f4f8;width:300px}#drop{height:60px;border:1px solid}#tooltip{display:none}</style>
<h1>Profile</h1><form id=panel><label>Name<input id=name></label><label>Email<input id=email></label><label>Notify<input id=notify type=checkbox></label><label>Attachment<input id=upload type=file></label><button id=save type=submit data-state=ready>Save</button></form>
<button id=help onmouseenter="document.getElementById('tooltip').style.display='block'">Help</button><span id=tooltip>Helpful tooltip</span><button id=double ondblclick="document.getElementById('double-result').textContent='Opened'">Open item</button><div id=double-result></div><button id=disabled disabled>Unavailable</button><div id=hidden hidden>Hidden</div>
<div id=drag draggable=true ondragstart="event.dataTransfer.setData('text/plain','task')">Task</div><div id=drop ondragover="event.preventDefault()" ondrop="event.preventDefault();this.textContent='Dropped'">Drop here</div><div id=upload-result></div>
<script>const n=document.getElementById('name');n.value=localStorage.getItem('name')||'';document.getElementById('panel').onsubmit=e=>{e.preventDefault();localStorage.setItem('name',n.value)};document.getElementById('upload').onchange=e=>{document.getElementById('upload-result').textContent=e.target.files[0].name};</script>`;

test('real BDD form tables, uploads, drag-and-drop, navigation, assertions and mobile profiles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-actions-'));
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(req.url === '/second' ? '<title>Second</title><h1>Second</h1>' : app);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    await writeFile(join(root, 'attachment.txt'), 'sample upload');
    const feature = join(root, 'profile.feature');
    await writeFile(
      feature,
      `Feature: Profile
 Scenario: Edit profile
  Given I open "/"
  Then the URL is "/"
  And the page title is "Profile editor"
  When I fill the form:
   | selector | value |
   | label=Name | Demo User |
   | label=Email | demo@example.test |
  Then "label=Name" has value "Demo User"
  And "label=Email" has value "demo@example.test"
  And "#hidden" is hidden
  And "role=button:Save" is enabled
  And "role=button:Unavailable" is disabled
  And "role=button:Save" has attribute "data-state" with value "ready"
  And "css=#panel input" has count 4
  When I check "label=Notify"
  Then "label=Notify" is checked
  When I uncheck "label=Notify"
  Then "label=Notify" is unchecked
  When I clear "label=Email"
  Then "label=Email" has value ""
  When I hover "role=button:Help"
  Then "#tooltip" is visible
  And "#tooltip" contains text "Helpful"
  When I double click "role=button:Open item"
  Then "#double-result" has text "Opened"
  When I drag "#drag" to "#drop"
  Then "#drop" has text "Dropped"
  When I upload "attachment.txt" to "label=Attachment"
  Then "#upload-result" has text "attachment.txt"
  When I click "role=button:Save"
  And I reload the page
  Then "label=Name" has value "Demo User"
  When I open "/second"
  Then the page title is "Second"
  When I go back
  Then the URL is "/"
  When I go forward
  Then the URL is "/second"
  And I capture "Second page"
`,
    );
    const config: Config = {
      title: 'Advanced steps',
      baseURL: `http://127.0.0.1:${address.port}`,
      features: [feature],
      output: join(root, 'out'),
      pdf: false,
      timeoutMs: 2000,
      profiles: {
        mobile: {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        },
      },
      profile: 'mobile',
    };
    const result = await run(config);
    assert.equal(result.report.status, 'passed', result.report.chapters[0]?.error);
    assert.equal(result.report.profile, 'mobile');
    assert.equal(result.report.chapters[0]!.captures[0]!.width, 390);
    assert.ok(
      result.report.chapters[0]!.steps.every(
        (s) => s.durationMs !== undefined && s.durationMs >= 0,
      ),
    );
    await writeFile(
      feature,
      'Feature: Invalid table\n Scenario: Form\n  When I fill the form:\n   | field | value |\n   | Name | Demo |\n',
    );
    await assert.rejects(validate(config), /selector and value/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('evidence-only builds preserve capture hashes, reject tampering and keep earlier runs untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-build-'));
  try {
    const result = await build('docs/demo', {
      output: join(root, 'built'),
      branding: { name: 'Acme', subtitle: 'Your verified handbook', accentColor: '#7c3aed' },
    });
    assert.equal(result.report.status, 'passed', result.report.exportError);
    assert.ok(result.report.rebuiltAt);
    assert.ok(result.report.sourceReportSha256);
    assert.equal(
      result.report.generatedAt,
      JSON.parse(await readFile('docs/demo/report.json', 'utf8')).generatedAt,
    );
    const html = await readFile(result.artifacts.html!, 'utf8');
    assert.match(html, /--accent:#7c3aed/);
    assert.match(html, /Your verified handbook/);
    assert.match(html, />Acme</);
    assert.ok(result.artifacts.pdf);
    await assert.rejects(build(result.directory, { output: result.directory }), /must differ/);
    const image = result.report.chapters[0]!.captures[0]!;
    const bytes = await readFile(join(result.directory, image.image));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256);
    const rawPath = join(result.directory, image.raw);
    const originalRaw = await readFile(rawPath);
    await writeFile(rawPath, Buffer.from('tampered raw'));
    await assert.rejects(build(result.directory, { output: join(root, 'invalid'), pdf: false }), {
      code: 'HASH_MISMATCH',
    });
    await writeFile(rawPath, originalRaw);
    await writeFile(join(result.directory, image.image), Buffer.from('tampered'));
    await assert.rejects(build(result.directory, { output: join(root, 'invalid'), pdf: false }), {
      code: 'HASH_MISMATCH',
    });
    assert.deepEqual(await readdir(join(root, 'invalid')), []);
    const report = JSON.parse(await readFile(join(result.directory, 'report.json'), 'utf8'));
    report.chapters[0].steps[0].status = 'failed';
    await writeFile(join(result.directory, 'report.json'), JSON.stringify(report));
    await assert.rejects(build(result.directory), /unsuccessful/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rebuild refuses artifacts that resolve outside the evidence directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-symlink-'));
  try {
    const result = await build('docs/demo', { output: join(root, 'built'), pdf: false });
    const shot = result.report.chapters[0]!.captures[0]!;
    const path = join(result.directory, shot.image),
      external = join(root, 'external.png');
    await writeFile(external, await readFile(path));
    await rm(path);
    await symlink(external, path);
    await assert.rejects(build(result.directory, { output: join(root, 'invalid'), pdf: false }), {
      code: 'UNSAFE_PATH',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
