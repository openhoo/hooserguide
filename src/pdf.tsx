import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { Document, Page, Fixed, View } from '@formepdf/react';
import { renderDocumentWithLayout } from '@formepdf/core';
import sharp from 'sharp';
import { PdfcnThemeProvider } from './pdfcn/components/pdf/theme-provider.js';
import { professionalTheme } from './pdfcn/lib/pdf-themes/professional.js';
import { Text } from './pdfcn/components/pdf/text/text.js';
import { Heading } from './pdfcn/components/pdf/heading/heading.js';
import { PdfImage } from './pdfcn/components/pdf/pdf-image/pdf-image.js';
import { PageNumber } from './pdfcn/components/pdf/page-number/page-number.js';
import type { RunReport } from './types.js';

const theme = {
  ...professionalTheme,
  colors: {
    ...professionalTheme.colors,
    foreground: '#142636',
    primary: '#075e59',
    mutedForeground: '#52667a',
  },
  typography: {
    ...professionalTheme.typography,
    heading: { ...professionalTheme.typography.heading, fontFamily: 'Helvetica' },
  },
};
const pageWidth = 499.28; // A4 minus 48pt margins on each side.

/** pdfcn components are vendored as intended by its registry model. */
export async function renderPdf(report: RunReport, directory: string): Promise<void> {
  if (report.status !== 'passed') throw new Error('Cannot export PDF from a failed run');
  const pages: ReactNode[] = [];
  const footer = (
    <Fixed position="footer">
      <View style={{ borderTopWidth: 1, borderColor: '#dce5e9', paddingTop: 10 }}>
        <Text variant="xs" color="mutedForeground" noMargin>
          hooserguide · {report.title}
        </Text>
        <PageNumber align="right" size="xs" />
      </View>
    </Fixed>
  );
  pages.push(
    <Page key="cover" size="A4" margin={48}>
      <View style={{ paddingTop: 88 }}>
        <Text variant="sm" weight="bold" color="primary" transform="uppercase">
          User guide
        </Text>
        <Heading level={1} style={{ fontSize: 38, marginTop: 16 }}>
          {report.title}
        </Heading>
        <Text color="mutedForeground">Verified walkthroughs with annotated screenshots.</Text>
        <View style={{ borderTopWidth: 3, borderColor: '#075e59', marginTop: 28, paddingTop: 18 }}>
          <Text variant="sm">
            Generated {report.generatedAt.slice(0, 10)} · {report.chapters.length} chapters
          </Text>
        </View>
        <Heading level={3}>Contents</Heading>
        {report.chapters.map((c, i) => (
          <Text key={i} variant="sm">
            {i + 1}. {c.title}
          </Text>
        ))}
      </View>
      {footer}
    </Page>,
  );
  for (const [i, chapter] of report.chapters.entries()) {
    pages.push(
      <Page key={`chapter-${i}`} size="A4" margin={48}>
        <Text variant="sm" weight="bold" color="primary">
          CHAPTER {String(i + 1).padStart(2, '0')}
        </Text>
        <Heading level={1}>{chapter.title}</Heading>
        <Text color="mutedForeground">{chapter.description}</Text>
        {chapter.instructions.map((text, n) => (
          <Text key={n}>
            {n + 1}. {text}
          </Text>
        ))}
        {footer}
      </Page>,
    );
    for (const [j, capture] of chapter.captures.entries()) {
      const image = await readFile(join(directory, capture.image));
      // Long screenshots are split into readable page-sized images, without shrinking or cropping content away.
      const maxSliceHeight = Math.max(1, Math.floor((400 * capture.width) / pageWidth));
      const total = Math.ceil(capture.height / maxSliceHeight);
      for (let slice = 0; slice < total; slice++) {
        const top = slice * maxSliceHeight,
          height = Math.min(maxSliceHeight, capture.height - top);
        const data = await sharp(image)
          .extract({ left: 0, top, width: capture.width, height })
          .png()
          .toBuffer();
        pages.push(
          <Page key={`figure-${i}-${j}-${slice}`} size="A4" margin={48}>
            <Text variant="xs" weight="bold" color="primary">
              FIGURE {i + 1}.{j + 1}
              {total > 1 ? ` · PART ${slice + 1}/${total}` : ''}
            </Text>
            <Heading level={3} style={{ marginTop: 12 }}>
              {capture.title}
            </Heading>
            {slice === 0 && capture.description ? (
              <Text variant="sm" color="mutedForeground">
                {capture.description}
              </Text>
            ) : null}
            <PdfImage
              src={`data:image/png;base64,${data.toString('base64')}`}
              variant="bordered"
              width={pageWidth}
              height={(height * pageWidth) / capture.width}
              fit="contain"
            />
            {slice === total - 1 ? (
              <View style={{ marginTop: 16 }}>
                {capture.marks
                  .filter((m) => m.label || m.caption)
                  .map((m, n) => (
                    <Text key={n} variant="sm">
                      <Text weight="bold" color="destructive">
                        {m.label ?? String(n + 1)}{' '}
                      </Text>
                      {m.caption ?? ''}
                    </Text>
                  ))}
              </View>
            ) : null}
            {footer}
          </Page>,
        );
      }
    }
  }
  const doc = (
    <PdfcnThemeProvider theme={theme}>
      <Document
        title={report.title}
        creator="hooserguide (pdfcn / Forme)"
        lang={report.language}
        tagged
      >
        {pages}
      </Document>
    </PdfcnThemeProvider>
  );
  const result = await renderDocumentWithLayout(doc, { auditContent: true });
  await writeFile(
    join(directory, 'pdf-layout.json'),
    JSON.stringify({ pages: result.layout.pages.length, warnings: result.warnings }, null, 2),
  );
  if (result.warnings.some((w) => w.startsWith('render defect:')))
    throw new Error(`PDF content audit failed: ${result.warnings.join('; ')}`);
  await writeFile(join(directory, 'handbook.pdf'), result.pdf);
}
