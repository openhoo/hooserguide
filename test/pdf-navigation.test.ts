import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { build } from '../src/build.js';
import type { RunReport } from '../src/types.js';

for (const layout of ['portrait', 'landscape', 'overflow', 'no-contents'] as const) {
  test(`PDF contents links and bookmarks resolve to actual chapter pages (${layout})`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hooserguide-pdf-navigation-'));
    try {
      const source = join(root, 'source');
      await cp('docs/demo', source, { recursive: true });
      const report = JSON.parse(await readFile(join(source, 'report.json'), 'utf8')) as RunReport;
      if (layout === 'overflow') {
        // Duplicate titles must not send both links to the first chapter.
        report.chapters.forEach((chapter) => {
          chapter.title = 'Repeated chapter title';
        });
        report.document = {
          ...report.document,
          summary: 'Read the handbook before using the workspace. '.repeat(180),
        };
        report.chapters[0]!.instructions = Array.from(
          { length: 60 },
          (_, index) =>
            `Instruction ${index + 1}. ` +
            'Configure the workspace and verify the saved result. '.repeat(5),
        );
      }
      await writeFile(join(source, 'report.json'), JSON.stringify(report));
      const result = await build(source, {
        output: join(root, 'built'),
        manual: {
          orientation: layout === 'landscape' ? 'landscape' : 'portrait',
          contents: layout !== 'no-contents',
        },
      });
      assert.equal(result.report.status, 'passed', result.report.exportError);
      const loading = getDocument({
        data: new Uint8Array(await readFile(result.artifacts.pdf!)),
        useSystemFonts: true,
      });
      const pdf = await loading.promise;
      try {
        const outline = await pdf.getOutline();
        assert.equal(outline?.length, report.chapters.length);
        const annotations = [];
        const chapterPages: number[] = [];
        for (let number = 1; number <= pdf.numPages; number++) {
          const page = await pdf.getPage(number);
          annotations.push(
            ...(await page.getAnnotations()).filter((annotation) => annotation.subtype === 'Link'),
          );
          const text = (await page.getTextContent()).items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ');
          for (let index = 0; index < report.chapters.length; index++) {
            if (text.includes(`CHAPTER ${String(index + 1).padStart(2, '0')}`))
              chapterPages[index] = number;
          }
        }
        assert.equal(annotations.length, layout === 'no-contents' ? 0 : report.chapters.length);
        for (const [index, chapter] of report.chapters.entries()) {
          const title = `${index + 1}. ${chapter.title}`;
          const bookmark = outline![index]!;
          assert.equal(bookmark.title, title);
          assert.ok(Array.isArray(bookmark.dest));
          assert.equal((await pdf.getPageIndex(bookmark.dest[0])) + 1, chapterPages[index]);
          if (layout !== 'no-contents') {
            const annotation = annotations.find((item) => item.overlaidText === title);
            assert.ok(annotation, `Missing clickable contents entry: ${title}`);
            assert.equal(annotation.url, undefined, 'Contents must jump inside the PDF');
            assert.deepEqual(annotation.dest, bookmark.dest);
            assert.ok(
              annotation.rect[2]! > annotation.rect[0]! &&
                annotation.rect[3]! > annotation.rect[1]!,
              'Clickable area must cover visible text',
            );
          }
        }
        if (layout === 'overflow') {
          assert.ok(chapterPages[0]! > 2, 'Cover must overflow for this regression case');
          assert.ok(
            chapterPages[1]! > chapterPages[0]! + 5,
            'First chapter must overflow before the second destination',
          );
        }
      } finally {
        await loading.destroy();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
