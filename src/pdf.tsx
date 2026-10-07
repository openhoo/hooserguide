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
import {
  presentationChapters,
  screenLabel,
  screenLayout,
  comparisonImage,
  sameGuidance,
} from './responsive.js';
import { resolveManualTheme } from './themes.js';
import { badgeTextColor } from './annotations.js';

/** pdfcn components are vendored as intended by its registry model. */
export async function renderPdf(report: RunReport, directory: string): Promise<void> {
  report = reportSchema.parse(report) as RunReport;
  requireSuccessfulEvidence(report);
  await verifyReportImages(report, directory);
  const branding = brandingSchema.parse(report.branding ?? {});
  const theme = resolveManualTheme(report.manual?.theme, branding);
  const colors = theme.colors;
  const accent = colors.primary;
  const documentTheme = {
    ...professionalTheme,
    name: theme.name,
    colors: {
      ...professionalTheme.colors,
      foreground: colors.foreground,
      background: colors.surface,
      muted: colors.muted,
      mutedForeground: colors.mutedForeground,
      primary: colors.accentForeground,
      primaryForeground: badgeTextColor(colors.accentForeground),
      border: colors.border,
      warning: colors.warning,
    },
    typography: {
      ...professionalTheme.typography,
      heading: { ...professionalTheme.typography.heading, fontFamily: 'Helvetica' },
    },
  };
  const pageStyle = { backgroundColor: colors.surface, color: colors.foreground };
  // Page styles cover the content area. A solid background image also paints margins
  // and is inherited by native overflow pages.
  const pageBackground = `data:image/png;base64,${(
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: colors.surface },
    })
      .png()
      .toBuffer()
  ).toString('base64')}`;
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
  const presented = presentationChapters(report);
  const chapterBookmark = (index: number) => `${index + 1}. ${presented[index]!.title}`;
  const pages: ReactNode[] = [];
  const figures: { id: string; slices: { top: number; height: number }[] }[] = [];
  // Register Fixed before flowing content so native overflow pages inherit the footer.
  const footer = (
    <Fixed position="footer">
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 }}>
        <Text variant="xs" color="mutedForeground" noMargin>
          {branding.name ?? 'hooserguide'} · {report.title}
        </Text>
        <PageNumber align="right" size="xs" format={l.pageNumber} />
      </View>
    </Fixed>
  );
  pages.push(
    <Page
      key="cover"
      size={geometry.size}
      margin={geometry.margin}
      style={pageStyle}
      backgroundImage={pageBackground}
      backgroundSize="fill"
    >
      {footer}
      <View style={{ paddingTop: 12 }}>
        <Text variant="sm" weight="bold" color="primary" transform="uppercase">
          {l.guide}
        </Text>
        <Heading level={1} style={{ fontSize: 28, marginTop: 8 }}>
          {report.title}
        </Heading>
        <Text color="mutedForeground">{branding.subtitle ?? l.subtitle}</Text>
        <View style={{ borderTopWidth: 3, borderColor: accent, marginTop: 16, paddingTop: 12 }}>
          <Text variant="sm">
            {presented.length} {l.chapters}
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
          presented.map((c, i) => (
            <View key={i} href={`#${chapterBookmark(i)}`}>
              <Text variant="sm" color="primary" decoration="underline">
                {i + 1}. {c.title}
              </Text>
            </View>
          ))}
      </View>
    </Page>,
  );
  for (const [i, chapter] of presented.entries()) {
    pages.push(
      <Page
        key={`chapter-${i}`}
        size={geometry.size}
        margin={geometry.margin}
        style={pageStyle}
        backgroundImage={pageBackground}
        backgroundSize="fill"
      >
        {footer}
        <Text variant="sm" weight="bold" color="primary">
          {l.chapter.toUpperCase()} {String(i + 1).padStart(2, '0')}
        </Text>
        <View bookmark={chapterBookmark(i)}>
          <Heading level={1}>{chapter.title}</Heading>
        </View>
        <Text color="mutedForeground">{chapter.description}</Text>
        {chapter.variants.some((v) => !sameGuidance(chapter, v)) ? (
          <Heading level={3}>{screenLabel(chapter.variant!)}</Heading>
        ) : null}
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
              borderColor: callout.kind === 'warning' ? colors.warning : colors.accentForeground,
              backgroundColor:
                callout.kind === 'warning'
                  ? colors.warningBackground
                  : callout.kind === 'tip'
                    ? colors.tipBackground
                    : colors.muted,
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
    if (chapter.variants.length > 1 && screenLayout(report) === 'side-by-side') {
      for (const [j, capture] of chapter.captures.entries()) {
        const overview = await comparisonImage(chapter.variants, j, directory);
        const height = Math.min(
          geometry.contentHeight - 210,
          (overview.height * pageWidth) / overview.width,
        );
        pages.push(
          <Page
            key={`comparison-${i}-${j}`}
            size={geometry.size}
            margin={geometry.margin}
            style={pageStyle}
            backgroundImage={pageBackground}
            backgroundSize="fill"
          >
            {footer}
            <Text variant="xs" color="primary" weight="bold">
              {l.figure} {i + 1}.{j + 1} · {l.screens}
            </Text>
            <Heading level={3}>{capture.title}</Heading>
            <Text variant="sm">
              {chapter.variants.map((v) => screenLabel(v.variant!)).join('  |  ')}
            </Text>
            <PdfImage
              src={`data:image/png;base64,${overview.bytes.toString('base64')}`}
              alt={`${capture.title} · ${chapter.variants.map((v) => screenLabel(v.variant!)).join(' / ')}`}
              variant="bordered"
              width={pageWidth}
              height={height}
              fit="contain"
            />
            <Text variant="sm" color="mutedForeground">
              {l.screenDetails}
            </Text>
          </Page>,
        );
      }
    }
    for (const variant of chapter.variants) {
      if (!sameGuidance(chapter, variant))
        pages.push(
          <Page
            key={`guidance-${i}-${variant.variant!.profile}`}
            size={geometry.size}
            margin={geometry.margin}
            style={pageStyle}
            backgroundImage={pageBackground}
            backgroundSize="fill"
          >
            {footer}
            <Heading level={3}>{screenLabel(variant.variant!)}</Heading>
            <Text>{variant.description}</Text>
            {(variant.prerequisites ?? []).map((text, n) => (
              <Text key={`pre-${n}`} variant="sm">
                {l.prerequisites}: {text}
              </Text>
            ))}
            {variant.instructions.map((text, n) => (
              <Text key={n}>
                {n + 1}. {text}
              </Text>
            ))}
            {(variant.callouts ?? []).map((callout, n) => (
              <Text key={`callout-${n}`} variant="sm">
                {l[callout.kind]}: {callout.text}
              </Text>
            ))}
          </Page>,
        );
      for (const [j, capture] of variant.captures.entries()) {
        const image = await readRunArtifact(directory, capture.image, 64 * 1024 * 1024);
        // Long screenshots are split into readable page-sized images, without shrinking or cropping content away.
        // A modestly taller single figure avoids a nearly empty continuation page.
        const imageWidth = variant.variant ? Math.min(pageWidth, capture.width * 0.75) : pageWidth;
        const scaledHeight = (capture.height * imageWidth) / capture.width;
        const maximum = Math.min(460, Math.max(140, geometry.contentHeight - 240));
        const imageBudget = scaledHeight <= maximum ? maximum : Math.max(100, maximum - 60);
        const maxSliceHeight = Math.max(1, Math.floor((imageBudget * capture.width) / imageWidth));
        const slices = planImageSlices(capture, maxSliceHeight);
        const total = slices.length;
        figures.push({ id: capture.id, slices });
        for (const [slice, { top, height }] of slices.entries()) {
          const data = await sharp(image)
            .extract({ left: 0, top, width: capture.width, height })
            .png()
            .toBuffer();
          pages.push(
            <Page
              key={`figure-${i}-${variant.variant?.profile ?? 'default'}-${j}-${slice}`}
              size={geometry.size}
              margin={geometry.margin}
              style={pageStyle}
              backgroundImage={pageBackground}
              backgroundSize="fill"
            >
              {footer}
              <Text variant="xs" weight="bold" color="primary">
                {l.figure.toUpperCase()} {i + 1}.{j + 1}
                {variant.variant ? ` · ${screenLabel(variant.variant)}` : ''}
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
                alt={[
                  capture.title,
                  variant.variant ? screenLabel(variant.variant) : '',
                  total > 1 ? `${l.part} ${slice + 1}/${total}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                variant="bordered"
                width={imageWidth}
                height={(height * imageWidth) / capture.width}
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
                          color: colors.foreground,
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
