import { verifyReportImages, readRunArtifact } from './evidence.js';
import { reportSchema, requireSuccessfulEvidence } from './report.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { Document, Page, Fixed, View, Strong } from '@formepdf/react';
import { renderDocumentWithLayout } from '@formepdf/core';
import sharp from 'sharp';
import { PdfcnThemeProvider } from './pdfcn/components/pdf/theme-provider.js';
import { professionalTheme } from './pdfcn/lib/pdf-themes/professional.js';
import { Text } from './pdfcn/components/pdf/text/text.js';
import { Heading } from './pdfcn/components/pdf/heading/heading.js';
import { PdfImage } from './pdfcn/components/pdf/pdf-image/pdf-image.js';
import { PageNumber } from './pdfcn/components/pdf/page-number/page-number.js';
import type { RunReport } from './types.js';
import { brandingSchema } from './config.js';
import { planImageSlices } from './pdf-slices.js';
import { manualLabels, pageGeometry } from './manual.js';
import { badgeTextColor } from './annotations.js';

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

/** pdfcn components are vendored as intended by its registry model. */
export async function renderPdf(report: RunReport, directory: string): Promise<void> {
  report = reportSchema.parse(report) as RunReport;
  requireSuccessfulEvidence(report);
  await verifyReportImages(report, directory);
  const branding = brandingSchema.parse(report.branding ?? {});
  const accent = branding.accentColor ?? '#075e59';
  const documentTheme = { ...theme, colors: { ...theme.colors, primary: accent } };
  const l = manualLabels(report.language);
  const geometry = pageGeometry(report.manual);
  const pageWidth = geometry.contentWidth;
  const document = report.document ?? {};
  const metadata = [
    ...(document.version ? [`${l.version}: ${document.version}`] : []),
    ...(document.productVersion ? [`${l.productVersion}: ${document.productVersion}`] : []),
    ...(document.audience ? [`${l.audience}: ${document.audience}`] : []),
    ...(report.manual?.showGeneratedAt !== false
      ? [`${l.generated}: ${report.generatedAt.slice(0, 10)}`]
      : []),
    ...(report.manual?.showGeneratedAt !== false && report.rebuiltAt
      ? [`${l.rebuilt}: ${report.rebuiltAt.slice(0, 10)}`]
      : []),
  ];
  const pages: ReactNode[] = [];
  const figures: { id: string; slices: { top: number; height: number }[] }[] = [];
  // Register Fixed before flowing content so native overflow pages inherit the footer.
  const footer = (
    <Fixed position="footer">
      <View style={{ borderTopWidth: 1, borderColor: '#dce5e9', paddingTop: 10 }}>
        <Text variant="xs" color="mutedForeground" noMargin>
          {branding.name ?? 'hooserguide'} · {report.title}
        </Text>
        <PageNumber align="right" size="xs" format={l.pageNumber} />
      </View>
    </Fixed>
  );
  pages.push(
    <Page key="cover" size={geometry.size} margin={geometry.margin}>
      {footer}
      <View style={{ paddingTop: geometry.size.width > geometry.size.height ? 28 : 88 }}>
        <Text variant="sm" weight="bold" color="primary" transform="uppercase">
          {l.guide}
        </Text>
        <Heading level={1} style={{ fontSize: 38, marginTop: 16 }}>
          {report.title}
        </Heading>
        <Text color="mutedForeground">{branding.subtitle ?? l.subtitle}</Text>
        <View style={{ borderTopWidth: 3, borderColor: accent, marginTop: 28, paddingTop: 18 }}>
          <Text variant="sm">
            {report.chapters.length} {l.chapters}
          </Text>
          {metadata.map((text, i) => (
            <Text key={i} variant="sm">
              {text}
            </Text>
          ))}
          {document.summary ? <Text color="mutedForeground">{document.summary}</Text> : null}
        </View>
        {report.manual?.contents !== false ? <Heading level={3}>{l.contents}</Heading> : null}
        {report.manual?.contents !== false &&
          report.chapters.map((c, i) => (
            <Text key={i} variant="sm">
              {i + 1}. {c.title}
            </Text>
          ))}
      </View>
    </Page>,
  );
  for (const [i, chapter] of report.chapters.entries()) {
    pages.push(
      <Page key={`chapter-${i}`} size={geometry.size} margin={geometry.margin}>
        {footer}
        <Text variant="sm" weight="bold" color="primary">
          {l.chapter.toUpperCase()} {String(i + 1).padStart(2, '0')}
        </Text>
        <Heading level={1}>{chapter.title}</Heading>
        <Text color="mutedForeground">{chapter.description}</Text>
        {chapter.prerequisites?.length ? (
          <>
            <Heading level={3}>{l.prerequisites}</Heading>
            {chapter.prerequisites.map((text, n) => (
              <Text key={n} variant="sm">
                {n + 1}. {text}
              </Text>
            ))}
          </>
        ) : null}
        {(chapter.callouts ?? []).map((callout, n) => (
          <View
            key={`callout-${n}`}
            wrap
            style={{
              padding: 14,
              marginBottom: 12,
              borderLeftWidth: 3,
              borderColor: callout.kind === 'warning' ? '#b45309' : accent,
              backgroundColor: callout.kind === 'warning' ? '#fffbeb' : '#f1f5f9',
            }}
          >
            <Text variant="sm" noMargin>
              <Strong>{l[callout.kind]}: </Strong>
              {callout.text}
            </Text>
          </View>
        ))}
        {chapter.instructions.map((text, n) => (
          <Text key={n}>
            {n + 1}. {text}
          </Text>
        ))}
      </Page>,
    );
    for (const [j, capture] of chapter.captures.entries()) {
      const image = await readRunArtifact(directory, capture.image, 64 * 1024 * 1024);
      // Long screenshots are split into readable page-sized images, without shrinking or cropping content away.
      // A modestly taller single figure avoids a nearly empty continuation page.
      const scaledHeight = (capture.height * pageWidth) / capture.width;
      const maximum = Math.min(460, Math.max(140, geometry.contentHeight - 240));
      const imageBudget = scaledHeight <= maximum ? maximum : Math.max(100, maximum - 60);
      const maxSliceHeight = Math.max(1, Math.floor((imageBudget * capture.width) / pageWidth));
      const slices = planImageSlices(capture, maxSliceHeight);
      const total = slices.length;
      figures.push({ id: capture.id, slices });
      for (const [slice, { top, height }] of slices.entries()) {
        const data = await sharp(image)
          .extract({ left: 0, top, width: capture.width, height })
          .png()
          .toBuffer();
        pages.push(
          <Page key={`figure-${i}-${j}-${slice}`} size={geometry.size} margin={geometry.margin}>
            {footer}
            <Text variant="xs" weight="bold" color="primary">
              {l.figure.toUpperCase()} {i + 1}.{j + 1}
              {total > 1 ? ` · ${l.part.toUpperCase()} ${slice + 1}/${total}` : ''}
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
            {capture.marks
              .filter(
                (m) =>
                  (m.label || m.caption) &&
                  m.bounds.y < top + height &&
                  m.bounds.y + m.bounds.height > top,
              )
              .map((m, n) => (
                <Text key={n} variant="sm" style={{ marginTop: n === 0 ? 16 : 0 }}>
                  {m.label ? (
                    <Strong
                      style={{
                        color:
                          badgeTextColor(m.color ?? '#e11d48') === '#ffffff'
                            ? (m.color ?? '#e11d48')
                            : '#142636',
                      }}
                    >
                      {m.label} ·{' '}
                    </Strong>
                  ) : null}
                  {m.caption ?? ''}
                </Text>
              ))}
          </Page>,
        );
      }
    }
  }
  const doc = (
    <PdfcnThemeProvider theme={documentTheme}>
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
    JSON.stringify(
      {
        pages: result.layout.pages.length,
        warnings: result.warnings,
        figures,
        page: { ...geometry.size, margin: geometry.margin },
      },
      null,
      2,
    ),
  );
  if (result.warnings.some((w) => w.startsWith('render defect:')))
    throw new Error(`PDF content audit failed: ${result.warnings.join('; ')}`);
  await writeFile(join(directory, 'handbook.pdf'), result.pdf);
}
