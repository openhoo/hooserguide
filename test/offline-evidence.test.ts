import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, symlink, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { inspectRun, loadRunDirectory } from '../src/evidence.js';
import { compareResults } from '../src/compare.js';
import { build } from '../src/build.js';
import { preparePages } from '../src/pages.js';
import { assertReportIntegrity } from '../src/report.js';
import type { RunReport } from '../src/types.js';

test('truncated pixel data fails inspection and offline publication, including legacy raw evidence', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-pixels-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'run');
  await cp('docs/demo', source, { recursive: true });
  const reportPath = join(source, 'report.json');
  const report: RunReport = JSON.parse(await readFile(reportPath, 'utf8'));
  const shot = report.chapters[0]!.captures[0]!;
  const path = join(source, shot.raw);
  const bytes = await readFile(path);
  const footerMissing = bytes.subarray(0, -1);
  await writeFile(path, footerMissing);
  delete shot.rawSha256;
  await writeFile(reportPath, JSON.stringify(report));
  await assert.rejects(inspectRun(source), { code: 'INVALID_ARTIFACT' });
  // With the final marker still present, a header check is insufficient: pixels must decode.
  const partial = Buffer.concat([bytes.subarray(0, bytes.length >> 1), bytes.subarray(-12)]);
  await writeFile(path, partial);
  for (const hash of [undefined, createHash('sha256').update(partial).digest('hex')]) {
    shot.rawSha256 = hash;
    await writeFile(reportPath, JSON.stringify(report));
    await assert.rejects(inspectRun(source), { code: 'INVALID_ARTIFACT' });
    await assert.rejects(build(source, { output: join(root, 'rebuilt'), pdf: false }), {
      code: 'INVALID_ARTIFACT',
    });
    assert.deepEqual(await readdir(join(root, 'rebuilt')), []);
  }
});

test('rebuild preserves the source directory and excludes unverified SVG sidecars', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-build-preserve-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'run');
  await cp('docs/demo', source, { recursive: true });
  const alias = join(root, 'alias');
  await symlink(source, alias, 'dir');
  const before = await readdir(source);
  for (const parent of [source, alias]) {
    await assert.rejects(
      build(source, { output: join(parent, 'new', 'nested'), pdf: false }),
      /inside/,
    );
    assert.deepEqual(await readdir(source), before);
  }
  const sidecar = 'screenshots/01-01.overlay.svg';
  const unverified = '<svg>stale vector overlay</svg>';
  await writeFile(join(source, sidecar), unverified);
  const rebuilt = await build(source, { output: root, pdf: false });
  assert.equal(rebuilt.report.status, 'passed');
  await assert.rejects(readFile(join(rebuilt.directory, sidecar)), { code: 'ENOENT' });
  assert.equal(await readFile(join(source, sidecar), 'utf8'), unverified);
});

test('Pages ZIP and individual downloads trace back to the same original execution report', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-pages-archive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const site = await preparePages('docs/demo', { root });
  const pack = unzipSync(await readFile(join(site.directory, 'handbook.zip')));
  const manifest = JSON.parse(Buffer.from(pack['bundle-manifest.json']!).toString());
  const expected = createHash('sha256')
    .update(await readFile('docs/demo/report.json'))
    .digest('hex');
  assert.equal(site.sourceReportSha256, expected);
  assert.equal(manifest.sourceReportSha256, expected);
  for (const { path, bytes, sha256 } of manifest.files) {
    const entry = Buffer.from(pack[path]!);
    assert.equal(entry.length, bytes, path);
    assert.equal(createHash('sha256').update(entry).digest('hex'), sha256, path);
    if (path === 'index.html') assert.doesNotMatch(entry.toString(), /href="handbook.zip"/);
    else assert.deepEqual(entry, await readFile(join(site.directory, path)), path);
  }
});

test('comparison reports a changed crop origin and a loss of raw evidence verification', async () => {
  const before = await loadRunDirectory('docs/demo');
  const after = structuredClone(before);
  const shot = before.report.chapters[0]!.captures[0]!;
  const changed = after.report.chapters[0]!.captures[0]!;
  shot.crop = { x: 0, y: 20, width: shot.width, height: shot.height };
  changed.crop = { ...shot.crop, y: 100 };
  const crop = (await compareResults(before, after)).chapters[0]!.captures[0]!;
  assert.equal(crop.change, 'changed');
  assert.equal(crop.pixelsChanged, false);
  changed.crop = shot.crop;
  delete changed.rawSha256;
  const hash = (await compareResults(before, after)).chapters[0]!.captures[0]!;
  assert.equal(hash.change, 'changed');
  assert.equal(hash.rawHashesAvailable, false);
  assert.equal(hash.pixelsChanged, undefined);
});

test('portable evidence rejects PNG paths that alias each other when extracted', async () => {
  const { report } = await loadRunDirectory('docs/demo');
  const a = report.chapters[0]!.captures[0]!,
    b = report.chapters[0]!.captures[1]!;
  a.image = 'screenshots/Profile.png';
  b.raw = 'screenshots/profile.png';
  assert.throws(() => assertReportIntegrity(report), /duplicate screenshot IDs or paths/);
});
