import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderWiki, writeWiki } from '../scripts/wiki.mjs';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-wiki-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs/wiki'), { recursive: true });
  await writeFile(join(root, 'docs/wiki/Home.md'), '# Welcome\n');
  await writeFile(join(root, 'docs/wiki/_Sidebar.md'), '[Welcome](Home.md)\n');
  await writeFile(
    join(root, 'docs/authoring.md'),
    '# Authoring\n\n## A `heading`!\n\n## A heading\n',
  );
  return root;
}

test('wiki renders real links and duplicate heading anchors, preserving Markdown examples', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'docs/picture (one).png'), 'example-image');
  await writeFile(join(root, 'docs/download.zip'), 'example-archive');
  await writeFile(join(root, 'note.md'), 'repository notes');
  await writeFile(
    join(root, 'docs/wiki/Home.md'),
    [
      '# Welcome',
      '',
      '[See `]` and **details**](../authoring.md#a-heading-1 "Preserve this title")',
      '',
      '[picture]: <../picture (one).png>',
      '',
      '![Figure][picture]',
      '[ZIP](../download.zip) [Notes](../../note.md) [Other](https://example.test/)',
      '<a href="../authoring.md#a-heading">Authoring</a>',
      '',
      '```gherkin',
      '[example](missing.md#example)',
      '```',
      '',
      '[Section](#welcome) and `[literal](missing.md)`',
    ].join('\n'),
  );
  const args = { root, repo: 'fixture/guide', ref: 'aa1122' };
  const files = await renderWiki(args);
  assert.deepEqual([...files.keys()].sort(), ['Authoring.md', 'Home.md', '_Sidebar.md']);
  assert.deepEqual(files, await renderWiki(args));
  const home = files.get('Home.md')!;
  assert.match(home, /wiki\/Authoring#a-heading-1 "Preserve this title"/);
  assert.match(home, /raw\/aa1122\/docs\/picture%20%28one%29\.png/);
  assert.match(home, /raw\/aa1122\/docs\/download.zip/);
  assert.match(home, /blob\/aa1122\/note.md/);
  assert.match(home, /<a href="https:\/\/github.com\/fixture\/guide\/wiki\/Authoring#a-heading">/);
  assert.match(home, /wiki\/Home#welcome/);
  assert.ok(home.includes('[Other](https://example.test/)'));
  assert.ok(home.includes('```gherkin\n[example](missing.md#example)\n```'));
  assert.ok(home.includes('`[literal](missing.md)`'));
  for (const [link, error] of [
    ['../authoring.md#wrong', 'Unknown section'],
    ['https://github.com/fixture/guide/wiki/Missing', 'Unknown wiki page'],
    ['../file-missing.png', 'Missing link target'],
    ['../../../outside', 'Link escapes repository'],
  ]) {
    await writeFile(join(root, 'docs/wiki/Home.md'), '# Welcome\n\n[Broken](' + link + ')');
    await assert.rejects(
      renderWiki(args),
      (err) => String(err).includes('Home.md:3') && String(err).includes(error!),
    );
  }
});

test('wiki only updates managed pages; reports drift and refuses collisions before writing', async (t) => {
  const root = await fixture(t);
  const output = join(root, 'clone');
  await mkdir(output);
  const files = await renderWiki({ root });
  await writeFile(join(output, 'Community.md'), 'Community notes');
  await writeFile(join(output, 'Home.md'), 'Unrelated seed');
  await assert.rejects(writeWiki(files, output), /unmanaged.*Home/);
  assert.deepEqual((await readdir(output)).sort(), ['Community.md', 'Home.md']);
  await rm(join(output, 'Home.md'));
  const first = await writeWiki(files, output);
  assert.equal(first.written, 3);
  assert.deepEqual(await writeWiki(files, output, { check: true }), {
    pages: 3,
    written: 0,
    removed: 0,
  });
  await writeFile(join(root, 'docs/wiki/Home.md'), '# Updated\n');
  await rm(join(root, 'docs/authoring.md'));
  const updated = await renderWiki({ root });
  await assert.rejects(writeWiki(updated, output, { check: true }), /out of date/);
  assert.ok((await readdir(output)).includes('Authoring.md'));
  assert.deepEqual(await writeWiki(updated, output), { pages: 2, written: 1, removed: 1 });
  assert.equal(await readFile(join(output, 'Community.md'), 'utf8'), 'Community notes');
  await rm(join(output, 'Home.md'));
  await symlink(join(output, 'Community.md'), join(output, 'Home.md'));
  await assert.rejects(writeWiki(updated, output), /filename conflict/);
  assert.equal(await readFile(join(output, 'Community.md'), 'utf8'), 'Community notes');
});
