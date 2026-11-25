import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { auditRun, auditSchema } from '../src/audit.js';
import { readerCopyIssues } from '../src/reader-review.js';
import { lint } from '../src/authoring.js';
import type { RunReport, Capture } from '../src/types.js';

const cli = promisify(execFile);
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'test-run');
  await mkdir(join(path, 'screenshots'), { recursive: true });
  const png = await sharp({ create: { width: 120, height: 240, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  const sha = createHash('sha256').update(png).digest('hex');
  const shot: Capture = {
    id: '1',
    title: 'Settings',
    image: 'screenshots/1.png',
    raw: 'screenshots/1.raw.png',
    height: 240,
    width: 120,
    sha256: sha,
    rawSha256: sha,
    marks: [],
  };
  const report: RunReport = {
    schemaVersion: 1,
    title: 'Preferences',
    generatedAt: '2026-01-01T12:00:00.000Z',
    language: 'en',
    browser: 'chromium',
    status: 'passed',
    chapters: [
      {
        title: 'Set a preference',
        feature: 'Preferences',
        source: 'settings.feature',
        tags: [],
        status: 'passed',
        description: 'Choose your settings.',
        instructions: ['Open Settings.'],
        steps: [
          { text: '"label=Name" is visible', status: 'passed' },
          { text: 'I capture "Settings"', status: 'passed' },
        ],
        captures: [shot],
      },
    ],
  };
  const save = async () => writeFile(join(path, 'report.json'), JSON.stringify(report));
  await Promise.all([
    save(),
    writeFile(join(path, 'index.html'), 'Guide'),
    writeFile(join(path, 'handbook.md'), 'Guide'),
    writeFile(join(path, shot.image), png),
    writeFile(join(path, shot.raw), png),
  ]);
  return { path, root, shot, sha, png, report, chapter: report.chapters[0]!, save };
}

test('audit verifies both PNGs and points to reader copy, not private step arguments or selectors', async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await auditRun(f.path)).findings, []);
  const c = f.chapter;
  c.location = { line: 3, column: 2 };
  c.sourceSha256 = f.sha;
  c.instructions = ['Select role=button:PRIVATE_NAME.'];
  c.callouts = [{ kind: 'note', text: 'TODO' }];
  c.steps = [
    {
      text: '"role=heading:Settings" is visible',
      status: 'passed',
      kind: 'assertion',
      location: { line: 4, column: 3 },
    },
    {
      text: 'I click "role=button:PRIVATE_NAME"',
      status: 'passed',
      kind: 'action',
      location: { line: 5, column: 3 },
    },
    {
      text: 'I capture "Settings"',
      status: 'passed',
      kind: 'capture',
      location: { line: 6, column: 3 },
    },
  ];
  f.shot.step = 3;
  f.shot.marks = [
    { target: 'testid=save', label: 'A', bounds: { x: 2, y: 100, width: 20, height: 30 } },
  ];
  await f.save();
  const a = auditSchema.parse(await auditRun(f.path));
  assert.equal(a.verifiedImages, 2);
  assert.equal(a.visualReview, 'required');
  assert.deepEqual(
    a.findings.map((x) => [x.code, x.step, x.line, x.field]),
    [
      ['UNCHECKED_ACTION', 2, 5, undefined],
      ['SELECTOR_COPY', undefined, 3, 'instruction 1'],
      ['DRAFT_COPY', undefined, 3, 'callout 1'],
      ['EMPTY_LEGEND', 3, 6, undefined],
    ],
  );
  assert.equal(a.findings.at(-1)?.mark, 1);
  assert.ok(!JSON.stringify(a).includes('PRIVATE_NAME'));
  await assert.rejects(
    cli(process.execPath, [
      '--import',
      'tsx',
      resolve('src/cli.ts'),
      'audit',
      f.path,
      '--strict',
      '--json',
    ]),
    (e: any) => e.code === 1 && JSON.parse(e.stdout).warnings === 4,
  );
  assert.equal(
    JSON.parse(
      (
        await cli(process.execPath, [
          '--import',
          'tsx',
          resolve('src/cli.ts'),
          'audit',
          f.path,
          '--json',
        ])
      ).stdout,
    ).runStatus,
    'passed',
  );
  c.steps.push({
    text: 'a plugin checks the saved state',
    kind: 'custom',
    status: 'passed',
    location: { line: 7, column: 3 },
  });
  await f.save();
  assert.ok(!(await auditRun(f.path)).findings.some((f) => f.code === 'UNCHECKED_ACTION'));
});

