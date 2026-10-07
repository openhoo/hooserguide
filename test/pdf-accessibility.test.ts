import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { build } from '../src/build.js';

test('tagged PDF screenshots retain descriptive alternatives, including continuation parts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-pdf-alt-'));
  try {
    const result = await build('docs/demo', { output: root });
    assert.equal(result.report.status, 'passed', result.report.exportError);
    const layout = JSON.parse(
      await readFile(join(result.directory, 'pdf-layout.json'), 'utf8'),
    ) as {
      figures: { id: string; slices: { top: number; height: number }[] }[];
    };
    const expected = result.report.chapters.flatMap((chapter) =>
      chapter.captures.flatMap((capture) => {
        const slices = layout.figures.find((figure) => figure.id === capture.id)!.slices;
        return slices.map(
          (_, index) =>
            capture.title + (slices.length > 1 ? ` · Part ${index + 1}/${slices.length}` : ''),
        );
      }),
    );
    assert.ok(
      expected.some((label) => label.includes('Part 2/')),
      'Fixture must exercise screenshot continuations',
    );
    const loading = getDocument({
      data: new Uint8Array(await readFile(result.artifacts.pdf!)),
      useSystemFonts: true,
    });
    const pdf = await loading.promise;
    try {
      const figures: string[] = [];
      const headings: string[] = [];
      const visit = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const entry = node as { role?: string; alt?: string; children?: unknown[] };
        if (/^H[1-6]$/.test(entry.role ?? '')) headings.push(entry.role!);
        if (entry.role === 'Figure') {
          assert.ok(entry.alt, 'Tagged screenshot figure has no alternative text');
          figures.push(entry.alt);
        }
        entry.children?.forEach(visit);
      };
      for (let page = 1; page <= pdf.numPages; page++)
        visit(await (await pdf.getPage(page)).getStructTree());
      assert.deepEqual(figures, expected);
      assert.equal(
        headings.filter((role) => role === 'H1').length,
        1 + result.report.chapters.length,
        'Cover and chapter titles must be navigable PDF headings',
      );
      assert.ok(
        headings.includes('H3'),
        'Contents and figure headings must retain their semantic level',
      );
    } finally {
      await loading.destroy();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
