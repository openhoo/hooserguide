import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { layoutAnnotations, type Rectangle } from '../src/annotations.js';
import { run } from '../src/runner.js';

const html = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; min-height: 520px; background: #edf2f8; color: #152a3b; font: 16px system-ui }
    #settings { position: absolute; box-sizing: border-box; left: 52px; top: 53px; width: 536px;
      height: 212px; background: white; border: 1px solid #dbe4ef; border-radius: 14px }
    h1 { margin: 22px 28px; font-size: 22px }
    #note { position: absolute; left: 28px; top: 64px; margin: 0; padding: 8px 11px;
      background: #edf3fc; color: #254069; border-radius: 6px }
    #save { appearance: none; position: absolute; box-sizing: border-box; left: 254px;
      top: 128px; width: 124px; height: 44px; border: 0; border-radius: 7px;
      background: #075f56; color: white; font: 600 16px system-ui }
  </style><section id="settings"><h1>Teamfreigabe</h1>
    <p id="note">Die Einstellungen gelten für das gesamte Team.</p>
    <button id="save">Speichern</button>
  </section></html>`;

const styles = [
  { title: 'Feiner Pfeil', width: 1, headSize: 6, head: 'open' },
  { title: 'Mittlerer Pfeil', width: 2, headSize: 9, head: 'filled' },
  { title: 'Kräftiger Pfeil', width: 3.5, headSize: 12, head: 'filled' },
] as const;
const leaderLength = 96;
const noRoomLength = 222;
const caption = 'Speichern übernimmt die Änderungen für das Team.';

function readPixels(file: string) {
  return sharp(file).ensureAlpha().raw().toBuffer();
}

function sameRegion(raw: Buffer, annotated: Buffer, width: number, target: Rectangle) {
  for (let y = target.y; y < target.y + target.height; y++) {
    const start = (y * width + target.x) * 4;
    if (
      !raw
        .subarray(start, start + target.width * 4)
        .equals(annotated.subarray(start, start + target.width * 4))
    )
      return false;
  }
  return true;
}

function fixtureCapture(title: string, leader: object, kind?: 'arrow') {
  return `    And I capture "${title}"
      """json
      ${JSON.stringify({
        description: 'A zeigt auf Speichern. Der Text der Schaltfläche bleibt sichtbar.',
        focus: '#settings',
        padding: 20,
        marks: [{ target: 'role=button:Speichern', kind, label: 'A', caption, leader }],
      })}
      """
`;
}

test('letter leaders draw distinct strokes in a real screenshot and survive PDF export', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-letter-leaders-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createServer((_request, reply) => {
    reply.setHeader('Content-Type', 'text/html; charset=utf-8');
    reply.end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise<void>((ok) => server.close(() => ok())));
  const feature = join(root, 'teamfreigabe.feature');
  await writeFile(
    feature,
    `Feature: Teamfreigabe
  Einstellungen für das gesamte Team prüfen und speichern.
  Scenario: Pfeilstile vergleichen
    Given I open "/"
    Then "role=button:Speichern" is enabled
    And I explain "Prüfen Sie den Hinweis. Wählen Sie anschließend Speichern."
${styles
  .map(({ title, width, headSize, head }, i) =>
    fixtureCapture(
      title,
      { side: 'right', length: leaderLength, width, headSize, head },
      i === 1 ? 'arrow' : undefined,
    ),
  )
  .join('')}  Scenario: Zu wenig Platz auf der gewählten Seite
    Given I open "/"