test('PDF audit distinguishes gaps, repeated IDs, legitimate slice edges and split controls', async (t) => {
  const f = await fixture(t);
  f.shot.marks = [
    {
      target: '#save',
      kind: 'box',
      label: 'A',
      caption: 'Save',
      bounds: { x: 20, y: 100, width: 40, height: 20 },
    },
  ];
  await f.save();
  // The audit checks the layout metadata, not the document's visual rendering.
  await writeFile(join(f.path, 'handbook.pdf'), '%PDF-1.7\n%%EOF\n');
  const layout = join(f.path, 'pdf-layout.json');
  assert.deepEqual(
    (await auditRun(f.path)).findings.map((x) => x.code),
    ['PDF_LAYOUT_MISSING'],
  );
  const parts = (seam: number) => [
    { top: 0, height: seam },
    { top: seam, height: 240 - seam },
  ];
  const put = (figures: unknown, warnings: string[] = []) =>
    writeFile(layout, JSON.stringify({ pages: 4, warnings, figures }));
  await put([{ id: '1', slices: parts(110) }]);
  const seam = await auditRun(f.path);
  assert.equal(seam.layoutPages, 4);
  assert.equal(seam.pdfHashVerified, false);
  assert.deepEqual(
    seam.findings.map((f) => [f.code, f.chapter, f.capture, f.mark]),
    [['PDF_SPLIT_TARGET', 1, 1, 1]],
  );
  await put([{ id: '1', slices: parts(120) }]);
  assert.deepEqual(
    (await auditRun(f.path)).findings.map((x) => x.code),
    ['PDF_UNMARKED_SLICE'],
  );
  await put([
    {
      id: '1',
      slices: [
        { top: 0, height: 150 },
        { top: 149, height: 91 },
      ],
    },
  ]);
  assert.equal((await auditRun(f.path)).errors, 1);
  await put([{ id: 'other', slices: parts(100) }]);
  assert.equal((await auditRun(f.path)).errors, 2);
  await put(
    [
      { id: '1', slices: [{ top: 0, height: 240 }] },
      { id: '1', slices: parts(100) },
    ],
    ['arbitrary private warning'],
  );
  const repeat = await auditRun(f.path);
  assert.equal(repeat.errors, 1);
  assert.equal(repeat.warnings, 1);
  assert.ok(!JSON.stringify(repeat).includes('arbitrary private'));
  const pdfSha256 = createHash('sha256').update('%PDF-1.7\n%%EOF\n').digest('hex');
  await writeFile(
    layout,
    JSON.stringify({
      pages: 4,
      pdfSha256,
      warnings: [],
      figures: [{ id: '1', slices: [{ top: 0, height: 240 }] }],
    }),
  );
  assert.equal((await auditRun(f.path)).pdfHashVerified, true);
  await writeFile(join(f.path, 'handbook.pdf'), '%PDF-1.7\nA different document\n%%EOF\n');
  const swapped = await auditRun(f.path);
  assert.deepEqual(
    swapped.findings.map((x) => x.code),
    ['PDF_HASH_MISMATCH'],
  );
  assert.equal(swapped.layoutPages, undefined);
  await writeFile(layout, 'not JSON');
  assert.equal((await auditRun(f.path)).errors, 1);
  await rm(join(f.path, 'handbook.pdf'));
  assert.deepEqual(
    (await auditRun(f.path)).findings.map((x) => x.code),
    ['PDF_FILE_MISSING'],
  );
  await writeFile(join(f.path, 'handbook.pdf'), '%PDF-1.7 truncated');
  await put([{ id: '1', slices: [{ top: 0, height: 240 }] }]);
  assert.deepEqual(
    (await auditRun(f.path)).findings.map((x) => x.code),
    ['PDF_FILE_INVALID'],
  );
  await rm(layout);
  const outside = join(f.root, 'unrelated.json');
  await writeFile(outside, '{}');
  await symlink(outside, layout);
  await assert.rejects(auditRun(f.path), { code: 'UNSAFE_PATH' });
});

