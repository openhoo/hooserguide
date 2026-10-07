import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, symlink, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { bundle } from '../src/bundle.js';
import { compareResults } from '../src/compare.js';
import { loadRunDirectory, loadRunSnapshot, readRunArtifact } from '../src/evidence.js';
import { assertReportIntegrity } from '../src/report.js';
import { preparePages } from '../src/pages.js';

test('bundles regenerate tampered manuals and layout from verified portable evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-bundle-review-'));
  try {
    const source = join(root, 'source');
    await cp('docs/demo', source, { recursive: true });
    const reportPath = join(source, 'report.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    report.chapters[0].source = join(root, 'private', 'settings.feature');
    await writeFile(reportPath, JSON.stringify(report));
    const original = await readFile(reportPath);
    const tampered = '<script>UNVERIFIED_EXPORT_PRIVATE</script>';
    for (const name of ['index.html', 'handbook.md', 'handbook.pdf', 'pdf-layout.json'])
      await writeFile(join(source, name), tampered);
    const result = await bundle(source, join(root, 'guide.zip'));
    const zip = unzipSync(await readFile(result.path));
    assert.equal(result.sourceReportSha256, createHash('sha256').update(original).digest('hex'));
    assert.equal(Buffer.from(zip['handbook.pdf']!).subarray(0, 5).toString(), '%PDF-');
    assert.match(Buffer.from(zip['index.html']!).toString(), /<!doctype html>/i);
    assert.ok(JSON.parse(Buffer.from(zip['pdf-layout.json']!).toString()));
    for (const name of [
      'index.html',
      'handbook.md',
      'handbook.pdf',
      'pdf-layout.json',
      'report.json',
    ]) {
      const text = Buffer.from(zip[name]!).toString();
      assert.ok(!text.includes('UNVERIFIED_EXPORT_PRIVATE'), name);
      assert.ok(!text.includes(root), name);
    }
    assert.equal(
      JSON.parse(Buffer.from(zip['report.json']!).toString()).chapters[0].source,
      'settings.feature',
    );
    assert.equal(await readFile(join(source, 'index.html'), 'utf8'), tampered);
    assert.deepEqual(await readFile(reportPath), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('direct result comparison rejects forged success and unsafe screenshot paths', async () => {
  const original = await loadRunDirectory('docs/demo');
  const forged = structuredClone(original);
  forged.report.chapters[0]!.steps[0]!.status = 'failed';
  await assert.rejects(compareResults(original, forged), /claims success/);
  const unsafe = structuredClone(original);
  unsafe.report.chapters[0]!.captures[0]!.image = '../outside.png';
  await assert.rejects(compareResults(original, unsafe));
});

test('crop metadata must match the persisted screenshot dimensions', async () => {
  const original = await loadRunDirectory('docs/demo');
  const report = structuredClone(original.report);
  const capture = report.chapters[0]!.captures[0]!;
  capture.crop = { x: 100, y: 100, width: capture.width - 1, height: capture.height };
  assert.throws(() => assertReportIntegrity(report), /Crop dimensions differ/);
  capture.crop.width = capture.width;
  assert.doesNotThrow(() => assertReportIntegrity(report));
});

test('bounded report snapshots preserve the exact parsed source bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-snapshot-review-'));
  try {
    await cp('docs/demo', root, { recursive: true });
    const path = join(root, 'report.json');
    const original = await readFile(path);
    const snapshot = await loadRunSnapshot(root);
    const changed = structuredClone(snapshot.run.report);
    changed.title = 'Later report';
    await writeFile(path, JSON.stringify(changed));
    assert.deepEqual(snapshot.reportBytes, original);
    assert.equal(JSON.parse(snapshot.reportBytes.toString()).title, snapshot.run.report.title);
    assert.notEqual(snapshot.run.report.title, (await loadRunDirectory(root)).report.title);
    for (const limit of [-1, NaN, Infinity, 0.5])
      await assert.rejects(readRunArtifact(root, 'report.json', limit), /safe integer/);
    await assert.rejects(readRunArtifact(root, 'report.json', 1), { code: 'ARTIFACT_TOO_LARGE' });
    await writeFile(join(root, 'empty'), '');
    assert.deepEqual(await readRunArtifact(root, 'empty', 0), Buffer.alloc(0));
    const bytes = Buffer.alloc(128 * 1024 + 17, 42);
    await writeFile(join(root, 'chunks'), bytes);
    assert.deepEqual(await readRunArtifact(root, 'chunks', bytes.length), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Pages cannot write into source evidence through a workspace symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-pages-source-review-'));
  try {
    const source = join(root, 'source');
    await cp('docs/demo', source, { recursive: true });
    const before = await readdir(source);
    await symlink(source, join(root, 'alias'));
    for (const output of ['alias/site', 'alias/new-parent/site']) {
      await assert.rejects(
        preparePages(source, { root, output }),
        /separate from the source evidence/,
      );
      assert.deepEqual(await readdir(source), before);
    }
    await assert.rejects(access(join(source, 'site')));
    await assert.rejects(access(join(source, 'new-parent')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
