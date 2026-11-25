import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { run } from '../src/runner.js';

test('PDF keeps a nearly fitting figure and its legend together, but still slices a tall figure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-pdf-fit-'));
  try {
    const feature = join(root, 'fit.feature'),
      plugin = join(root, 'panel.mjs');
    await writeFile(
      plugin,
      `export function register(r) {
      r.define(/^I open a (\\d+) pixel panel$/, async ({page}, height) => {
        await page.setContent('<section style="box-sizing:border-box;width:360px;height:'+height+'px;display:flex;flex-direction:column;justify-content:space-between"><h1>Preferences</h1><label>Email</label><button>Save</button></section>');
      });
    }`,
    );
    const sizes = [400, 475, 900];
    const spec = JSON.stringify({
      focus: 'section',
      padding: 0,
      description: 'Review your preferences before saving.',
      marks: [
        { target: 'h1', label: 'A', caption: 'Preferences panel.' },
        { target: 'label', label: 'B', caption: 'Choose email notifications.' },
        { target: 'button', label: 'S', caption: 'Save the changes.' },
      ],
    });
    await writeFile(
      feature,
      'Feature: Read the panel\n Scenario: Check the controls\n' +
        sizes
          .map(
            (h) =>
              `  Given I open a ${h} pixel panel\n  And I capture "Panel ${h}"\n   """json\n   ${spec}\n   """\n`,
          )
          .join(''),
    );
    const result = await run({
      title: 'Preferences',
      baseURL: 'http://localhost',
      output: join(root, 'runs'),
      features: [feature],
      plugins: [plugin],
      manual: { pageSize: 'Letter', orientation: 'landscape', margin: 36 },
    });
    assert.equal(result.report.status, 'passed', result.report.exportError);
    const layout = JSON.parse(await readFile(join(result.directory, 'pdf-layout.json'), 'utf8'));
    const slices = layout.figures.map(
      (f: { slices: { top: number; height: number }[] }) => f.slices,
    );
    assert.deepEqual(slices.slice(0, 2), [[{ top: 0, height: 400 }], [{ top: 0, height: 475 }]]);
    assert.ok(slices[2].length > 1);
    let total = 0;
    for (const slice of slices[2]) {
      assert.equal(slice.top, total);
      total += slice.height;
    }
    assert.equal(total, 900);
    const loading = getDocument({
      data: new Uint8Array(await readFile(result.artifacts.pdf!)),
      useSystemFonts: true,
    });
    try {
      const pdf = await loading.promise;
      const pages = await Promise.all(
        Array.from({ length: pdf.numPages }, async (_, i) =>
          (await (await pdf.getPage(i + 1)).getTextContent()).items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' '),
        ),
      );
      const near = pages.filter((p) => p.includes('Panel 475'));
      assert.equal(near.length, 1);
      assert.match(near[0]!, /Preferences panel/);
      assert.match(near[0]!, /Choose email notifications/);
      assert.match(near[0]!, /Save the changes/);
      assert.doesNotMatch(near[0]!, /PART 1/);
      assert.ok(pages.some((p) => p.includes('Panel 900') && p.includes('PART 2/')));
    } finally {
      await loading.destroy();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