test('legacy, duplicate, failed and modified evidence are distinguished', async (t) => {
  const f = await fixture(t);
  const other = {
    ...f.shot,
    id: '2',
    title: 'Another state',
    image: 'screenshots/2.png',
    raw: 'screenshots/2.raw.png',
  };
  delete other.rawSha256;
  f.chapter.captures.push(other);
  await Promise.all([
    writeFile(join(f.path, other.image), f.png),
    writeFile(join(f.path, other.raw), f.png),
    f.save(),
  ]);
  const a = await auditRun(f.path);
  assert.equal(a.verifiedImages, 3);
  assert.equal(a.legacyRawWithoutHash, 1);
  assert.deepEqual(
    a.findings.map((f) => [f.code, f.capture]),
    [
      ['LEGACY_RAW', 2],
      ['REPEATED_FIGURE', 2],
    ],
  );
  f.report.status = 'failed';
  f.chapter.status = 'failed';
  await f.save();
  assert.equal((await auditRun(f.path)).errors, 1);
  await writeFile(join(f.path, f.shot.raw), 'different bytes');
  await assert.rejects(auditRun(f.path), { code: 'HASH_MISMATCH' });
});

test('authoring lint finds reader defects where they are written and a precondition before Save', async (t) => {
  const f = await fixture(t);
  const file = join(f.root, 'guide.feature');
  await writeFile(
    file,
    [
      'Feature: Settings',
      ' Scenario: Update settings',
      '  Pick a preference.',
      '  Given "role=heading:Settings" is visible',
      '  And I explain "Select Save."',
      '  When I click "role=button:Save"',
      '  And I add a tip "REPLACE_ME_TIP"',
      '  And I capture "Saved settings"',
      '   """json',
      '   {"description":"Check testid=private.","marks":[{"target":"role=button:Save","label":"A"}]}',
      '   """',
    ].join('\n'),
  );
  const a = await lint({
    title: 'Guide',
    baseURL: 'http://127.0.0.1:1',
    output: f.root,
    features: [file],
  });
  assert.equal(a.executed, false);
  assert.equal(a.valid, true);
  assert.deepEqual(a.diagnostics.map((d) => [d.code, d.line]).sort(), [
    ['EMPTY_LEGEND', 8],
    ['PLACEHOLDER', 7],
    ['SELECTOR_COPY', 8],
    ['UNCHECKED_ACTION', 6],
  ]);
});

test('legacy steps are checked conservatively and ordinary reader language is preserved', async (t) => {
  const f = await fixture(t);
  f.chapter.steps = [
    { text: 'I open "/"', status: 'passed' },
    { text: 'I capture "Settings"', status: 'passed' },
  ];
  await f.save();
  assert.deepEqual(
    (await auditRun(f.path)).findings.map((x) => x.code),
    ['MISSING_OUTCOME'],
  );
  f.chapter.steps.unshift({ text: 'I click "role=button:Save"', status: 'passed' });
  await f.save();
  assert.deepEqual(
    (await auditRun(f.path)).findings.map((x) => x.code),
    ['UNCHECKED_ACTION'],
  );
  f.chapter.steps.push({ text: 'a custom step verifies the change', status: 'passed' });
  await f.save();
  assert.deepEqual((await auditRun(f.path)).findings, []);
  for (const copy of [
    'Selecciona todo el texto.',
    'All of the todo items.',
    'Open the Settings label.',
    'Go to example.test/?label=first',
  ])
    assert.deepEqual(readerCopyIssues(copy), []);
  for (const selector of ['label=Email', 'text=Save', 'css=button'])
    assert.deepEqual(readerCopyIssues('Select ' + selector), ['SELECTOR_COPY']);
});