${fixtureCapture('Kein Platz rechts', { side: 'right', length: noRoomLength, width: 2, headSize: 9, head: 'filled' })}`,
  );
  const port = (server.address() as { port: number }).port;
  const config = {
    title: 'Buchstabenmarken mit Pfeilen',
    language: 'de',
    baseURL: `http://127.0.0.1:${port}`,
    features: [feature],
    output: root,
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 2,
  };
  const result = await run({ ...config, scenario: 'Pfeilstile vergleichen' });
  assert.equal(
    result.report.status,
    'passed',
    result.report.exportError ?? result.report.chapters[0]?.error,
  );
  const captures = result.report.chapters[0]!.captures;
  assert.equal(captures.length, styles.length);
  assert.equal(
    new Set(captures.map((shot) => shot.rawSha256)).size,
    1,
    'The variants must use the same image',
  );

  const shaftInk: number[] = [];
  for (const [i, shot] of captures.entries()) {
    const style = styles[i]!;
    const mark = shot.marks[0]!;
    const target = mark.bounds;
    assert.equal(shot.width, 576, 'The focus image uses CSS pixels at device scale 2');
    assert.equal(mark.label, 'A');
    assert.deepEqual(mark.leader, {
      side: 'right',
      length: leaderLength,
      width: style.width,
      headSize: style.headSize,
      head: style.head,
    });
    const { arrow, badge } = layoutAnnotations(shot.width, shot.height, shot.marks)[0]!;
    assert.ok(arrow && badge);
    assert.ok('head' in arrow);
    assert.equal(arrow.head, style.head);
    assert.equal(arrow.base.x - arrow.to.x, style.headSize);
    assert.equal(arrow.from.y, arrow.to.y);
    assert.equal(arrow.to.y, target.y + target.height / 2);
    assert.ok(
      Math.abs(arrow.from.x - badge.x) <= 1,
      'The leader starts at the left rim of badge A',
    );
    assert.equal(
      arrow.from.x - arrow.to.x,
      leaderLength,
      'The visible leader has the configured length',
    );
    assert.ok(
      arrow.to.x >= target.x + target.width,
      'The tip points to the target without covering it',
    );

    const [raw, annotated] = await Promise.all([
      readPixels(join(result.directory, shot.raw)),
      readPixels(join(result.directory, shot.image)),
    ]);
    assert.equal(
      sameRegion(raw, annotated, shot.width, target),
      true,
      'The button text and edges must stay intact',
    );
    assert.equal(
      sameRegion(raw, annotated, shot.width, { ...target, x: target.x - 8, width: 8 }),
      true,
      'An arrow alone should not add a box',
    );
    const shaftX = Math.round((arrow.from.x + arrow.to.x) / 2);
    let ink = 0;
    for (let y = arrow.from.y - 8; y <= arrow.from.y + 8; y++) {
      const green = (y * shot.width + shaftX) * 4 + 1;
      ink += raw[green]! - annotated[green]!;
    }
    shaftInk.push(ink);

    // The inner circle excludes the white badge outline; light pixels here form the letter A.
    let letterPixels = 0;
    const cx = Math.round(badge.x + badge.width / 2),
      cy = Math.round(badge.y + badge.height / 2);
    for (let y = cy - 8; y <= cy + 8; y++) {
      for (let x = cx - 8; x <= cx + 8; x++) {
        const p = (y * shot.width + x) * 4;
        if (annotated[p]! > 220 && annotated[p + 1]! > 220 && annotated[p + 2]! > 220)
          letterPixels++;
      }
    }
    assert.ok(letterPixels > 10, `Badge A must be legible in ${style.title}`);
  }
  assert.ok(
    shaftInk[0]! > 0 && shaftInk[0]! < shaftInk[1]! && shaftInk[1]! < shaftInk[2]!,
    `The rendered widths must be distinguishable: ${shaftInk.join(', ')}`,
  );

  assert.ok(result.artifacts.pdf);
  const loading = getDocument({
    data: new Uint8Array(await readFile(result.artifacts.pdf)),
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  try {
    const figurePages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      if (styles.some(({ title }) => text.includes(title))) figurePages.push(text);
      page.cleanup();
    }
    assert.equal(figurePages.length, 3);
    for (const text of figurePages) assert.match(text, new RegExp(`\\bA\\s*·\\s*${caption}`));
  } finally {
    await loading.destroy();
  }

  if (process.env.HOOSERGUIDE_BROWSER_ARTIFACTS) {
    const destination = resolve(process.env.HOOSERGUIDE_BROWSER_ARTIFACTS, 'letter-leaders');
    await mkdir(destination, { recursive: true });
    await cp(result.directory, destination, { recursive: true });
  }

  const tooLong = {
    ...captures[0]!.marks[0]!,
    leader: { side: 'left', length: noRoomLength },
  } as const;
  assert.ok(layoutAnnotations(captures[0]!.width, captures[0]!.height, [tooLong])[0]?.arrow);
  const failure = await run({ ...config, scenario: 'Zu wenig Platz', pdf: false });
  assert.equal(failure.report.status, 'failed');
  assert.equal(failure.report.chapters[0]?.captures.length, 0);
  assert.equal(failure.artifacts.html, undefined);
  assert.match(failure.report.chapters[0]?.error ?? '', /padding|shorter|reduce|length|side/i);
});
